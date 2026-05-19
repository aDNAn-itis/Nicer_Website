"""
Utilities to correct HID (Hardness-Intensity Diagram)
Integrated v2026.05: Features Convex Hull Polygons + Scientific Binning Logic
"""
import os
import re
from typing import List, Tuple, Any

import numpy as np
from numpy import ndarray
from scipy.spatial import ConvexHull
import plotly.graph_objects as go
from plotly.colors import qualitative
from plotly.offline import plot


from src.utils.utils import min_bin, binning
from src.apps.plots.plots import data_plot


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
    
    if os.path.getsize(normalized_path) == 0:
        print(f"Warning: File is empty: {normalized_path}")
        return np.array([])

    import warnings
    try:
        # Columns: [time, band1, band2, band3, band4]
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            data: ndarray = np.loadtxt(normalized_path, usecols=[0, 5, 6, 7, 8])
        return data
    except Exception as e:
        print(f"Error reading {filename}: {e}")
        return np.array([])

def process_lc_file(filename: str) -> Tuple[ndarray, ndarray, ndarray, ndarray]:
    """
    Process a lightcurve file and return time, soft band, hard band, and total intensity.
    """
    lc_data: ndarray = read_lc_file(filename)
    
    if lc_data.size == 0:
        return np.array([]), np.array([]), np.array([]), np.array([])

    time: ndarray = lc_data[:, 0] / 8  # to seconds
    band1: ndarray = lc_data[:, 1]  # 0.3-2 keV
    band2: ndarray = lc_data[:, 2]  # 2-4 keV
    band3: ndarray = lc_data[:, 3]  # 4-6 keV
    band4: ndarray = lc_data[:, 4]  # 6-12 keV

    soft_band: ndarray = band2
    hard_band: ndarray = band3 + band4
    intensity: ndarray = band1 + band2 + band3 + band4

    return time, soft_band, hard_band, intensity

def calculate_convex_hull(x, y):
    """Calculates the boundary polygon (Convex Hull) for a set of points."""
    if x is None or y is None:
        return None, None
    
    # Ensure inputs are treated as 1D numpy arrays
    x_arr = np.asarray(x).flatten()
    y_arr = np.asarray(y).flatten()
    
    # Validation: Arrays must match and contain enough points to form a shape
    if len(x_arr) != len(y_arr) or len(x_arr) < 3:
        return None, None
    
    try:
        points = np.column_stack((x_arr, y_arr))
        hull = ConvexHull(points)
        # Close the loop by appending the first vertex to the end
        indices = np.append(hull.vertices, hull.vertices[0])
        return x_arr[indices], y_arr[indices]
    except Exception:
        # Gracefully handle collinear points or mathematical failures
        return None, None

# ==============================================================================
# MAIN DISPATCHER FUNCTION
# ==============================================================================
def get_hid_data_and_plot(
    min_value: int,
    obs_id: Any,
    data_paths: List[str],
    gti_numbers: List[int],
    gti_labels: list[str] | None = None,
    output_type: str = 'div'
) -> Any:
    """
    Main entry point for HID plotting.
    - Automatically detects if it's a Single Observation or Combined.
    - Routes to the correct plotting style.
    """
    obs_str = str(obs_id)
    
    # Combined logic: Multiple obs IDs or multiple GTIs selected
    if ',' in obs_str or len(gti_numbers) > 1:
        return _combined_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers, gti_labels, output_type=output_type)
    else:
        return _single_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers, gti_labels, output_type=output_type)

