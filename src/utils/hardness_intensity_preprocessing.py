"""
Utilities to correct HID (Hardness-Intensity Diagram)
"""
import os
from typing import List, Tuple, Any

import numpy as np
from numpy import ndarray
from scipy.spatial import ConvexHull
import plotly.graph_objects as go
from plotly.colors import qualitative

from src.utils.plots import data_plot
from src.utils.utils import min_bin, binning

def normalize_path(path: str) -> str:
    """Normalize a file path."""
    return os.path.normpath(path)

def hex_to_rgba(hex_color: str, opacity: float) -> str:
    """Convert hex color to rgba string for transparency control."""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 3:
        hex_color = ''.join([c*2 for c in hex_color])
    rgb = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    return f"rgba({rgb[0]}, {rgb[1]}, {rgb[2]}, {opacity})"

def read_lc_file(filename: str) -> ndarray:
    """Read a gzipped lightcurve file."""
    normalized_path: str = normalize_path(filename)
    if not os.path.exists(normalized_path):
        print(f"Warning: File not found: {normalized_path}")
        return np.array([])

    try:
        data: ndarray = np.loadtxt(normalized_path, usecols=[0, 5, 6, 7, 8])
        return data
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return np.array([])

def process_lc_file(filename: str) -> Tuple[ndarray, ndarray, ndarray]:
    """Process a lightcurve file and return time, hardness, and intensity."""
    lc_data: ndarray = read_lc_file(filename)
    
    if lc_data.size == 0:
        return np.array([]), np.array([]), np.array([])

    time: ndarray = lc_data[:, 0] / 8  # to seconds
    band1: ndarray = lc_data[:, 1]  # 0.3-2 keV
    band2: ndarray = lc_data[:, 2]  # 2-4 keV
    band3: ndarray = lc_data[:, 3]  # 4-6 keV
    band4: ndarray = lc_data[:, 4]  # 6-12 keV

    soft_band: ndarray = band2
    hard_band: ndarray = band3 + band4

    with np.errstate(divide='ignore', invalid='ignore'):
        hardness: ndarray = hard_band / soft_band

    hardness = np.where(np.isfinite(hardness), hardness, np.nan)
    intensity: ndarray = band1 + band2 + band3 + band4

    return time, hardness, intensity

def get_convex_hull(x: ndarray, y: ndarray) -> Tuple[ndarray, ndarray]:
    """Calculates the boundary polygon (Convex Hull) for a set of points."""
    if len(x) < 3:
        return None, None
    
    points = np.column_stack((x, y))
    try:
        hull = ConvexHull(points)
        indices = np.append(hull.vertices, hull.vertices[0])
        return x[indices], y[indices]
    except Exception:
        return None, None

# ==============================================================================
# MAIN DISPATCHER FUNCTION
# ==============================================================================
def get_hid_data_and_plot(
    min_value: int,
    obs_id: Any,
    data_paths: List[str],
    gti_numbers: List[int]
) -> str:
    """
    Main entry point for HID plotting.
    - Automatically detects if it's a Single Observation or Combined.
    - Routes to the correct plotting style.
    """
    obs_str = str(obs_id)
    
    # Check if multiple observations are present OR if multiple GTIs are selected for a single obs
    if ',' in obs_str or len(gti_numbers) > 1:
        return _combined_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers)
    else:
        return _single_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers)

# ==============================================================================
# STYLE 1: TIME PLOT (For Single Observation)
# ==============================================================================
def _single_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers) -> str:
    """Internal function for Single-Obs Time Gradient Plot."""
    all_hardness: List[float] = []
    all_intensity: List[float] = []
    all_time: List[float] = []
    all_intensity_counts: List[float] = []

    loop_limit = min(len(data_paths), len(gti_numbers))

    for i in range(loop_limit):
        lc_path = data_paths[i]
        time, hardness, intensity = process_lc_file(lc_path)
        if len(time) == 0: continue

        mask: ndarray = (hardness > 0) & (intensity > 0) & ~np.isnan(hardness) & ~np.isnan(intensity)
        all_time.extend(time[mask].tolist())
        all_hardness.extend(hardness[mask].tolist())
        all_intensity.extend(intensity[mask].tolist())
        
        # Adaptive binning prep
        intensity_counts = intensity[mask] * (1.0/8.0)
        all_intensity_counts.extend(intensity_counts.tolist())

    if not all_hardness:
        return "<div>No valid data to plot</div>"

    all_hardness = np.array(all_hardness)
    all_intensity = np.array(all_intensity)
    all_time = np.array(all_time)
    all_intensity_counts = np.array(all_intensity_counts)

    if min_value and min_value > 0:
        sort_indices = np.argsort(all_time)
        all_hardness = all_hardness[sort_indices]
        all_intensity = all_intensity[sort_indices]
        all_time = all_time[sort_indices]
        all_intensity_counts = all_intensity_counts[sort_indices]
        
        min_bins = min_bin(min_value, all_intensity_counts)
        data_stack = np.stack([all_hardness, all_intensity, all_time])
        (binned_hardness, binned_intensity, binned_time), _, _ = binning(min_bins, data_stack)
        
        all_hardness = binned_hardness
        all_intensity = binned_intensity
        all_time = binned_time
        print(f"HID adaptive binning: {len(sort_indices)} -> {len(all_hardness)} bins")

    # Range Calculation
    margin_factor = 0.1
    try:
        x_min, x_max = np.log10(min(all_hardness)), np.log10(max(all_hardness))
        y_min, y_max = np.log10(min(all_intensity)), np.log10(max(all_intensity))
        
        if x_min == x_max: x_min -= 0.1; x_max += 0.1
        if y_min == y_max: y_min -= 0.1; y_max += 0.1

        x_range = [x_min - (x_max-x_min)*margin_factor, x_max + (x_max-x_min)*margin_factor]
        y_range = [y_min - (y_max-y_min)*margin_factor, y_max + (y_max-y_min)*margin_factor]
    except:
        x_range, y_range = None, None

    norm_time = (all_time - np.min(all_time)) / (np.max(all_time) - np.min(all_time)) if len(all_time) > 1 else np.zeros_like(all_time)

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
            'xaxis_range': x_range,
            'yaxis_range': y_range,
            'showlegend': False,
            'template': 'plotly_white',
        }
    )

