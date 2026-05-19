"""
Utility to correct light curve data
Integrated Version: v2026.05.03
"""

from typing import Any

import numpy as np
from numpy import ndarray
from plotly.colors import qualitative
from plotly.subplots import make_subplots

from src.utils.utils import min_bin, binning
from src.apps.plots.plots import data_plot



def light_curve_data(
        min_value: int,
        data_path: str,
        start_time: float = None,
        stop_time: float = None) -> tuple[
            ndarray[tuple[int], np.dtype[np.float64]],
            ndarray[tuple[int], np.dtype[np.float64]],
            ndarray[tuple[int], np.dtype[np.float64]],
            ndarray[tuple[int], np.dtype[np.float64]],
            ndarray[tuple[int], np.dtype[np.float64]],
            ndarray[tuple[int], np.dtype[np.float64]]]:
    """
    Fetches and corrects binned light curve data
    """
    dets: int
    time_diff: float
    min_bins: ndarray[tuple[int], np.dtype[np.int_]]
    x_bin: ndarray[tuple[int], np.dtype[np.float64]]
    y_bin: ndarray[tuple[int], np.dtype[np.float64]]
    bg_bin: ndarray[tuple[int], np.dtype[np.float64]]
    counts: ndarray[tuple[int], np.dtype[np.float64]]
    x_width: ndarray[tuple[int], np.dtype[np.float64]]
    x_error: ndarray[tuple[int], np.dtype[np.float64]]
    bg_x_bin: ndarray[tuple[int], np.dtype[np.float64]]
    background: ndarray[tuple[int], np.dtype[np.float64]]
    data: ndarray[tuple[int, int], np.dtype[np.float64]]
    uncertainty: ndarray[tuple[int, int], np.dtype[np.float64]]

    # Load Data with your original try/except structure
    import os
    import warnings

    if not os.path.exists(data_path) or os.path.getsize(data_path) == 0:
        print(f"Skipping empty or missing file: {data_path}")
        return (np.array([]),) * 6

    try:
        # Rahul's scientific column selection (1, 2, 3) integrated with your dtype
        with warnings.catch_warnings():
            warnings.simplefilter("ignore")
            data = np.loadtxt(data_path, usecols=[1, 2, 3], unpack=True, dtype=float)
        
        bg_path = data_path.replace('.lc.gz', '.bg-lc.gz')
        try:
            if os.path.exists(bg_path) and os.path.getsize(bg_path) > 0:
                background = np.loadtxt(bg_path, usecols=2)
            else:
                background = np.zeros(len(data[0]))
        except:
            background = np.zeros(len(data[0]))

        # --- YOUR ORIGINAL TIME FILTERING LOGIC ---
        if start_time is not None and stop_time is not None:
            time_mask = (data[0] >= start_time) & (data[0] <= stop_time)
            data = data[:, time_mask]
            if background.size > 0:
                if background.size == len(time_mask):
                    background = background[time_mask]
                else:
                    background = np.zeros(len(data[0]))

        if len(data[0]) < 2:
            raise IndexError("Not enough data points in light curve")
        time_diff = float(data[0][1] - data[0][0])
        counts = data[1] * time_diff
        dets = int(data[2][0])

        # --- INTEGRATED BINNING STRATEGY ---
        # Adopting Rahul's exact np.arange strategy for scientific bin_factor
        bin_factor = int(min_value) if min_value > 0 else 1
        min_bins = np.arange(0, len(counts), bin_factor)
        if len(min_bins) == 0 or min_bins[-1] != len(counts):
            min_bins = np.append(min_bins, len(counts))
        min_bins = np.unique(min_bins)

        # Maintaining your validation check
        valid_len = min(len(counts), len(background), len(data[0]))
        
        (y_bin, bg_bin, x_bin), x_width, uncertainty = binning(
            min_bins,
            np.stack((
                counts[:valid_len], 
                background[:valid_len], 
                data[0][:valid_len]
            )),
        )

        # Normalise data
        y_bin = (y_bin - bg_bin) / (dets * time_diff)
        bg_bin /= dets
        bg_bin = np.insert(bg_bin, [0, -1], [bg_bin[0], bg_bin[-1]])
        x_error = x_width * time_diff / 2
        uncertainty /= dets * time_diff
        bg_x_bin = x_bin.copy()
        bg_x_bin = np.insert(
            bg_x_bin,
            [0, bg_x_bin.size],
            [x_bin[0] - x_error[0], x_bin[-1] + x_error[-1]],
        )

        return x_bin, y_bin, bg_x_bin, bg_bin, x_error, uncertainty[0]
    except Exception as e:
        print(f"Skipping empty or corrupt file: {data_path}")
        return (np.array([]),) * 6

