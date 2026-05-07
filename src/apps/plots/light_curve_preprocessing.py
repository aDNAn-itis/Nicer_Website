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
        # Rahul's scientific column selection (0, 2, 3) integrated with your dtype
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
    """
    Gets and plots the corrected light curve data.
    """
    plot: str = ''
    subplot_kwargs: list[dict[str, Any]] = []
    x_data: list[ndarray[tuple[int], np.dtype[np.float64]]] = []
    y_data: list[ndarray[tuple[int], np.dtype[np.float64]]] = []
    x_error: list[ndarray[tuple[int], np.dtype[np.float64]]] = []
    background: list[ndarray[tuple[int], np.dtype[np.float64]]] = []
    x_background: list[ndarray[tuple[int], np.dtype[np.float64]]] = []
    y_uncertainties: list[ndarray[tuple[int], np.dtype[np.float64]]] = []

    if isinstance(obs_id, list):
      obs_ids_list = [str(oid).strip() for oid in obs_id]
    else:
      obs_ids_list = [oid.strip() for oid in str(obs_id).split(',') if oid.strip()]

    if is_combined_obs:
       if len(obs_ids_list) <= len(data_paths):
         gti_labels = []
         for i in range(len(data_paths)):
             oid = obs_ids_list[i % len(obs_ids_list)] 
             gti_labels.append(f"{oid}")
    
    if gti_labels is None:
        gti_labels = [f'GTI{gti}' for gti in gti_numbers]

    # --- 2. Process Data ---
    for data_path in data_paths:
        try:
            x_bin, y_bin, bg_x_bin, bg_bin, x_err, uncertainty = light_curve_data(
                min_value,
                data_path,
                start_time=start_time,
                stop_time=stop_time
            )
        except Exception as e:
            print(f"Skipping empty or corrupt file: {data_path}")
            continue

        if len(x_bin) > 0:
            x_data.append(x_bin)
            y_data.append(y_bin)
            x_background.append(bg_x_bin)
            background.append(bg_bin)
            x_error.append(x_err)
            y_uncertainties.append(uncertainty)

    # --- 3. INTEGRATED SORTING AND NORMALIZATION LOGIC ---
    if is_combined_obs:
        # === YOUR OVERLAY MODE (DAYS, ZERO-START) ===
        x_background = [(datum - datum[0]) / 86400.0 for datum in x_background]
        x_data = [(datum - datum[0]) / 86400.0 for datum in x_data]
        x_error = [datum / 86400.0 for datum in x_error] 
        
        subplot_kwargs = [{'row': 1, 'col': 1}] * len(x_data)
        x_axis_label = r'$\text{Relative Time (days)}$'
    
    else:
        # --- RAHUL'S CHRONOLOGICAL SORTING INTEGRATED ---
        idxs = np.argsort([min(datum) if len(datum)>0 else 0 for datum in x_data])
        gti_numbers = [gti_numbers[idx] for idx in idxs]
        gti_labels = [gti_labels[idx] for idx in idxs]
        x_data = [x_data[idx] for idx in idxs]
        y_data = [y_data[idx] for idx in idxs]
        x_background = [x_background[idx] for idx in idxs]
        background = [background[idx] for idx in idxs]
        x_error = [x_error[idx] for idx in idxs]
        y_uncertainties = [y_uncertainties[idx] for idx in idxs]
        gti_labels = [gti_labels[idx] for idx in idxs]

        # Maintaining your Relative Time (day) logic
        if len(x_data) > 0:
            start_t = x_data[0][0]
            x_background = [(datum - start_t) / 86400.0 for datum in x_background]
            x_data = [(datum - start_t) / 86400.0 for datum in x_data]
            x_error = [datum / 86400.0 for datum in x_error]

        # --- INTEGRATED DYNAMIC SUBPLOT GAP DETECTION ---
        subplot_kwargs = [{'row': 1, 'col': 1}]
        for i, x_datum in enumerate(x_data[1:]):
            # Adopting Rahul's 10x bin width gap threshold logic
            current_x_errors = x_error[i + 1]
            max_bin_width = 2 * np.max(current_x_errors) if len(current_x_errors) > 0 else 0

            if max_bin_width > 0 and x_datum[0] - x_data[i][-1] > 10 * max_bin_width:
                subplot_kwargs.append({'row': 1, 'col': subplot_kwargs[-1]['col'] + 1})
            else:
                subplot_kwargs.append({'row': 1, 'col': subplot_kwargs[-1]['col']})
        
        x_axis_label = r'$\rm Relative\ Time\ (day)$'

    # --- 4. Plot Generation ---
    cols_count = subplot_kwargs[-1]['col'] if subplot_kwargs else 1
    
    fig = make_subplots(
        rows=1,
        cols=cols_count,
        shared_yaxes=True,
        horizontal_spacing=0.01,
    )
    
    fig.add_annotation(
        text=x_axis_label,
        xref='paper',
        yref='paper',
        x=0.5,
        y=-0.15,
        showarrow=False,
        xanchor='center',
        yanchor='top',
        font=dict(size=14),
    )

    result_plot = None
    for i, (
        gti_number,
        gti_label,
        color,
        x_datum,
        y_datum,
        x_err,
        y_uncertainty,
        bg_x_datum,
        bg_datum,
        subplot_kw,
    ) in enumerate(zip(
        gti_numbers,
        gti_labels,
        qualitative.Plotly * (len(gti_numbers) // len(qualitative.Plotly) + 1),
        x_data,
        y_data,
        x_error,
        y_uncertainties,
        x_background,
        background,
        subplot_kwargs,
    )):
        # --- YOUR ORIGINAL COMBINED MODE ANNOTATION LOGIC ---
        if is_combined_obs and len(x_datum) > 0:
            end_time = x_datum[-1]
            fig.add_vline(
                x=end_time, 
                line_width=2, 
                line_dash="dash", 
                line_color=color,
                opacity=0.8,
                row=1, col=1,
                layer="above" 
            )
            fig.add_annotation(
                x=end_time,
                y=1.05, 
                yref="paper", 
                text=f"{end_time:.4f} d",
                showarrow=False,
                font=dict(size=10, color=color),
                textangle=-90,
                xanchor="center",
                yanchor="bottom"
            )

        # Maintaining your data_plot signature
        result_plot = data_plot(
            plot_type='lines+markers',
            gti_numbers=[gti_number],
            colors=[color],
            gti_labels=[gti_label],
            x_errors=[x_err],
            x_data_list=[x_datum],
            y_data_list=[y_datum],
            y_uncertainties=[y_uncertainty],
            background_list=[bg_datum],
            x_background_list=[bg_x_datum],
            plot_kwargs={'mode': 'markers', 'opacity': 0.7 if is_combined_obs else 1.0, 'output_type': output_type},
            layout_kwargs={
                'title': f'Light Curve {obs_id}',
                'yaxis_title': r'$\text{Photons}\ (s^{-1} {\rm det}^{-1})$',
                'showlegend': True if is_combined_obs else (i == len(gti_numbers) - 1),
                'template': 'plotly_white',
                'hovermode': 'closest'
            },
            subplot_kwargs=subplot_kw,
            fig=fig,
        )
    return result_plot