"""
Utilities to correct PDS
"""
import os
import re
from typing import List, Tuple, Any

import numpy as np
from numpy import ndarray
from astropy.io import fits
import plotly.graph_objects as go
from src.apps.plots.plots import data_plot
from src.utils.utils import min_bin, binning


def normalize_path(path: str) -> str:
    """Normalize a file path."""
    return os.path.normpath(path)


def get_column(data: ndarray, column_name: str) -> ndarray:
    """Gets the column given by a name for PDS."""
    if isinstance(data, ndarray) and data.dtype.names is not None:
        return data[column_name]

    if isinstance(data, ndarray) and len(data.shape) == 2:
        try:
            column_index = ['E_MIN', 'E_MAX', 'RATE', 'STAT_ERR'].index(column_name)
            return data[:, column_index]
        except ValueError:
            pass

    raise ValueError(f'Unexpected data type or shape: {type(data)}, shape: {data.shape}')


def read_fits_file(file_path: str, gti_numbers: List[int]) -> Tuple[List[Any], fits.Header]:
    """Reads a FITS file and returns the data and header."""
    normalized_path = os.path.normpath(file_path)
    if not os.path.exists(normalized_path):
        # Return empty if file not found to avoid crashing the whole plot
        print(f"Warning: File not found: {normalized_path}")
        return [], None

    with fits.open(normalized_path) as hdul:
        header = hdul[1].header
        all_data = hdul[1].data

        gti_data = []
        if isinstance(all_data, fits.fitsrec.FITS_rec):
            for _ in gti_numbers:
                gti_data.append(all_data)
        elif isinstance(all_data, ndarray) and len(all_data.shape) > 1:
            for gti_number in gti_numbers:
                if gti_number < len(all_data):
                    gti_data.append(all_data[gti_number])
        else:
            # Fallback for simple files
            gti_data.append(all_data)

    return gti_data, header


def process_pds_data(
        pds_data: ndarray,
        rsp_data: ndarray) -> Tuple[ndarray, ndarray, ndarray]:
    """Processes the PDS data."""
    freq_min = get_column(rsp_data, 'E_MIN')
    freq_max = get_column(rsp_data, 'E_MAX')
    freq_center = (freq_min + freq_max) / 2

    power = get_column(pds_data, 'RATE')
    error = get_column(pds_data, 'STAT_ERR')

    freq_width = freq_max - freq_min

    power_density = power / freq_width
    error_density = error / freq_width

    power_density = power_density * freq_center
    error_density = error_density * freq_center

    return freq_center, power_density, error_density