# ==============================================================================
# STYLE 2: REGION PLOT (For Combined Observations)
# ==============================================================================
def _combined_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers) -> str:
    """Internal function for Combined-Obs Polygon Plot."""
    obs_str = str(obs_id)
    obs_ids_list = obs_str.split(',')
    loop_limit = min(len(data_paths), len(gti_numbers))
    valid_datasets = []

    for i in range(loop_limit):
        lc_path = data_paths[i]
        gti_number = gti_numbers[i]
        
        current_obs = obs_ids_list[i % len(obs_ids_list)] if len(obs_ids_list) > 0 else obs_str
        label = f"{current_obs} (GTI {gti_number})"

        time, hardness, intensity = process_lc_file(lc_path)
        if len(time) == 0: continue

        mask: ndarray = (hardness > 0) & (intensity > 0) & ~np.isnan(hardness) & ~np.isnan(intensity)
        if np.sum(mask) == 0: continue
            
        time_valid = time[mask]
        hardness_valid = hardness[mask]
        intensity_valid = intensity[mask]
        
        if min_value and min_value > 0:
            sort_indices = np.argsort(time_valid)
            hardness_valid = hardness_valid[sort_indices]
            intensity_valid = intensity_valid[sort_indices]
            time_valid = time_valid[sort_indices]
            
            intensity_counts = intensity_valid * (1.0/8.0)
            min_bins = min_bin(min_value, intensity_counts)
            
            data_stack = np.stack([hardness_valid, intensity_valid, time_valid])
            (binned_hardness, binned_intensity, binned_time), _, _ = binning(min_bins, data_stack)
            hardness_valid = binned_hardness
            intensity_valid = binned_intensity

        final_mask = (hardness_valid > 0) & (intensity_valid > 0) & np.isfinite(hardness_valid) & np.isfinite(intensity_valid)
        hardness_valid = hardness_valid[final_mask]
        intensity_valid = intensity_valid[final_mask]
        
        if len(hardness_valid) > 0:
            valid_datasets.append({'h': hardness_valid, 'i': intensity_valid, 'label': label})

    if not valid_datasets:
        return "<div>No valid HID data found to plot.</div>"

    fig = go.Figure()
    colors = qualitative.Plotly * (len(valid_datasets) // len(qualitative.Plotly) + 1)
    all_h_vals, all_i_vals = [], []

    for idx, ds in enumerate(valid_datasets):
        color = colors[idx]
        all_h_vals.extend(ds['h'])
        all_i_vals.extend(ds['i'])

        # Boundary Trace (Polygon)
        hull_x, hull_y = get_convex_hull(ds['h'], ds['i'])
        if hull_x is not None:
            fill_color = hex_to_rgba(color, 0.1)
            fig.add_trace(go.Scatter(
                x=hull_x, y=hull_y, mode='lines', fill='toself', fillcolor=fill_color,
                line=dict(color=color, width=1, dash='solid'),
                name=f"{ds['label']} (Region)", hoverinfo='skip', showlegend=False
            ))

        # Scatter Trace (Points)
        fig.add_trace(go.Scatter(
            x=ds['h'], y=ds['i'], mode='markers',
            marker=dict(color=color, size=4, opacity=0.8, line=dict(width=0)),
            name=ds['label']
        ))

    try:
        margin = 0.1
        if all_h_vals and all_i_vals:
            x_min, x_max = np.log10(np.min(all_h_vals)), np.log10(np.max(all_h_vals))
            y_min, y_max = np.log10(np.min(all_i_vals)), np.log10(np.max(all_i_vals))
            if x_min == x_max: x_min -= 0.1; x_max += 0.1
            if y_min == y_max: y_min -= 0.1; y_max += 0.1
            x_range = [x_min - (x_max-x_min)*margin, x_max + (x_max-x_min)*margin]
            y_range = [y_min - (y_max-y_min)*margin, y_max + (y_max-y_min)*margin]
        else:
            x_range, y_range = None, None
    except:
        x_range, y_range = None, None

    return data_plot(
        x_data_list=[], y_data_list=[], fig=fig,
        layout_kwargs={
            'title': f'Combined Hardness-Intensity Diagram',
            'xaxis_title': r'$\text{Hardness}\ (4-12\ keV / 2-4\ keV)$',
            'yaxis_title': r'$\text{Intensity}\ (counts/s)$',
            'xaxis_type': 'log', 'yaxis_type': 'log',
            'xaxis_range': x_range, 'yaxis_range': y_range,
            'showlegend': True, 'template': 'plotly_white', 'hovermode': 'closest'
        }
    )