"""
Updates the database using Sqlite to match the folder
structure of the specified directory found in config.txt
"""
import os
import json
import subprocess
from io import StringIO
from threading import Lock
from functools import partial
from concurrent.futures import ThreadPoolExecutor

import psycopg2
import numpy as np
import pandas as pd
from numpy import ndarray
from psycopg2.extras import execute_values

from src.utils.utils import progress_bar
from nicer_website.settings import DATABASES, BASE_DIR


def table_insert(data: dict[str, list[int | float | str | None]], batch_size: int = 10000) -> None:
    """
    Add folder and file data to the database, including additional metadata fields.

    Parameters
    ----------
    db_config : dict[str, str]
        Dictionary containing database connection parameters such as host, port, user, password,
    data : dict[str, list[int | float | str | None]]
        Dictionary containing the data to be inserted into the database, keys are column names and
        values are lists of corresponding values.
    batch_size : int, default = 100
        How many entries to insert into the database per execution
    """
    i: int
    # PostgreSQL does not support INSERT OR REPLACE, use ON CONFLICT for upsert
    update: str = f'INSERT INTO file_mgr_item ({", ".join(data)}) ' \
                  f'VALUES %s ON CONFLICT (name, path, type) DO UPDATE SET ' + \
                  ', '.join(
                      [f'{col}=EXCLUDED.{col}' for col in data
                       if col not in ['name', 'path', 'type']],
                  )
    batch: ndarray[tuple[int, int], np.dtype[np.object_]]
    batches: list[ndarray[tuple[int, int], np.dtype[np.object_]]] = np.array_split(
        np.array(list(data.values())),
        int(len(list(data.values())[0]) / batch_size),
        axis=-1,
    )
    db_config: dict[str, str] = {
        'host': DATABASES['default'].get('HOST', 'localhost'),
        'port': DATABASES['default'].get('PORT', '5432'),
        'dbname': DATABASES['default'].get('NAME', ''),
        'user': DATABASES['default'].get('USER', ''),
        'password': DATABASES['default'].get('PASSWORD', ''),
        }

    # Connect to the PostgreSQL database
    with psycopg2.connect(**db_config) as conn:
        with conn.cursor() as cur:
            # df = pd.DataFrame.from_dict(data)
            # sio = StringIO()
            # df.to_csv(sio, index=False, header=False)
            # sio.seek(0)

            # cur.copy_expert(f'COPY file_mgr_item ({", ".join(data)}) FROM STDIN WITH CSV', sio)

            for i, batch in enumerate(batches):
                execute_values(cur, update, batch.swapaxes(0, 1), page_size=batch.shape[-1])
                # cur.executemany(update, batch.swapaxes(0, 1))
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
        lock: Lock) -> dict[str, list[int | float | str | None]]:
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
    dict[str, list[int | float | str]]
        A dictionary containing metadata extracted from the directory and files.
    """
    dets: int = 52
    min_num: int = 1000
    file: str
    root: str = root_file[0]
    relative_root: str = root.replace(data_dir, '') or '/'
    dir_name: str = os.path.basename(relative_root) or '/'
    parent_dir: str = os.path.dirname(relative_root) or '/'
    data: dict[str, list[int | float | str | None]] = {key: [] for key in [
        'name',
        'path',
        'type',
        'source',
        'tstart_tt',
        'tstop_tt',
        'ra',
        'dec',
        'ndets_used',
        'ushoot_net_rate',
        'oshoot_net_rate',
        'changegoodx_5_12_rate',
    ]}
    summary: ndarray[tuple[int], np.dtype[np.str_]]
    files: ndarray[tuple[int], np.dtype[np.str_]] = root_file[1]
    summaries: ndarray[tuple[int], np.dtype[np.str_]] = files[np.char.endswith(files, '.summary')]

    # Remove ARF and RMF files from the list of files and decrement the total count as these
    # aren't needed for now
    if len(files):
        with lock:
            total[0] -= np.count_nonzero(np.char.find(files, '.arf') != -1)
            total[0] -= np.count_nonzero(np.char.find(files, '.rmf') != -1)

        files = np.delete(np.array(files), np.char.find(files, '.arf') != -1)
        files = np.delete(np.array(files), np.char.find(files, '.rmf') != -1)

    # Find source name if in a destination that contains source information
    if len(summaries):
        summary = np.loadtxt(f'{root}/{summaries[0]}', dtype=str)
        data['source'].extend([
            summary[:, 1][summary[:, 0] == 'OBJECT'][0].strip("'")
        ] * (len(files) + bool(dir_name)))
        data['tstart_tt'].extend([
            float(summary[:, 1][summary[:, 0] == 'TSTART_TT'][0].strip())
        ] * (len(files) + bool(dir_name)))
        data['tstop_tt'].extend([
            float(summary[:, 1][summary[:, 0] == 'TSTOP_TT'][0].strip())
        ] * (len(files) + bool(dir_name)))
        data['ra'].extend([
            float(summary[:, 1][summary[:, 0] == 'RA'][0].strip())
        ] * (len(files) + bool(dir_name)))
        data['dec'].extend([
            float(summary[:, 1][summary[:, 0] == 'DEC'][0].strip())
        ] * (len(files) + bool(dir_name)))
        data['ndets_used'].extend([
            float(summary[:, 1][summary[:, 0] == 'NDETS_USED'][0].strip())
        ] * (len(files) + bool(dir_name)))
        data['ushoot_net_rate'].extend([
            float(summary[:, 1][summary[:, 0] == 'USHOOT_NET_RATE'][0].strip()),
        ] * (len(files) + bool(dir_name)))
        data['oshoot_net_rate'].extend([
            float(summary[:, 1][summary[:, 0] == 'OSHOOT_NET_RATE'][0].strip()),
        ] * (len(files) + bool(dir_name)))
        data['changegoodx_5_12_rate'].extend([
            float(summary[:, 1][summary[:, 0] == 'GOODX_0p5_12_RATE'][0].strip()) * dets,
        ] * (len(files) + bool(dir_name)))
    else:
        # Default values for additional metadata if not available
        data['source'].extend([''] * (len(files) + bool(dir_name)))
        data['tstart_tt'].extend([None] * (len(files) + bool(dir_name)))
        data['tstop_tt'].extend([None] * (len(files) + bool(dir_name)))
        data['ra'].extend([None] * (len(files) + bool(dir_name)))
        data['dec'].extend([None] * (len(files) + bool(dir_name)))
        data['ndets_used'].extend([None] * (len(files) + bool(dir_name)))
        data['ushoot_net_rate'].extend([None] * (len(files) + bool(dir_name)))
        data['oshoot_net_rate'].extend([None] * (len(files) + bool(dir_name)))
        data['changegoodx_5_12_rate'].extend([None] * (len(files) + bool(dir_name)))

    # If not top-level directory, add folder to the database
    if dir_name:
        data['name'].append(dir_name)
        data['path'].append(parent_dir)
        data['type'].append('dir')

        with lock:
            count[0] += 1

            if count[0] % min_num == 0:
                progress_bar(count[0], total[0])

    # Add file to the database
    for file in files:
        data['name'].append(file)
        data['path'].append(relative_root)
        data['type'].append('file')

        with lock:
            count[0] += 1

            if count[0] % min_num == 0:
                progress_bar(count[0], total[0])
    return data


def main() -> None:
    """
    Main function for updating the database
    """
    min_num: int = 1000
    key: str
    data_dir: str
    count: list[int] = [0]
    total: list[int] = [0]
    value: list[int | float | str | None]
    root_files: list[tuple[str, ndarray[tuple[int], np.dtype[np.str_]]]] = []
    results: list[dict[str, list[int | float | str | None]]]
    data: dict[str, list[int | float | str | None]]
    result: dict[str, list[int | float | str | None]]
    lock: Lock = Lock()
    partial_func: partial[dict[str, list[int | float | str | None]]]

    # Get data directory location from config.txt
    with open(os.path.join(BASE_DIR, 'config.txt'), mode='r', encoding='utf-8') as config:
        data_dir = os.path.join(BASE_DIR, json.load(config)['data_dir'])

    # Calculate the total number of folders and files
    for root, _, files in os.walk(data_dir):
        root_files.append((root, np.array(files, dtype=str)))
        total[0] += len(files) + int(root != data_dir)

        if total[0] % min_num == 0:
            print(f'\rCount: {total[0]}', end='', flush=True)

    if not total[0]:
        raise ValueError(f'No files or folders found, check parent directory is correct: '
                         f'{data_dir}')

    print(f'\rTotal number of files and folders: {total[0]}')

    with ThreadPoolExecutor() as executor:
        partial_func = partial(process_dir, data_dir, count, total, lock=lock)
        results = list(executor.map(partial_func, root_files))

    progress_bar(count[0], total[0])
    data = {key: [] for key in results[0].keys()}

    for result in results:
        for key, value in result.items():
            data[key].extend(value)

    # Insert data into database
    table_insert(data)


if __name__ == '__main__':
    main()
