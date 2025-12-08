"""
Utilities to correct PDS
"""
import os
from typing import List, Tuple, Any

import numpy as np
from numpy import ndarray
from astropy.io import fits

from src.apps.plots.plots import data_plot
from src.utils.utils import min_bin, binning


def normalize_path(path: str) -> str:
    """
    Normalize a file path by removing double slashes and resolving relative paths.

    Parameters
    ----------
    path : str
        The file path to normalize.

    Returns
    -------
    str
        The normalized file path.
    """
    return os.path.normpath(path)


def get_column(data: ndarray, column_name: str) -> ndarray:
    """
    Gets the column given by a name for either an array or a structured array for the PDS

    Parameters
    ----------
    data : ndarray
        Data to index the column
    column_name : str
        Name of the column to index

    Returns
    -------
    ndarray
        Indexed array
    """
    if isinstance(data, ndarray) and data.dtype.names is not None:
        # Structured array
        return data[column_name]

    if isinstance(data, ndarray) and len(data.shape) == 2:
        # Regular 2D numpy array
        column_index = ['E_MIN', 'E_MAX', 'RATE', 'STAT_ERR'].index(column_name)
        return data[:, column_index]

    raise ValueError(f'Unexpected data type or shape: {type(data)}, shape: {data.shape}')


def read_fits_file(file_path: str, gti_numbers: List[int]) -> Tuple[List[Any], fits.Header]:
    """
    Reads a FITS file and returns the data and header.

    Parameters
    ----------
    file_path : str
        Path to the FITS file.
    gti_numbers : List[int]
        List of GTI numbers to filter the data.

    Returns
    -------
    Tuple[List[Any], fits.Header]
        Data arrays for each GTI and header from the FITS file.
    """
    normalized_path = os.path.normpath(file_path)
    if not os.path.exists(normalized_path):
        raise FileNotFoundError(f'File not found: {normalized_path}')

    with fits.open(normalized_path) as hdul:
        header = hdul[1].header
        all_data = hdul[1].data

        gti_data = []
        if isinstance(all_data, fits.fitsrec.FITS_rec):
            # Single table for all GTIs
            for _ in gti_numbers:
                gti_data.append(all_data)  # Append the same data for each requested GTI
        elif isinstance(all_data, ndarray) and len(all_data.shape) > 1:
            # Multiple GTIs in separate rows
            for gti_number in gti_numbers:
                if gti_number < len(all_data):
                    gti_data.append(all_data[gti_number])
        else:
            raise ValueError(f"Unexpected data type in FITS file: {type(all_data)}")

    return gti_data, header


def process_pds_data(
        pds_data: ndarray,
        rsp_data: ndarray) -> Tuple[ndarray, ndarray, ndarray]:
    """
    Processes the PDS data

    Parameters
    ----------
    pds_data : ndarray
        PDS data
    rsp_data : ndarray
        Response data

    Returns
    -------
    tuple[ndarray, ndarray, ndarray]
        Average frequency, normalised power, and normalised error
    """
    freq_min = get_column(rsp_data, 'E_MIN')
    freq_max = get_column(rsp_data, 'E_MAX')
    freq_center = (freq_min + freq_max) / 2

    power = get_column(pds_data, 'RATE')
    error = get_column(pds_data, 'STAT_ERR')

    # Calculate frequency width
    freq_width = freq_max - freq_min

    # Divide rate and error by frequency width
    power_density = power / freq_width
    error_density = error / freq_width

    # Multiply by frequency to get f x PDS Power
    power_density = power_density * freq_center
    error_density = error_density * freq_center

    return freq_center, power_density, error_density


