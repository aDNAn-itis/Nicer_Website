"""
Updates the PostgreSQL database using psycopg2 to match the folder structure of the specified
directory found in config.txt
"""
import os
import re
import json
import argparse
import subprocess
from time import time
from io import StringIO
from threading import Lock
from typing import Callable
from functools import partial
from concurrent.futures import ThreadPoolExecutor

import psycopg2
import numpy as np
import pandas as pd
from numpy import ndarray
from psycopg2.extras import execute_values

from src.utils.utils import progress_bar
from nicer_website.settings import DATABASES, BASE_DIR


DB_CONFIG: dict[str, str] = {
    'host': DATABASES['default'].get('HOST', 'localhost'),
    'port': DATABASES['default'].get('PORT', '5432'),
    'dbname': DATABASES['default'].get('NAME', ''),
    'user': DATABASES['default'].get('USER', ''),
    'password': DATABASES['default'].get('PASSWORD', ''),
}


def create_table(data: dict[str, list[str | None]], batch_size: int = 10000) -> None:
    """
    Add folder and file data to the database, including additional metadata fields.

    Parameters
    ----------
    data : dict[str, list[str | None]]
        Dictionary containing the data to be inserted into the database, keys are column names and
        values are lists of corresponding values
    batch_size : int, default = 10000
        How many entries to insert into the database per execution
    """
    i: int
    df = pd.DataFrame.from_dict(data)
    df.fillna('null', inplace=True)

    # Connect to the PostgreSQL database
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            for i in range(0, len(df), batch_size):
                batch = df.iloc[i:i + batch_size]
                sio = StringIO()
                batch.to_csv(sio, index=False, header=False)
                sio.seek(0)

                cur.copy_expert(
                    f"COPY file_mgr_item ({', '.join(df)}) FROM STDIN WITH "
                    f"(FORMAT CSV, NULL 'null');",
                    sio,
                )
                progress_bar(i + len(batch), len(df))


def table_insert(data: dict[str, list[str | None]], batch_size: int = 10000) -> None:
    """
    Add folder and file data to the database, including additional metadata fields.

    Parameters
    ----------
    data : dict[str, list[str | None]]
        Dictionary containing the data to be inserted into the database, keys are column names and
        values are lists of corresponding values
    batch_size : int, default = 100
        How many entries to insert into the database per execution
    """
    i: int
    update: str = f'INSERT INTO file_mgr_item ({", ".join(data)}) ' \
                  f'VALUES %s ON CONFLICT (name, path, type) DO UPDATE SET ' + \
                  ', '.join(
                      [f'{col}=EXCLUDED.{col}' for col in data
                       if col not in ['name', 'path', 'type']],
                  )
    batch: ndarray[tuple[int, int], np.dtype[np.object_]]
    batches: list[ndarray[tuple[int, int], np.dtype[np.object_]]] = np.array_split(
        np.array(list(data.values())),
        max(int(len(list(data.values())[0]) / batch_size), 1),
        axis=-1,
    )

    # Connect to the PostgreSQL database
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            for i, batch in enumerate(batches):
                execute_values(cur, update, batch.swapaxes(0, 1), page_size=batch.shape[-1])
                progress_bar(i, len(batches))


def linux_count(directory: str) -> int:
    """
    Count the number of files and folders in the given directory using Linux command line

    Parameters
    ----------
    directory : str
        Directory to count files and folders

    Returns
    -------
    int
        Number of files and folders in the given directory
    """
    process_output = subprocess.run(
            ['find', directory, '-printf', '.'],
            capture_output=True,
            check=True,
    )
    process_output = subprocess.run(
        ['wc', '-c'],
        input=process_output.stdout,
        capture_output=True,
        check=True,
    ).stdout

    return int(process_output.decode('utf-8').strip())