def get_pds_data_and_plot(
    min_value: int,
    obs_id: Any,  # Changed to Any to support string "101,102"
    data_paths: List[str],
    gti_numbers: List[int],
    gti_labels: List[str] = None,
    output_type: str = 'div') -> Any:
    """
    Processes and plots PDS data. Handles both Single and Combined observations.
    """
    x_data_list: List[ndarray] = []
    y_data_list: List[ndarray] = []
    y_uncertainties: List[ndarray] = []
    plot_labels: List[str] = []  # To store custom labels

    # ---CHECK FOR COMBINED MODE---
    obs_str = str(obs_id)
    is_combined = ',' in obs_str or (gti_labels and len(set(gti_labels)) > 1)

    if is_combined:
        # ---LOGIC FOR COMBINED OBSERVATIONS---
        obs_ids_list = [oid.strip() for oid in obs_str.split(',')]
        limit = min(len(data_paths), len(gti_numbers))
        
        for i in range(limit):
            pds_path = data_paths[i]
            gti_number = gti_numbers[i]
            
            # Smart Labeling: Extract actual ObsID from the path
            if gti_labels and i < len(gti_labels):
                current_obs = gti_labels[i]
            else:
                current_obs = next((oid for oid in obs_ids_list if oid in pds_path), None)
                if not current_obs:
                    match = re.search(r'/(\d{10})/', pds_path)
                    current_obs = match.group(1) if match else obs_str
            
            # Combine ObsID and GTI for clarity in combined mode
            label = f"{current_obs} (GTI {gti_number})"
            
            # Derive RSP path directly from PDS path
            if '-bin.pds' in pds_path:
                rsp_path = pds_path.replace('-bin.pds', '-fak.rsp')
            elif '.pds' in pds_path:
                rsp_path = pds_path.replace('.pds', '.rsp')
            else:
                rsp_path = pds_path + ".rsp"

            pds_data_list, _ = read_fits_file(pds_path, [gti_number])
            rsp_data_list, _ = read_fits_file(rsp_path, [gti_number])

            if pds_data_list and rsp_data_list:
                process_and_append(
                    pds_data_list[0], rsp_data_list[0], 
                    min_value, gti_number, label,
                    x_data_list, y_data_list, y_uncertainties, plot_labels
                )

    else:
        # ---LOGIC FOR SINGLE OBSERVATION---
        for i, pds_path in enumerate(data_paths):
            gti_number = gti_numbers[i]
            
            # Derive RSP path directly from PDS path
            if '-bin.pds' in pds_path:
                rsp_path = pds_path.replace('-bin.pds', '-fak.rsp')
            elif '.pds' in pds_path:
                rsp_path = pds_path.replace('.pds', '.rsp')
            else:
                rsp_path = pds_path + ".rsp"

            pds_data_list, _ = read_fits_file(pds_path, [gti_number])
            rsp_data_list, _ = read_fits_file(rsp_path, [gti_number])

            if pds_data_list and rsp_data_list:
                # For single obs, prioritize GTI number in the legend
                label = f"GTI {gti_number}"
                
                process_and_append(
                    pds_data_list[0], rsp_data_list[0], 
                    min_value, gti_number, label,
                    x_data_list, y_data_list, y_uncertainties, plot_labels
                )

    if not x_data_list:
        empty_fig = go.Figure().add_annotation(text="No valid PDS data found to plot.", showarrow=False)
        if output_type == 'dict':
            import json
            return json.loads(empty_fig.to_json())
        return "No valid PDS data found to plot."

    # --- Calculate Ranges ---

    try:
        margin_factor = 0.1
        all_x = np.concatenate(x_data_list)
        all_y = np.concatenate(y_data_list)
        
        # Log-safe bounds
        lx_min, lx_max = np.log10(np.min(all_x[all_x > 0])), np.log10(np.max(all_x))
        ly_min, ly_max = np.log10(np.min(all_y[all_y > 0])), np.log10(np.max(all_y))
        
        xaxis_range = [lx_min - margin_factor*(lx_max-lx_min), lx_max + margin_factor*(lx_max-lx_min)]
        yaxis_range = [ly_min - margin_factor*(ly_max-ly_min), ly_max + margin_factor*(ly_max-ly_min)]
    except:
        xaxis_range = yaxis_range = None

    return data_plot(
        gti_numbers=gti_numbers,
        gti_labels=plot_labels,
        x_data_list=x_data_list,
        y_data_list=y_data_list,
        y_uncertainties=y_uncertainties,
        plot_kwargs={'mode': 'markers', 'output_type': output_type},
        layout_kwargs={
            'title': f'Power Density Spectrum {obs_id}',
            'xaxis_title': 'Frequency (Hz)',
            'yaxis_title': 'f x PDS Power (rms)',
            'xaxis_type': 'log',
            'yaxis_type': 'log',
            'showlegend': True,
            'xaxis_range': xaxis_range,
            'yaxis_range': yaxis_range,
            'template': 'plotly_white',
            'hovermode': 'closest'
        }
    )


def process_and_append(pds_data, rsp_data, min_value, gti_number, label, x_list, y_list, err_list, label_list):
    """Helper to process data and append to lists (Used by both modes)."""
    try:
        freq_center, power_density, error_density = process_pds_data(pds_data, rsp_data)
        
        # Adaptive Binning Logic
        if min_value and min_value > 0:
            with np.errstate(divide='ignore', invalid='ignore'):
                significance = power_density / error_density
                significance = np.where(np.isfinite(significance), significance, 0)
            
            pseudo_counts = significance ** 2
            
            if len(pseudo_counts) > 2 and np.sum(pseudo_counts) > 0:
                log_freq = np.log10(freq_center)
                min_bins = min_bin(min_value, pseudo_counts)
                
                data_stack = np.stack([log_freq, power_density, error_density, freq_center])
                (binned_log_freq, binned_power, binned_error, binned_freq_linear), _, _ = binning(
                    min_bins,
                    data_stack,
                )
                freq_center = binned_freq_linear
                power_density = binned_power
                error_density = binned_error

        x_list.append(freq_center)
        y_list.append(power_density)
        err_list.append(error_density)
        label_list.append(label)
        
    except Exception as e:
        print(f"Error processing PDS data: {e}")


def power_density_plot(
        min_value: int,
        data_paths: List[Tuple[str, str]],
        gti_numbers: List[int]) -> str:
    """Legacy wrapper."""
    pds_paths = [pds_path for pds_path, _ in data_paths]
    return get_pds_data_and_plot(min_value, "0", pds_paths, gti_numbers)