def get_pds_data_and_plot(
    min_value: int,
    obs_id: int,
    data_paths: List[str],
    gti_numbers: List[int]) -> str:
    """
    Processes and plots PDS data for multiple files.

    Parameters
    ----------
    min_value : int
        Minimum value for adaptive binning (minimum counts per bin)
    obs_id : int
        Observation ID
    data_paths : List[str]
        List of paths to PDS files.
    gti_numbers : List[int]
        List of GTI numbers.

    Returns
    -------
    str
        Plotly figure as HTML string or error message.
    """
    x_data_list: List[ndarray] = []
    y_data_list: List[ndarray] = []
    y_uncertainties: List[ndarray] = []

    base_path = data_paths[0]

    for gti_number in gti_numbers:
        pds_path = base_path.replace('GTI0', f'GTI{gti_number}')
        rsp_path = pds_path.replace('-bin.pds', '-fak.rsp')

        pds_data_list, _ = read_fits_file(pds_path, [gti_number])
        rsp_data_list, _ = read_fits_file(rsp_path, [gti_number])

        if pds_data_list and rsp_data_list:
            pds_data = pds_data_list[0]
            rsp_data = rsp_data_list[0]
            freq_center, power_density, error_density = process_pds_data(pds_data, rsp_data)

            # Apply adaptive binning if min_value is specified and > 0
            if min_value and min_value > 0:
                # For PDS, we need to bin in logarithmic frequency space
                # Use the statistical significance of the power measurement as the "count"
                # Power density error gives us the uncertainty, so significance = power/error

                # Calculate statistical significance for each frequency bin
                with np.errstate(divide='ignore', invalid='ignore'):
                    significance = power_density / error_density
                    significance = np.where(np.isfinite(significance), significance, 0)

                # Convert significance to a count-like quantity for binning
                # Higher significance should contribute more to the binning decision
                pseudo_counts = significance ** 2  # Square for count-like behavior

                # Check if we have enough data points to bin
                if len(pseudo_counts) > 2 and np.sum(pseudo_counts) > 0:
                    # Logarithmic binning: create bins in log-frequency space
                    log_freq = np.log10(freq_center)

                    # Apply adaptive binning based on pseudo-counts
                    min_bins = min_bin(min_value, pseudo_counts)

                    # Apply binning to log-frequency and power data
                    data_stack = np.stack([log_freq, power_density, error_density, freq_center])
                    (binned_log_freq, binned_power, binned_error, binned_freq_linear), _, _ = binning(
                        min_bins,
                        data_stack,
                    )

                    # Use binned data
                    freq_center = binned_freq_linear  # Use the binned linear frequency
                    power_density = binned_power
                    error_density = binned_error

                    print(f"PDS adaptive binning GTI{gti_number}: {len(pseudo_counts)} points -> {len(freq_center)} bins (min_value={min_value})")
                else:
                    print(f"PDS GTI{gti_number}: Insufficient data for adaptive binning ({len(pseudo_counts)} points, sum={np.sum(pseudo_counts):.1f})")

            x_data_list.append(freq_center)
            y_data_list.append(power_density)
            y_uncertainties.append(error_density)

    if not x_data_list:
        error_msg = "No valid data to plot"
        return error_msg

    # # Calculate logarithmic ranges with a margin
    margin_factor = 0.1  # 10% margin
    x_min = np.log10(min(
        np.min(data, where=data > 0, initial=np.max(data)) for data in x_data_list
    ))
    x_max = np.log10(max(np.max(data) for data in x_data_list))
    y_min = np.log10(min(
        np.min(data, where=data > 0, initial=np.max(data)) for data in y_data_list
    ))
    y_max = np.log10(max(np.max(data) for data in y_data_list))

    x_margin = (x_max - x_min) * margin_factor
    y_margin = (y_max - y_min) * margin_factor

    xaxis_range = [x_min - x_margin, x_max + x_margin]
    yaxis_range = [y_min - y_margin, y_max + y_margin]

    return data_plot(
        gti_numbers=gti_numbers,
        x_data_list=x_data_list,
        y_data_list=y_data_list,
        y_uncertainties=y_uncertainties,
        plot_kwargs={'mode': 'markers'},
        layout_kwargs={
            'title': f'Power Density Spectrum {obs_id}',
            'xaxis_title': 'Frequency (Hz)',
            'yaxis_title': 'f x PDS Power (rms)',
            'xaxis_type': 'log',
            'yaxis_type': 'log',
            'showlegend': True,
            'xaxis_range': xaxis_range,
            'yaxis_range': yaxis_range,
        }
    )


# You might want to keep this function for compatibility or future use
def power_density_plot(
        min_value: int,
        data_paths: List[Tuple[str, str]],
        gti_numbers: List[int]) -> str:
    """
    Processes and plots PDS data for multiple files.
    This function is kept for compatibility but now uses get_pds_data_and_plot internally.

    Parameters
    ----------
    min_value : int
        Minimum value for each bin (for adaptive binning).
    data_paths : List[Tuple[str, str]]
        List of tuples containing paths to PDS and RSP files.
    gti_numbers : List[int]
        List of GTI numbers.

    Returns
    -------
    str
        Plotly figure as HTML string.
    """
    pds_paths = [pds_path for pds_path, _ in data_paths]
    return get_pds_data_and_plot(min_value, 0, pds_paths, gti_numbers)  # obs_id=0 as placeholder
