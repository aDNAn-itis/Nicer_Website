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


def table_insert(data: list[tuple[str, str, str, str]], batch_size: int = 50):
    """
    Add folder and file data to the database

    Parameters
    ----------
    data : list[tuple[string, string, string, string]]
        Data to be inserted into the database (name, path, type, source_name)
    batch_size : integer, default = 50
        How many entries to insert into the database per execution
    """
    update = 'INSERT OR REPLACE INTO file_mgr_item (name, path, type, source_name) VALUES (?,?,?,?)'
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
    for root, dirs, files in os.walk(directory):
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

    # Dictionary to store source names for each observation ID
    obs_source_map = {}

    # Loop through each folder and file in the data directory
    for root, dirs, files in os.walk(data_dir):
        relative_root = root.replace(data_dir, '')
        dir_name = os.path.basename(relative_root)
        parent_dir = os.path.dirname(relative_root) + '/'
        relative_root += '/'

        # Extract observation ID from the path
        obs_id = relative_root.split('/')[1] if len(relative_root.split('/')) > 1 else ''

        # If we haven't found the source name for this observation yet, look for it
        if obs_id and obs_id not in obs_source_map:
            for file in files:
                if file.endswith('.summary'):
                    with open(os.path.join(root, file), 'r') as summary_file:
                        for line in summary_file:
                            if line.startswith('OBJECT'):
                                obs_source_map[obs_id] = line.split("'")[1].strip()
                                break
                    if obs_id in obs_source_map:
                        break

        source_name = obs_source_map.get(obs_id, '')

        if files:
            total -= np.count_nonzero(np.char.find(files, '.arf') != -1)
            total -= np.count_nonzero(np.char.find(files, '.rmf') != -1)
            files = np.delete(np.array(files), np.char.find(files, '.arf') != -1)
            files = np.delete(np.array(files), np.char.find(files, '.rmf') != -1)

        # If not top level directory, add folder to the database
        if dir_name:
            data.append((dir_name, parent_dir, 'dir', source_name))
            count += 1
            progress_bar(count, total)

        # Add file to the database
        for file in files:
            data.append((file, relative_root, 'file', source_name))
            count += 1
            progress_bar(count, total)

    # Insert data into database
    table_insert(data)


if __name__ == '__main__':
    main()