def universal_count(directory: str) -> int:
    """
    Count the number of files and folders in the given directory using Python for compatibility

    Parameters
    ----------
    directory : str
        Directory to count files and folders

    Returns
    -------
    int
        Number of files and folders in the given directory
    """
    count = 0
    for _, dirs, files in os.walk(directory):
        count += len(files) + len(dirs)
        print(f'\rCount: {count}', end='', flush=True)
    print()  # Print a newline after counting is complete
    return count


def process_dir(
        data_dir: str,
        count: list[int],
        total: list[int],
        root_file: tuple[str, ndarray[tuple[int], np.dtype[np.str_]]],
        lock: Lock) -> dict[str, list[str | None]]:
    """
    Process a directory and its files to extract metadata and prepare for database insertion.

    Parameters
    ----------
    data_dir : str
        The base directory for data.
    count : list[int]
        A list containing the current count of processed items, used for thread-safe updates.
    total : list[int]
        A list containing the total number of items to process, used for thread-safe progress
        tracking.
    root_file : tuple[str, ndarray[tuple[int], np.dtype[np.str_]]]
        A tuple containing the root directory and an array of files in that directory.
    lock : Lock
        A threading lock to ensure thread-safe updates to shared variables.

    Returns
    -------
    pd.DataFrame
        A DataFrame containing metadata extracted from the directory and files.
    """
    dets: int = 52
    min_num: int = 1000
    file: str
    root: str = root_file[0]
    relative_root: str = root.replace(data_dir, '') or '/'
    dir_name: str = os.path.basename(relative_root) or '/'
    parent_dir: str = os.path.dirname(relative_root) or '/'
    keys: tuple[str, ...] = (
        'object',
        'obsid',
        'tstart_tt',
        'tstop_tt',
        'ra',
        'dec',
        'ndets_used',
        'ushoot_net_rate',
        'oshoot_net_rate',
        'goodx_0p5_12_rate',
    )
    key_map: dict[str, str] = {'object': 'source', 'obsid': 'obs_id'}
    data: dict[str, list[str | None]]
    summary: dict[str, list[str | None]]
    gti: re.Match[str] | None
    mask: ndarray[tuple[int], np.dtype[np.bool_]]
    quality: ndarray[tuple[int], np.dtype[np.str_]]
    files: ndarray[tuple[int], np.dtype[np.str_]] = root_file[1]
    summaries: ndarray[tuple[int], np.dtype[np.str_]] = files[np.char.endswith(files, '.summary')]
    qualities: ndarray[tuple[int], np.dtype[np.str_]] = np.array(
        ['goddard', 'gold', 'silver', 'radium', 'pyrite'],
    )

    # Remove ARF and RMF files from the list of files and decrement the total count as these
    # aren't needed for now
    if len(files):
        mask = (np.char.find(files, '.arf') != -1) | (np.char.find(files, '.rmf') != -1)

        with lock:
            total[0] -= np.count_nonzero(mask)

        files = np.delete(files, mask)

    if len(summaries):
        summary = {key.lower(): [val.strip("'")] for key, val in np.loadtxt(
            os.path.join(root, summaries[0]),
            dtype=str,
        ) if key.lower() in keys}

        if summary['goodx_0p5_12_rate'][0]:
            summary['goodx_0p5_12_rate'][0] = str(float(summary['goodx_0p5_12_rate'][0]) * dets)
    else:
        summary = {key: ['' if key == 'object' else None] for key in keys}

    for key, mapped_key in key_map.items():
        if key in summary:
            summary[mapped_key] = summary.pop(key)

    # Load data
    data = {
        'gti': [None],
        'name': [dir_name],
        'quality': [''],
        'path': [parent_dir],
        'file_type': [''],
        'type': ['dir'],
    }

    with lock:
        count[0] += 1

        if count[0] % min_num == 0:
            progress_bar(count[0], total[0])

    # Add file to the database
    for file in files:
        data['gti'].append(gti.group(1) if (gti := re.search(r'GTI(\d+)', file)) else None)
        data['name'].append(file)
        data['quality'].append(
            quality[0] if len(quality := qualities[np.char.find(file, qualities) != -1]) else '',
        )
        data['path'].append(relative_root)
        data['file_type'].append(file.split('.', 1)[-1] if '.' in file else '')
        data['type'].append('file')

        with lock:
            count[0] += 1

            if count[0] % min_num == 0:
                progress_bar(count[0], total[0])

    for key, value in summary.items():
        data[key] = value * len(data['name'])
    return data


