"""
Utilities to normalise and bin spectra
"""
import re
from typing import Any

import numpy as np
import pandas as pd
from numpy import ndarray
from astropy.io import fits

from src.utils.plots import data_plot
from src.utils.utils import min_bin, binning


def channel_kev(channel: ndarray) -> ndarray:
    """Convert units of channel to keV"""
    return (channel * 10 + 5) / 1e3


def spectrum_data(
        min_value: int,
        data_path: str,
        cut_off: tuple[float, float] | None = None) -> tuple:
    """
    Fetches and corrects binned data from spectrum
    """
    if not cut_off:
        cut_off = (0.3, 12)

    try:
        with fits.open(data_path) as file:
            spectrum_info = file[1].header
            spectrum = file[1].data
            response = spectrum_info['RESPFILE']
            match = re.search(r'_d(\d+)', response)
            detectors = int(match.group(1)) if match else 52

        with fits.open(data_path.replace('.jsgrp', '.bg')) as file:
            bg_info = file[1].header
            background = pd.DataFrame(file[1].data)

        if 'RATE' in background:
            background['COUNTS'] = background['RATE'] * bg_info['EXPOSURE']

        x_data = channel_kev(spectrum['CHANNEL'])
        if len(x_data) > 1:
            energy = float(x_data[1] - x_data[0])
        else:
            energy = 0.01

        groupings = spectrum['GROUPING']
        bins = np.argwhere(groupings == 1).flatten()
        bins = np.append(bins, len(groupings))

        (y_bin, bg_bin, x_bin), _, uncertainty = binning(
            bins,
            np.stack((spectrum['COUNTS'], background['COUNTS'], x_data)),
        )
        x_width = np.diff(bins)

        if min_value:
            min_bins = min_bin(min_value, y_bin * x_width)
            (y_bin, bg_bin, x_bin), x_width, uncertainty = binning(
                min_bins,
                np.stack((y_bin, bg_bin, x_bin)),
                weights=x_width,
            )

        y_bin = (
            y_bin / spectrum_info['EXPOSURE'] - bg_bin / bg_info['EXPOSURE']
        ) / (detectors * energy)
        bg_bin /= bg_info['EXPOSURE'] * detectors * energy
        x_error = x_width * energy / 2
        uncertainty /= spectrum_info['EXPOSURE'] * detectors * energy

        cut_indices = np.argwhere((x_bin < cut_off[0]) | (x_bin > cut_off[1]))
        
        idx_low = np.argwhere(x_bin < cut_off[0]).flatten()
        idx_high = np.argwhere(x_bin > cut_off[1]).flatten()
        
        low_val = idx_low[-1] + 1 if len(idx_low) > 0 else 0
        high_val = idx_high[0] - 1 if len(idx_high) > 0 else -1
        
        bg_interp_indices = (np.array([low_val]), np.array([high_val]))

        bg_bin_cut = np.delete(bg_bin, cut_indices)
        
        # Interpolation Logic
        if len(bg_interp_indices[0]) > 0 and len(bg_interp_indices[1]) > 0 and len(x_bin) > 0:
             val1 = np.interp(x_bin[bg_interp_indices[0]] - x_error[bg_interp_indices[0]], x_bin, bg_bin)[0]
             val2 = np.interp(x_bin[bg_interp_indices[1]] + x_error[bg_interp_indices[1]], x_bin, bg_bin)[0]
        else:
             val1, val2 = 0, 0

        bg_bin = np.insert(bg_bin_cut, [0, bg_bin_cut.size], [val1, val2])

        x_bin = np.delete(x_bin, cut_indices)
        y_bin = np.delete(y_bin, cut_indices)
        x_error = np.delete(x_error, cut_indices)
        uncertainty = np.delete(uncertainty, cut_indices, axis=1)
        bg_x_bin = x_bin.copy()
        bg_x_bin = np.insert(
            bg_x_bin,
            [0, bg_x_bin.size],
            [x_bin[0] - x_error[0], x_bin[-1] + x_error[-1]],
        )

        return x_bin, y_bin, bg_x_bin, bg_bin, x_error, uncertainty[0]
    
    except Exception as e:
        print(f"Error processing Spectrum {data_path}: {e}")
        return (np.array([]),) * 6


def spectrum_plot(
        min_value: int,
        obs_id: Any,
        data_paths: list[str],
        gti_numbers: list[int],
        cut_off: list = None,
        gti_labels: list[str] | None = None) -> str:
    """
    Gets and plots the binned and corrected spectra.
    """
    x_data: list[ndarray] = []
    y_data: list[ndarray] = []
    x_error: list[ndarray] = []
    background: list[ndarray] = []
    x_background: list[ndarray] = []
    y_uncertainties: list[ndarray] = []

    # --- Labeling Logic ---
    obs_str = str(obs_id)
    is_combined = ',' in obs_str
    
    if gti_labels is None:
        if is_combined:
            obs_ids_list = obs_str.split(',')
            gti_labels = []
            for i in range(len(data_paths)):
                oid = obs_ids_list[i % len(obs_ids_list)] if len(obs_ids_list) > 0 else obs_str
                gti = gti_numbers[i] if i < len(gti_numbers) else "?"
                gti_labels.append(f"{oid} (GTI {gti})")
        else:
            gti_labels = [f'GTI{gti}' for gti in gti_numbers]

    # Get spectrum data
    for data_path in data_paths:
        results = spectrum_data(min_value, data_path, cut_off=cut_off)
        if len(results[0]) > 0:
            x_data.append(results[0])
            y_data.append(results[1])
            x_background.append(results[2])
            background.append(results[3])
            x_error.append(results[4])
            y_uncertainties.append(results[5])
        else:
            x_data.append(np.array([]))
            y_data.append(np.array([]))
            x_background.append(np.array([]))
            background.append(np.array([]))
            x_error.append(np.array([]))
            y_uncertainties.append(np.array([]))

    # --- 🟢 FORCE SENSIBLE Y-AXIS RANGE ---
    # This fixes the "squeezed" look by ignoring values below 1e-10
    yaxis_range = None
    try:
        # Collect all valid positive values from Spectrum AND Background
        valid_vals = []
        for arr in y_data + background:
            # We filter for > 1e-10. Anything smaller is essentially zero/noise.
            valid_vals.extend(arr[arr > 1e-10])
        
        if valid_vals:
            # Determine min/max in log space
            y_min = np.log10(min(valid_vals))
            y_max = np.log10(max(valid_vals))
            # Add a small visual padding (10%)
            pad = (y_max - y_min) * 0.1
            yaxis_range = [y_min - pad, y_max + pad]
    except:
        pass # Fallback to auto if calculation fails

    # Plot spectrum
    return data_plot(
        gti_numbers = gti_numbers,
        x_data_list = x_data,
        y_data_list = y_data,
        x_background_list=x_background,
        background_list=background,
        x_errors=x_error,
        y_uncertainties=y_uncertainties,
        plot_kwargs={'mode': 'markers'},
        layout_kwargs={
            'title': f'Spectrum {obs_id}',
            'xaxis_title': r'$\text{Energy}\ (keV)$',
            'yaxis_title': r'$\text{Photons}\ (keV^{-1} s^{-1} det^{-1})$',
            'xaxis_type':'log',
            'yaxis_type':'log',
            'showlegend' : True,
            'template': 'plotly_white',
            'hovermode': 'closest',
            'yaxis_range': yaxis_range  # <--- Apply the Fix Here
        },
        gti_labels=gti_labels
    )