def align_light_curves(
        min_value: int,
        data_paths: list[str],
        gti_numbers: list[int],
) -> tuple:
    """
    Aligns multiple light curves by ensuring correct GTI interval separation.
    NOTE: Used for single-obs GTI stitching logic.
    """
    i: int
    gti_num: int
    max_duration: float
    data_path: str
    group: list[dict[str, ndarray]]
    aligned_group: list[dict[str, ndarray]]
    x_data: list[ndarray] = []
    y_data: list[ndarray] = []
    x_errors: list[ndarray] = []
    background: list[ndarray] = []
    x_background: list[ndarray] = []
    uncertainties: list[ndarray] = []
    gti_groups: dict = {}
    aligned_gti_groups: dict = {}

    for data_path, gti_num in zip(data_paths, gti_numbers):
        data = light_curve_data(min_value, data_path)

        if gti_num not in gti_groups:
            gti_groups[gti_num] = []

        gti_groups[gti_num].append(dict(zip(
            ['x_bin', 'y_bin', 'bg_x_bin', 'bg_bin', 'x_err', 'uncertainty'],
            data
        )))

    for gti_num, group in gti_groups.items():
        aligned_group = []
        max_duration = max(data['x_bin'][-1] - data['x_bin'][0] for data in group)

        for i, group_data in enumerate(group):
            orig_x_bin = group_data['x_bin']
            orig_duration = orig_x_bin[-1] - orig_x_bin[0]
            scale_factor = max_duration / orig_duration
            total_offset = i * (max_duration + 5400)

            scaled_x_bin = ((orig_x_bin - orig_x_bin[0]) * scale_factor) + total_offset
            scaled_bg_x_bin = (
                (group_data['bg_x_bin'] - group_data['bg_x_bin'][0]) * scale_factor
            ) + total_offset

            aligned_group.append({
                'x_bin': scaled_x_bin,
                'y_bin': group_data['y_bin'],
                'bg_x_bin': scaled_bg_x_bin,
                'bg_bin': group_data['bg_bin'],
                'x_err': group_data['x_err'] * scale_factor,
                'uncertainty': group_data['uncertainty']
            })

        aligned_gti_groups[gti_num] = aligned_group

    for gti_num in sorted(aligned_gti_groups.keys()):
        for aligned_group_data in aligned_gti_groups[gti_num]:
            x_data.append(aligned_group_data['x_bin'])
            y_data.append(aligned_group_data['y_bin'])
            x_background.append(aligned_group_data['bg_x_bin'])
            background.append(aligned_group_data['bg_bin'])
            x_errors.append(aligned_group_data['x_err'])
            uncertainties.append(aligned_group_data['uncertainty'])

    return x_data, y_data, x_background, background, x_errors, uncertainties