def main(update: bool = False, batch: int = int(1e5), limit: int = -1) -> None:
    """
    Main function for updating the database

    Parameters
    ----------
    update : bool, default = False
        Whether to update existing entries in the database
    batch : int, default = 100000
        Batch size for database insertion
    limit : int, default = -1
        Limit the number of files/folders processed, -1 for no limit
    """
    min_num: int = 1000
    ti: float = time()
    data_dir: str
    count: list[int] = [0]
    total: list[int] = [0]
    root_files: list[tuple[str, ndarray[tuple[int], np.dtype[np.str_]]]] = []
    results: list[dict[str, list[str | None]]]
    data: dict[str, list[str | None]]
    func: Callable[[dict[str, list[str | None]], int], None]
    lock: Lock = Lock()
    partial_func: partial[dict[str, list[str | None]]]

    if not update:
        with psycopg2.connect(**DB_CONFIG) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT EXISTS (SELECT 1 FROM file_mgr_item LIMIT 1);")

                if cur.fetchone()[0]:
                    raise ValueError('Database already populated, use update=True to update '
                                     'existing entries or clear database with: python manage.py '
                                     'flush')

    # Get data directory location from config.txt
    with open(os.path.join(BASE_DIR, 'config.txt'), mode='r', encoding='utf-8') as config:
        data_dir = os.path.join(BASE_DIR, json.load(config)['data_dir'])

    # Calculate the total number of folders and files
    for root, _, files in os.walk(data_dir):
        root_files.append((root, np.array(files, dtype=str)))
        total[0] += len(files) + int(root != data_dir)

        if total[0] % min_num == 0:
            print(f'\rCount: {total[0]}', end='', flush=True)

        if limit > 0 and total[0] >= limit:
            print(f'\nLimit of {limit} reached, stopping count early...')
            break

    if not total[0]:
        raise ValueError(f'No files or folders found, check parent directory is correct: '
                         f'{data_dir}')

    print(f'\rTotal number of files and folders: {total[0]}\tTime taken: {time() - ti:.2f} s')
    ti = time()
    partial_func = partial(process_dir, data_dir, count, total, lock=lock)
    print('\nProcessing files and folders...')

    with ThreadPoolExecutor() as executor:
        results = list(executor.map(partial_func, root_files))

    progress_bar(count[0], total[0], text=f'Time taken: {time() - ti:.2f} s')
    ti = time()
    print('\nCombining results...')
    data = {}

    for result in results:
        if not data:
            for key, val in result.items():
                data[key] = val
        else:
            for key, val in result.items():
                data[key].extend(val)

    print(f'\nData combining complete, time taken: {time() - ti:.2f} s')

    # Insert data into database
    ti = time()
    print('\nInserting data into database...')
    func = table_insert if update else create_table
    func(data, batch_size=batch)
    print(f'\nDatabase update complete\tTime taken: {time() - ti:.2f} s')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Update the file_mgr database.")
    parser.add_argument(
        '--update',
        action='store_true',
        help='Whether to update existing entries in the database',
    )
    parser.add_argument(
        '--batch-size',
        type=int,
        default=int(1e5),
        help='Batch size for database insertion',
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=-1,
        help='Limit the number of files/folders processed, -1 for no limit',
    )
    args = parser.parse_args()
    main(update=args.update, batch=args.batch_size, limit=args.limit)
