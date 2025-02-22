"""
Utility to correct light curve data
"""
import numpy as np
from numpy import ndarray
from typing import Optional, List, Tuple, Dict

from src.utils.utils import min_bin, binning
from src.utils.plots import data_plot


def light_curve_data(
        min_value: int,
        data_path: str) -> tuple[ndarray, ndarray, ndarray, ndarray, ndarray, ndarray]:
    """
    Fetches and corrects binned light curve data

    Parameters
    ----------
    min_value : int
        Minimum value used for binning
    data_path : str
        Path to the light curve

    Returns
    -------
    tuple[ndarray, ndarray, ndarray, ndarray, ndarray, ndarray]
        Binned relative time, light curve, background time, background, x width, and uncertainty
    """
    detectors: int | ndarray
    time_diff: float
    time: ndarray
    x_bin: ndarray
    y_bin: ndarray
    bg_bin: ndarray
    counts: ndarray
    x_width: ndarray
    x_error: ndarray
    bg_x_bin: ndarray
    min_bins: ndarray
    background: ndarray
    uncertainty: ndarray

    time, counts, detectors = np.loadtxt(data_path, usecols=[0, 2, 3], unpack=True)
    background = np.loadtxt(data_path.replace('.lc.gz', '.bg-lc.gz'), usecols=2)

    # Constants
    detectors = detectors[0]
    time_diff = float(time[1] - time[0])
    counts *= time_diff

    # Bin data
    min_bins = min_bin(min_value, counts)
    (y_bin, bg_bin, x_bin), x_width, uncertainty = binning(
        min_bins,
        np.stack((counts[:len(background)], background[:len(time)], time[:len(background)])),
    )

    # Normalise data
    y_bin = (y_bin - bg_bin) / (detectors * time_diff)
    bg_bin /= detectors
    bg_bin = np.insert(bg_bin, [0, -1], [bg_bin[0], bg_bin[-1]])
    x_error = x_width * time_diff / 2
    uncertainty /= detectors * time_diff
    bg_x_bin = x_bin.copy()
    bg_x_bin = np.insert(
        bg_x_bin,
        [0, bg_x_bin.size],
        [x_bin[0] - x_error[0], x_bin[-1] + x_error[-1]],
    )

    return x_bin, y_bin, bg_x_bin, bg_bin, x_error, uncertainty[0]

def align_light_curves(
        min_value: int,
        data_paths: list[str],
        gti_numbers: list[int],
        gti_labels: Optional[list[str]] = None
) -> Tuple[list[ndarray], list[ndarray], list[ndarray], list[ndarray], list[ndarray], list[ndarray], list[float]]:
    """
    Aligns multiple light curves by ensuring correct GTI interval separation and grouping by GTI number

    Parameters
    ----------
    min_value : int
        Minimum value used for binning
    data_paths : list[str]
        List of paths to light curve data files
    gti_numbers : list[int]
        List of GTI numbers
    gti_labels : Optional[list[str]]
        Optional list of labels for each GTI

    Returns
    -------
    Tuple of aligned data lists, grouped by GTI number
    """
    gti_groups: Dict[int, List[Dict]] = {}

    for data_path, gti_num in zip(data_paths, gti_numbers):
        x_bin, y_bin, bg_x_bin, bg_bin, x_err, uncertainty = light_curve_data(min_value, data_path)

        if gti_num not in gti_groups:
            gti_groups[gti_num] = []

        gti_groups[gti_num].append({
            'x_bin': x_bin,
            'y_bin': y_bin,
            'bg_x_bin': bg_x_bin,
            'bg_bin': bg_bin,
            'x_err': x_err,
            'uncertainty': uncertainty
        })

    aligned_gti_data: Dict[int, List[Dict]] = {}

    for gti_num, group in gti_groups.items():
        group_durations = [data['x_bin'][-1] - data['x_bin'][0] for data in group]
        max_duration = max(group_durations)

        aligned_group_data = []
        for i, data in enumerate(group):
            orig_x_bin = data['x_bin']
            orig_duration = orig_x_bin[-1] - orig_x_bin[0]

            scale_factor = max_duration / orig_duration

            total_offset = i * (max_duration + 5400)

            scaled_x_bin = ((orig_x_bin - orig_x_bin[0]) * scale_factor) + total_offset
            scaled_bg_x_bin = ((data['bg_x_bin'] - data['bg_x_bin'][0]) * scale_factor) + total_offset

            aligned_group_data.append({
                'x_bin': scaled_x_bin,
                'y_bin': data['y_bin'],
                'bg_x_bin': scaled_bg_x_bin,
                'bg_bin': data['bg_bin'],
                'x_err': data['x_err'] * scale_factor,
                'uncertainty': data['uncertainty']
            })

        aligned_gti_data[gti_num] = aligned_group_data

    x_data, y_data = [], []
    x_background, background = [], []
    x_errors, uncertainties = [], []

    for gti_num in sorted(aligned_gti_data.keys()):
        for data in aligned_gti_data[gti_num]:
            x_data.append(data['x_bin'])
            y_data.append(data['y_bin'])
            x_background.append(data['bg_x_bin'])
            background.append(data['bg_bin'])
            x_errors.append(data['x_err'])
            uncertainties.append(data['uncertainty'])

    time_offsets = [0.0] * len(x_data)

    return x_data, y_data, x_background, background, x_errors, uncertainties, time_offsets

def light_curve_plot(
    min_value: int,
    obs_id: int,
    data_paths: list[str],
    gti_numbers: list[int],
    gti_labels: Optional[list[str]] = None,
    is_combined_obs: bool = False) -> str:
    """
    Gets and plots the corrected light curve data

    Parameters
    ----------
    min_value : int
        Minimum value used for binning
    obs_id : int
        Observation ID
    data_paths : list[str]
        File path to the light curve
    gti_numbers : list[int]
        List of GTI numbers
    gti_labels : list[str]
        List of GTI labels
    is_combined_obs : bool
        Flag indicating if this is a combined observation plot

    Returns
    -------
    str
        Light curve plot as HTML
    """
    if gti_labels is None:
        gti_labels = [f'GTI{gti}' for gti in gti_numbers]

    if is_combined_obs:
        x_data, y_data, x_background, background, x_error, y_uncertainties, _ = align_light_curves(
            min_value, data_paths, gti_numbers, gti_labels
        )
    else:
        x_data, y_data = [], []
        x_background, background = [], []
        x_error, y_uncertainties = [], []
        for data_path in data_paths:
            x_bin, y_bin, bg_x_bin, bg_bin, x_err, uncertainty = light_curve_data(min_value, data_path)
            x_data.append(x_bin)
            y_data.append(y_bin)
            x_background.append(bg_x_bin)
            background.append(bg_bin)
            x_error.append(x_err)
            y_uncertainties.append(uncertainty)

    # Plot light curve
    return data_plot(
        gti_numbers=gti_numbers,
        x_data_list=x_data,
        y_data_list=y_data,
        plot_type='lines+markers',
        x_background_list=x_background,
        background_list=background,
        x_errors=x_error,
        y_uncertainties=y_uncertainties,
        layout_kwargs={
            'title': f'Light Curve {obs_id}',
            'xaxis_title': r'$\text{Relative Time}\ (s)$',
            'yaxis_title': r'$\text{Photons}\ (s^{-1} det^{-1})$',
            'showlegend': True,
        },
        plot_kwargs={'mode': 'markers'},
        gti_labels=gti_labels
    )