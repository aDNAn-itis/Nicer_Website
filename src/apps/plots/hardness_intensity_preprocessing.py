"""
Utilities to correct HID (Hardness-Intensity Diagram)
"""
import os
from typing import List, Tuple

import numpy as np
from numpy import ndarray

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

def read_lc_file(filename: str) -> ndarray:
    """
    Read a gzipped lightcurve file and return the data as a numpy array.

    Parameters
    ----------
    filename : str
        Path to the gzipped lightcurve file.

    Returns
    -------
    ndarray
        A 2D numpy array containing the lightcurve data.
        Columns are [time, band1, band2, band3, band4].

    Raises
    ------
    FileNotFoundError
        If the specified file does not exist.
    """
    normalized_path: str = normalize_path(filename)
    if not os.path.exists(normalized_path):
        raise FileNotFoundError(f"File not found: {normalized_path}")

    data: ndarray = np.loadtxt(normalized_path, usecols=[0, 5, 6, 7, 8])
    return data

def process_lc_file(filename: str) -> Tuple[ndarray, ndarray, ndarray]:
    """
    Process a lightcurve file and return time, hardness, and intensity.

    Parameters
    ----------
    filename : str
        Path to the lightcurve file.

    Returns
    -------
    tuple[ndarray, ndarray, ndarray]
        A tuple containing:
        - time: Array of time values in seconds.
        - hardness: Array of hardness ratios (hard_band / soft_band).
        - intensity: Array of total intensity across all bands.
    """
    lc_data: ndarray = read_lc_file(filename)

    time: ndarray = lc_data[:, 0] / 8  # to seconds
    band1: ndarray = lc_data[:, 1]  # 0.3-2 keV
    band2: ndarray = lc_data[:, 2]  # 2-4 keV
    band3: ndarray = lc_data[:, 3]  # 4-6 keV
    band4: ndarray = lc_data[:, 4]  # 6-12 keV

    soft_band: ndarray = band2
    hard_band: ndarray = band3 + band4

    with np.errstate(divide='ignore', invalid='ignore'):
        hardness: ndarray = hard_band / soft_band

    # Replace infinities and NaNs with NaN
    hardness = np.where(np.isfinite(hardness), hardness, np.nan)

    intensity: ndarray = band1 + band2 + band3 + band4  # sum of all bands, keeping as rate

    return time, hardness, intensity

def get_hid_data_and_plot(
    min_value: int,
    obs_id: int,
    data_paths: List[str],
    gti_numbers: List[int]
) -> str:
    """
    Process multiple lightcurve files and create a Hardness-Intensity Diagram (HID) plot.

    Parameters
    ----------
    min_value : int
        Minimum value for adaptive binning (minimum counts per bin)
    obs_id : int
        Observation ID
    data_paths : list[str]
        List of file paths to the lightcurve data files.
    gti_numbers : list[int]
        List of GTI numbers to process.

    Returns
    -------
    str
        JSON string of the generated HID plot.
    """
    all_hardness: List[float] = []
    all_intensity: List[float] = []
    all_time: List[float] = []
    all_hardness_counts: List[float] = []  # Store the actual counts for binning
    all_intensity_counts: List[float] = []  # Store the actual counts for binning

    for gti_number in gti_numbers:
        lc_path: str = data_paths[0].replace("GTI0", f"GTI{gti_number}")

        time, hardness, intensity = process_lc_file(lc_path)

        mask: ndarray = (hardness > 0) & (intensity > 0) & ~np.isnan(hardness) & \
                        ~np.isnan(intensity)
        all_time.extend(time[mask].tolist())
        all_hardness.extend(hardness[mask].tolist())
        all_intensity.extend(intensity[mask].tolist())

        # For adaptive binning, we need the counts rather than rates
        # The intensity is already in counts/s, so multiply by time bin width to get counts
        # The lightcurve data comes in 8-second bins (1/8 second samples)
        time_bin_width = 1.0 / 8.0  # Based on NICER lightcurve binning
        intensity_counts = intensity[mask] * time_bin_width  # total counts per bin
        # For hardness, use a reasonable approximation of the hard band counts
        # hardness = hard/soft, so hard_counts ≈ hardness * soft_counts
        # Assume soft_counts ≈ intensity_counts / 2 (rough approximation)
        hardness_counts = hardness[mask] * intensity_counts / 2.0

        all_hardness_counts.extend(hardness_counts.tolist())
        all_intensity_counts.extend(intensity_counts.tolist())

    if not all_hardness:
        return "No valid data to plot"

    # Convert to numpy arrays for binning
    all_hardness = np.array(all_hardness)
    all_intensity = np.array(all_intensity)
    all_time = np.array(all_time)
    all_hardness_counts = np.array(all_hardness_counts)
    all_intensity_counts = np.array(all_intensity_counts)

    # Apply adaptive binning if min_value is specified and > 0
    if min_value and min_value > 0:
        # Sort data by time to maintain temporal order for binning
        sort_indices = np.argsort(all_time)
        all_hardness = all_hardness[sort_indices]
        all_intensity = all_intensity[sort_indices]
        all_time = all_time[sort_indices]
        all_hardness_counts = all_hardness_counts[sort_indices]
        all_intensity_counts = all_intensity_counts[sort_indices]

        # Use intensity counts for determining bin boundaries (more stable than hardness)
        min_bins = min_bin(min_value, all_intensity_counts)

        # Apply binning to all arrays
        data_stack = np.stack([all_hardness, all_intensity, all_time])
        (binned_hardness, binned_intensity, binned_time), _, _ = binning(
            min_bins,
            data_stack,
        )

        # Use binned data
        all_hardness = binned_hardness
        all_intensity = binned_intensity
        all_time = binned_time

        print(f"HID adaptive binning: {len(sort_indices)} points -> {len(all_hardness)} "
              f"bins (min_value={min_value})")

    # Remove any remaining invalid values after binning
    final_mask = (all_hardness > 0) & (all_intensity > 0) & np.isfinite(all_hardness) & \
                 np.isfinite(all_intensity)
    all_hardness = all_hardness[final_mask]
    all_intensity = all_intensity[final_mask]
    all_time = all_time[final_mask]

    if len(all_hardness) == 0:
        return "No valid data to plot after binning"

    # logarithmic ranges with margin
    margin_factor: float = 0.1  # 10% margin
    x_min: float = np.log10(min(all_hardness))
    x_max: float = np.log10(max(all_hardness))
    y_min: float = np.log10(min(all_intensity))
    y_max: float = np.log10(max(all_intensity))

    x_margin: float = (x_max - x_min) * margin_factor
    y_margin: float = (y_max - y_min) * margin_factor

    xaxis_range: List[float] = [x_min - x_margin, x_max + x_margin]
    yaxis_range: List[float] = [y_min - y_margin, y_max + y_margin]

    norm_time: ndarray = (all_time - np.min(all_time)) / (np.max(all_time) - np.min(all_time))

    return data_plot(
        x_data_list=[all_hardness],
        y_data_list=[all_intensity],
        color_data=norm_time.tolist(),
        plot_kwargs={'mode': 'markers'},
        layout_kwargs={
            'title': f'Hardness-Intensity Diagram {obs_id}',
            'xaxis_title': r'$\text{Hardness}\ (4-12\ keV / 2-4\ keV)$',
            'yaxis_title': r'$\text{Intensity}\ (counts/s)$',
            'xaxis_type': 'log',
            'yaxis_type': 'log',
            'xaxis_range': xaxis_range,
            'yaxis_range': yaxis_range,
            'showlegend': False,
        }
    )
