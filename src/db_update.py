"""
Updates the database using Sqlite to match the folder
structure of the specified directory found in config.txt
"""
import os
import json
import sqlite3
import subprocess
from threading import Lock
from functools import partial
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from numpy import ndarray

from src.utils.utils import progress_bar


def table_insert(data: dict[str, list[int | float | str | None]], batch_size: int = 100) -> None:
    """
    Add folder and file data to the database, including additional metadata fields.

    Parameters
    ----------
    data : dict[str, list[int | float | str | None]]
        Dictionary containing the data to be inserted into the database, keys are column names and
        values are lists of corresponding values.
    batch_size : int, default = 100
        How many entries to insert into the database per execution
    """
    i: int
    update: str = f'INSERT OR REPLACE INTO file_mgr_item ({", ".join(data)})' \
                  f'VALUES ({", ".join(["?"] * len(data))})'
    batch: ndarray[tuple[int, int], np.dtype[np.object_]]
    batches: list[ndarray[tuple[int, int], np.dtype[np.object_]]] = np.array_split(
        np.array(list(data.values())),
        int(len(list(data.values())[0]) / batch_size),
        axis=-1,
    )

    # Connect to the database
    with sqlite3.connect('db.sqlite3') as conn:
        # Insert data into the database
        for i, batch in enumerate(batches):
            conn.executemany(update, batch.swapaxes(0, 1))
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
    relative_root: str = root.replace(data_dir, '')
    dir_name: str = os.path.basename(relative_root)
    parent_dir: str = os.path.dirname(relative_root) + '/'
    relative_root += '/'
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
    os.chdir('../')

    # Get data directory location from config.txt
    with open('config.txt', mode='r', encoding='utf-8') as config:
        data_dir = json.load(config)['data_dir']

    # Calculate the total number of folders and files
    for root, _, files in os.walk(data_dir):
        root_files.append((root, np.array(files, dtype=str)))
        total[0] += len(files) + int(root != data_dir)

        if total[0] % min_num == 0:
            print(f'\rCount: {total[0]}', end='', flush=True)

    if not total:
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