def light_curve_plot(
    min_value: int,
    obs_id: Any,
    data_paths: list[str],
    gti_numbers: list[int],
    gti_labels: list[str] | None = None,
    is_combined_obs: bool = False,
    start_time: float = None,
    stop_time: float = None,
    output_type: str = 'div') -> Any:
    
    import re
    import numpy as np
    from plotly.offline import plot
    import plotly.graph_objs as go
    from plotly.colors import qualitative

    # 1. Initialize variables
    x_axis_label = r"$\rm Relative\ Time\ (day)$"
    x_data, y_data, x_error, background, x_background, y_uncertainties = [], [], [], [], [], []
    final_gti_nums, final_labels = [], []

    # 2. Data Loading Loop - Path extraction ensures correct ID mapping
    for i, data_path in enumerate(data_paths):
        try:
            x_bin, y_bin, bg_x_bin, bg_bin, x_err, uncertainty = light_curve_data(
                min_value, data_path, start_time=start_time, stop_time=stop_time
            )
            if len(x_bin) > 0:
                path_match = re.search(r'/(\d{10})/', data_path)
                actual_oid = path_match.group(1) if path_match else str(obs_id)
                
                x_data.append(x_bin); y_data.append(y_bin)
                x_background.append(bg_x_bin); background.append(bg_bin)
                x_error.append(x_err); y_uncertainties.append(uncertainty)
                final_gti_nums.append(gti_numbers[i])
                final_labels.append(actual_oid)
        except: continue

    if not x_data:
        empty_fig = go.Figure().add_annotation(text="No valid data", showarrow=False)
        return plot(empty_fig, output_type='div', include_plotlyjs=False)

    # 3. Synchronized Normalization
    obs_group_starts = {}
    for datum, oid in zip(x_data, final_labels):
        obs_group_starts[oid] = min(obs_group_starts.get(oid, float('inf')), np.min(datum))

    for i in range(len(x_data)):
        ref_t = obs_group_starts[final_labels[i]]
        x_data[i] = (x_data[i] - ref_t) / 86400.0
        x_background[i] = (x_background[i] - ref_t) / 86400.0
    x_error = [datum / 86400.0 for datum in x_error]

    # 4. Global Sorting & Box Detection
    idxs = np.argsort([min(d) for d in x_data])
    x_data = [x_data[j] for j in idxs]
    y_data = [y_data[j] for j in idxs]
    x_background = [x_background[j] for j in idxs]
    background = [background[j] for j in idxs]
    x_error = [x_error[j] for j in idxs]
    y_uncertainties = [y_uncertainties[j] for j in idxs]
    final_labels = [final_labels[j] for j in idxs]
    final_gti_nums = [final_gti_nums[j] for j in idxs]

    subplot_kwargs = [{'row': 1, 'col': 1}]
    for i in range(1, len(x_data)):
        gap = np.min(x_data[i]) - np.max(x_data[i-1])
        subplot_kwargs.append({'row': 1, 'col': subplot_kwargs[-1]['col'] + (1 if gap > 0.05 else 0)})

    # 5. Color Mapping Logic
    unique_oids = sorted(list(obs_group_starts.keys()))
    is_multi_obs = len(unique_oids) > 1
    
    # ObsID map for Multi-Obs Comparison
    color_palette = [qualitative.Plotly[0], "#EF553B", qualitative.Plotly[2], qualitative.Plotly[4]]
    color_map = {oid: color_palette[k % len(color_palette)] for k, oid in enumerate(unique_oids)}

    fig = make_subplots(rows=1, cols=subplot_kwargs[-1]['col'], shared_yaxes=True, horizontal_spacing=0.01)
    
    # 6. Plotting Loop
    seen_oids = set()
    for i in range(len(x_data)):
        oid = final_labels[i]
        gti_n = final_gti_nums[i]
        
        # 🟢 FEATURE 1: Color Logic
        # If multi-obs, use ObsID color. If single search, use index color (rainbow).
        color = color_map[oid] if is_multi_obs else qualitative.Plotly[i % len(qualitative.Plotly)]
        
        # 🟢 FEATURE 2: Double-Click Compatibility
        # Naming format: "ObsID GTI Number" so JS regex matches it
        trace_name = f"{oid} GTI {gti_n}"
        
        data_plot(
            plot_type='lines+markers', gti_numbers=[gti_n], colors=[color], gti_labels=[trace_name],
            x_errors=[x_error[i]], x_data_list=[x_data[i]], y_data_list=[y_data[i]],
            y_uncertainties=[y_uncertainties[i]], background_list=[background[i]], x_background_list=[x_background[i]],
            plot_kwargs={
                'mode': 'markers', 
                'legendgroup': oid if is_multi_obs else trace_name, 
                'legendgrouptitle_text': f"ObsID: {oid}" if is_multi_obs and oid not in seen_oids else None,
                'name': trace_name, 
                'showlegend': True,
                'output_type': output_type
            },
            layout_kwargs={'template': 'plotly_white', 'hovermode': 'closest'},
            subplot_kwargs=subplot_kwargs[i], fig=fig,
        )
        seen_oids.add(oid)
        fig.data[-1].showlegend = False # Hide BG trace

    fig.update_layout(title="Light Curve Comparison", legend=dict(groupclick="toggleitem"))
    fig.add_annotation(text=x_axis_label, xref='paper', yref='paper', x=0.5, y=-0.15, showarrow=False)

    if output_type == 'div': 
        return plot(fig, output_type='div', include_plotlyjs=False)
    elif output_type == 'dict':
        import json
        return json.loads(fig.to_json())
    return fig