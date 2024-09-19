"""
Updates the database using Sqlite to match the folder
structure of the specified directory found in config.txt
"""
import os
import json
import sqlite3
import subprocess

import numpy as np


def progress_bar(i: int, total: int):
    """
    Terminal progress bar

    Parameters
    ----------
    i : int
        Current progress
    total : int
        Completion number
    """
    length = 50
    i += 1

    filled = int(i * length / total)
    percent = i * 100 / total
    bar_fill = '█' * filled + '-' * (length - filled)
    print(f'\rProgress: |{bar_fill}| {int(percent)}%\t', end='')

    if i == total:
        print()


def table_insert(data: list[tuple[str, str, str, str, float, float, float, float]], batch_size: int = 100):
    """
    Add folder and file data to the database, including additional metadata fields.

    Parameters
    ----------
    data : list[tuple[string, string, string, string, float, float, float, float]]
        Data to be inserted into the database (name, path, type, source_name, tstart_tt, tstop_tt, ra, dec)
    batch_size : integer, default = 100
        How many entries to insert into the database per execution
    """
    update = '''INSERT OR REPLACE INTO file_mgr_item 
                (name, path, type, source, tstart_tt, tstop_tt, ra, dec) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)'''

    batches = np.array_split(data, len(data) / batch_size)

    # Connect to the database
    with sqlite3.connect('db.sqlite3') as conn:
        # Insert data into the database
        for i, batch in enumerate(batches):
            conn.executemany(update, list(batch))
            progress_bar(i, len(batches))


def linux_count(directory: str) -> int:
    """
    Count the number of files and folders in the given directory using Linux command line

    Parameters
    ----------
    directory : string
        Directory to count files and folders

    Returns
    -------
    integer
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
    directory : string
        Directory to count files and folders

    Returns
    -------
    integer
        Number of files and folders in the given directory
    """
    count = 0
    for _, dirs, files in os.walk(directory):
        count += len(files) + len(dirs)
        print(f'\rCount: {count}', end='', flush=True)
    print()  # Print a newline after counting is complete
    return count



def main():
    """
    Main function for updating the database
    """
    count = 0
    data = []
    os.chdir('../')

    # Get data directory location from config.txt
    with open('config.txt', mode='r', encoding='utf-8') as config:
        data_dir = json.load(config)['data_dir']

    # Calculate the total number of folders and files
    try:
        total = linux_count(data_dir)
    except (subprocess.CalledProcessError, FileNotFoundError):
        total = universal_count(data_dir)

    if not total:
        raise ValueError(f'No files or folders found, check parent directory is correct: '
                         f'{data_dir}')

    print(f'Total number of files and folders: {total}')

    # Loop through each folder and file in the data directory
    for root, _, files in os.walk(data_dir):
        source = ''
        files = np.array(files, dtype=str)
        relative_root = root.replace(data_dir, '')
        dir_name = os.path.basename(relative_root)
        parent_dir = os.path.dirname(relative_root) + '/'
        relative_root += '/'

        summaries = files[np.char.endswith(files, '.summary')]

        # Find source name if in a destination that contains source information
        if len(summaries):
            file = np.loadtxt(f'{root}/{summaries[0]}', dtype=str)
            source = file[:, 1][file[:, 0] == 'OBJECT'][0].strip("'")

            # Extract additional metadata (TSTART_TT, TSTOP_TT, RA, DEC)
            tstart_tt = float(file[:, 1][file[:, 0] == 'TSTART_TT'][0].strip())
            tstop_tt = float(file[:, 1][file[:, 0] == 'TSTOP_TT'][0].strip())
            ra = float(file[:, 1][file[:, 0] == 'RA'][0].strip())
            dec = float(file[:, 1][file[:, 0] == 'DEC'][0].strip())
        else:
            # Default values for additional metadata if not available
            tstart_tt = None
            tstop_tt = None
            ra = None
            dec = None

        # Remove ARF and RMF files from the list of files and decrement the total count as these
        # aren't needed for now
        if len(files):
            total -= np.count_nonzero(np.char.find(files, '.arf') != -1)
            total -= np.count_nonzero(np.char.find(files, '.rmf') != -1)
            files = np.delete(np.array(files), np.char.find(files, '.arf') != -1)
            files = np.delete(np.array(files), np.char.find(files, '.rmf') != -1)

        # If not top-level directory, add folder to the database
        if dir_name:
            data.append((dir_name, parent_dir, 'dir', source, tstart_tt, tstop_tt, ra, dec))
            count += 1
            progress_bar(count, total)

        # Add file to the database
        for file in files:
            data.append((file, relative_root, 'file', source, tstart_tt, tstop_tt, ra, dec))
            count += 1
            progress_bar(count, total)

    # Insert data into database
    table_insert(data)


if __name__ == '__main__':
    main()