# ==============================================================================
# STYLE 1: TIME PLOT (For Single Observation)
# ==============================================================================
def _single_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers, gti_labels, output_type='div') -> Any:
    """Internal function for Single-Obs Time Gradient Plot."""
    all_time: List[float] = []
    all_soft_counts: List[float] = []
    all_hard_counts: List[float] = []
    all_intensity_counts: List[float] = []
    time_bin_width = None

    # Rahul's Robust Path Mapping
    path_by_gti: dict[int, str] = {}
    for p in data_paths:
        match = re.search(r'GTI(\d+)', p)
        if match:
            path_by_gti[int(match.group(1))] = p

    for gti_num in gti_numbers:
        lc_path = path_by_gti.get(gti_num)
        if not lc_path: continue

        time, soft, hard, intensity = process_lc_file(lc_path)
        if len(time) == 0: continue

        # Scientific Time-Bin Width Detection
        if time_bin_width is None and len(time) > 1:
            dt = np.diff(time)
            detected_width = float(np.nanmedian(dt))
            if detected_width > 0:
                time_bin_width = detected_width

        mask: ndarray = (soft > 0) & (intensity > 0) & ~np.isnan(soft) & ~np.isnan(intensity)
        all_time.extend(time[mask].tolist())
        
        # Prep counts for physically accurate binning
        dt_factor = time_bin_width if time_bin_width else 0.125
        all_soft_counts.extend((soft[mask] * dt_factor).tolist())
        all_hard_counts.extend((hard[mask] * dt_factor).tolist())
        all_intensity_counts.extend((intensity[mask] * dt_factor).tolist())

    if not all_time:
        return "<div>No valid data to plot</div>"

    if time_bin_width is None: time_bin_width = 0.125
    
    all_time = np.array(all_time)
    all_soft_counts = np.array(all_soft_counts)
    all_hard_counts = np.array(all_hard_counts)
    all_intensity_counts = np.array(all_intensity_counts)

    # Adaptive Binning
    if min_value and min_value > 0:
        sort_indices = np.argsort(all_time)
        data_stack = np.stack([all_soft_counts[sort_indices], all_hard_counts[sort_indices], all_time[sort_indices]])
        min_bins = min_bin(min_value, all_intensity_counts[sort_indices])
        # CORRECTED UNPACKING: bin_sizes is the second element
        (b_soft, b_hard, b_time), bin_sizes, _ = binning(min_bins, data_stack)
        
        # Rahul's Physical Rate Correction: sum(counts) / (N_bins * dt)
        all_hardness = b_hard / b_soft
        all_intensity = (b_soft + b_hard) / (bin_sizes * time_bin_width)
        all_time = b_time
    else:
        all_hardness = all_hard_counts / all_soft_counts
        all_intensity = (all_soft_counts + all_hard_counts) / time_bin_width

    # Explicit Log-Axis Range Calculation with 10% Margin
    try:
        margin_factor = 0.1
        lx_min, lx_max = np.log10(np.min(all_hardness)), np.log10(np.max(all_hardness))
        ly_min, ly_max = np.log10(np.min(all_intensity)), np.log10(np.max(all_intensity))
        
        if lx_min == lx_max: lx_min -= 0.1; lx_max += 0.1
        if ly_min == ly_max: ly_min -= 0.1; ly_max += 0.1

        x_range = [lx_min - (lx_max - lx_min) * margin_factor, lx_max + (lx_max - lx_min) * margin_factor]
        y_range = [ly_min - (ly_max - ly_min) * margin_factor, ly_max + (ly_max - ly_min) * margin_factor]
    except:
        x_range, y_range = None, None

    norm_time = (all_time - np.min(all_time)) / (np.max(all_time) - np.min(all_time)) if len(all_time) > 1 else np.zeros_like(all_time)

    return data_plot(
        x_data_list=[all_hardness],
        y_data_list=[all_intensity],
        color_data=norm_time.tolist(),
        plot_kwargs={'mode': 'markers', 'output_type': output_type},
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
def _combined_hid_plot_internal(min_value, obs_id, data_paths, gti_numbers, gti_labels, output_type='div') -> Any:
    """Internal function for Combined-Obs Polygon Plot."""
    obs_ids_list = str(obs_id).split(',')
    valid_datasets = []
    time_bin_width = None

    # Robust Path Mapping
    path_by_gti = {int(re.search(r'GTI(\d+)', p).group(1)): p for p in data_paths if re.search(r'GTI(\d+)', p)}

    for i, gti_num in enumerate(gti_numbers):
        lc_path = path_by_gti.get(gti_num)
        if not lc_path: continue
        
        label = gti_labels[i] if gti_labels else f"{obs_ids_list[i % len(obs_ids_list)]} (GTI {gti_num})"
        time, soft, hard, intensity = process_lc_file(lc_path)
        if len(time) == 0: continue

        # Detect Bin Width
        if time_bin_width is None and len(time) > 1:
            time_bin_width = float(np.nanmedian(np.diff(time)))

        mask = (soft > 0) & (intensity > 0)
        dt = time_bin_width if time_bin_width else 0.125
        
        s_counts, h_counts, t_vals = soft[mask] * dt, hard[mask] * dt, time[mask]
        
        if min_value and min_value > 0:
            sort = np.argsort(t_vals)
            min_bins = min_bin(min_value, (s_counts + h_counts)[sort])
            # CORRECTED UNPACKING: b_sz (bin sizes) must come before the unused uncertainty (_)
            (bs, bh, _), b_sz, _ = binning(min_bins, np.stack([s_counts[sort], h_counts[sort], t_vals[sort]]))
            h_final, i_final = bh / bs, (bs + bh) / (b_sz * dt)
        else:
            h_final, i_final = h_counts / s_counts, (s_counts + h_counts) / dt

        valid_datasets.append({'h': h_final, 'i': i_final, 'label': label})

    if not valid_datasets:
        return "<div>No valid HID data found to plot.</div>"

    fig = go.Figure()
    colors = qualitative.Plotly * (len(valid_datasets) // len(qualitative.Plotly) + 1)
    all_h_agg, all_i_agg = [], []

    for idx, ds in enumerate(valid_datasets):
        color = colors[idx]
        all_h_agg.extend(ds['h'])
        all_i_agg.extend(ds['i'])

        # Boundary Trace (Polygon/Convex Hull)
        hull_x, hull_y = calculate_convex_hull(ds['h'], ds['i'])
        if hull_x is not None:
            fig.add_trace(go.Scatter(
                x=hull_x, y=hull_y, mode='lines', fill='toself', 
                fillcolor=hex_to_rgba(color, 0.1), 
                line=dict(color=color, width=1),
                showlegend=False, hoverinfo='skip'
            ))

        # Scatter Trace (Data Points)
        fig.add_trace(go.Scatter(
            x=ds['h'], y=ds['i'], mode='markers', name=ds['label'],
            marker=dict(color=color, size=4, opacity=0.8)
        ))

    # Calculate Aggregated Range
    try:
        lx_m, lx_M = np.log10(np.min(all_h_agg)), np.log10(np.max(all_h_agg))
        ly_m, ly_M = np.log10(np.min(all_i_agg)), np.log10(np.max(all_i_agg))
        x_r = [lx_m - (lx_M - lx_m) * 0.1, lx_M + (lx_M - lx_m) * 0.1]
        y_r = [ly_m - (ly_M - ly_m) * 0.1, ly_M + (ly_M - ly_m) * 0.1]
    except:
        x_r = y_r = None

    return data_plot(
        x_data_list=[], y_data_list=[], fig=fig,
        plot_kwargs={'output_type': output_type},
        layout_kwargs={
            'title': 'Combined Hardness-Intensity Diagram',
            'xaxis_title': r'$\text{Hardness}\ (4-12\ keV / 2-4\ keV)$', 
            'yaxis_title': r'$\text{Intensity}\ (counts/s)$',
            'xaxis_type': 'log', 'yaxis_type': 'log', 
            'xaxis_range': x_r, 'yaxis_range': y_r,
            'showlegend': True, 'template': 'plotly_white', 'hovermode': 'closest'
        }
    )
