"""
Functions to plot graphs - Integrated v2026.05.03
"""
import logging
from typing import Any

import numpy as np
import plotly.graph_objs as go
from numpy import ndarray
from plotly.io import to_json
from plotly.colors import qualitative
from plotly.offline import plot
# Rahul's constant for safe log plotting
LOG_SCALE_MIN_VALUE = 1e-10

def clip_for_log_scale(data: ndarray, min_value: float = LOG_SCALE_MIN_VALUE) -> ndarray:
    """Clips data values to a minimum threshold for safe log scale plotting."""
    if data is None: return None
    data = np.asarray(data, dtype=float)
    clipped = np.where((data <= 0) | ~np.isfinite(data), min_value, data)
    return np.maximum(clipped, min_value)

def compute_adaptive_log_y_range(
        y_series: list[ndarray | None],
        bg_series: list[ndarray | None] | None = None,
        min_value: float = LOG_SCALE_MIN_VALUE,
) -> list[float] | None:
    """Compute an adaptive log10 y-axis range."""
    source_values = []
    for series in y_series:
        if series is None: continue
        arr = np.asarray(series, dtype=float)
        valid = arr[np.isfinite(arr) & (arr > 0)]
        if valid.size: source_values.append(valid)
    if not source_values: return None

    src_all = np.concatenate(source_values)
    max_y = float(np.max(src_all))
    if bg_series:
        bg_vals = [np.asarray(s)[np.isfinite(s) & (np.asarray(s) > 0)] for s in bg_series if s is not None]
        if bg_vals: max_y = max(max_y, float(np.max(np.concatenate(bg_vals))))
    
    min_y = float(max(np.min(src_all), min_value))
    lower = min_y
    if src_all.size >= 20 and (max_y / min_y) > 1e3:
        p5 = float(max(np.percentile(src_all, 5), min_value))
        if np.log10(max_y / min_y) - np.log10(max_y / p5) >= 1.5: lower = p5

    return [float(np.log10(max(lower, min_value)) - 0.35), float(np.log10(max_y) + 0.25)]

def handle_log_scale_uncertainties(y_data: ndarray, y_uncertainty: ndarray, min_value: float = LOG_SCALE_MIN_VALUE):
    """Classifies points into detection categories for log scale."""
    y_data = np.asarray(y_data, dtype=float)
    y_uncertainty = np.asarray(y_uncertainty, dtype=float)
    y_upper = y_data + y_uncertainty
    valid_mask = (y_upper > 0) & np.isfinite(y_data) & np.isfinite(y_uncertainty)
    
    upper_limit_mask = (y_data <= 0) & valid_mask
    unconstrained_low_mask = (y_data > 0) & ((y_data - y_uncertainty) <= 0) & valid_mask
    
    y_err_plus = y_uncertainty.copy()
    y_err_minus = y_uncertainty.copy()
    y_err_plus[upper_limit_mask] = 0
    y_err_minus[upper_limit_mask] = 0
    if np.any(unconstrained_low_mask):
        y_err_minus[unconstrained_low_mask] = np.maximum(y_data[unconstrained_low_mask] - min_value, 0)
    
    ul_y_values = np.where(upper_limit_mask, y_upper, y_data)
    return valid_mask, upper_limit_mask, unconstrained_low_mask, y_err_plus, y_err_minus, ul_y_values

def data_plot(
        plot_type: str = 'markers',
        gti_numbers: list[int] | None = None,
        gti_labels: list[str] | None = None,
        colors: list[str] | None = None,
        x_errors: list[ndarray] | None = None,
        x_data_list: list[ndarray] | None = None,
        y_data_list: list[ndarray] | None = None,
        y_uncertainties: list[ndarray] | None = None,
        background_list: list[ndarray] | None = None,
        x_background_list: list[ndarray] | None = None,
        plot_kwargs: dict[str, Any] | None = None,
        layout_kwargs: dict[str, Any] | None = None,
        subplot_kwargs: dict[str, Any] | None = None,
        color_data: ndarray | None = None,
        fig: go.Figure | None = None) -> str:
    """Plots data with integrated log-scale scientific logic."""
    logger = logging.getLogger(__name__)
    plot_kwargs = plot_kwargs.copy() if plot_kwargs else {}
    layout_kwargs = layout_kwargs or {}
    out_format = plot_kwargs.pop('output_type', 'div')
    
    fig = fig or go.Figure()
    bg_dash_style = plot_kwargs.pop('bg_dash', 'solid')

    if not gti_numbers: gti_numbers = [0]

    # Detect log scale early
    y_axis_type = layout_kwargs.get('yaxis', {}).get('type', layout_kwargs.get('yaxis_type', 'linear'))
    is_log_scale = y_axis_type == 'log'

    data_lists = [x_data_list, y_data_list, x_errors, y_uncertainties, x_background_list, background_list]
    data_lists = [lst if lst is not None else [None] * len(gti_numbers) for lst in data_lists]

    if gti_labels is None: gti_labels = [f'GTI{number}' for number in gti_numbers]

    for (label, number, x_data, y_data, x_error, y_unc, x_bg, bg, color) in zip(
        gti_labels, gti_numbers, *data_lists, 
        colors or qualitative.Plotly * (len(gti_numbers) // len(qualitative.Plotly) + 1)):
        
        if x_data is None or y_data is None: continue
        x_data, y_data = np.asarray(x_data), np.asarray(y_data)

        # Log scale scientific processing
        ul_mask, ucl_mask, ul_y, y_ep, y_em = None, None, None, None, None
        if is_log_scale:
            if y_unc is not None:
                v_mask, ul_mask, ucl_mask, y_ep, y_em, ul_y = handle_log_scale_uncertainties(y_data, y_unc)
                x_data, y_data, y_ep, y_em, ul_mask, ucl_mask, ul_y = [a[v_mask] for a in [x_data, y_data, y_ep, y_em, ul_mask, ucl_mask, ul_y]]
                if x_error is not None: x_error = np.asarray(x_error)[v_mask]
            
            y_data, ul_y = clip_for_log_scale(y_data), clip_for_log_scale(ul_y)
            if bg is not None: bg = clip_for_log_scale(np.asarray(bg))

        # Main Trace (Detections + Unconstrained)
        det = ~ul_mask if ul_mask is not None else np.ones(len(y_data), dtype=bool)
        trace_kwargs = {
            'x': x_data[det], 'y': y_data[det], 'mode': plot_type, 'name': label,
            'line': {'color': color}, 'marker': {'color': color, 'opacity': 1.0}, 'legendgroup': number,
        }
        if x_error is not None: trace_kwargs['error_x'] = {'type': 'data', 'array': x_error[det], 'visible': True}
        if y_ep is not None:
            trace_kwargs['error_y'] = {'type': 'data', 'array': y_ep[det], 'arrayminus': y_em[det], 'visible': True}
        elif y_unc is not None:
            trace_kwargs['error_y'] = {'type': 'data', 'array': y_unc[det], 'visible': True}

        if color_data is not None and len(x_data_list) == 1:
            trace_kwargs['marker'].update({'size': 5, 'color': color_data, 'colorscale': 'Viridis', 'showscale': True})

        trace_kwargs.update(plot_kwargs)
        fig.add_trace(go.Scatter(**trace_kwargs), **subplot_kwargs or {})

        # Upper Limit Arrows
        if ul_mask is not None and np.any(ul_mask):
            fig.add_trace(go.Scatter(
                x=x_data[ul_mask], y=ul_y[ul_mask], mode='markers', name=f'{label} UL',
                marker={'symbol': 'arrow-down', 'size': 10, 'color': color, 'line': {'width': 1, 'color': 'black'}},
                legendgroup=number, showlegend=False
            ), **subplot_kwargs or {})

        # Unconstrained Lower Bound Arrows
        if ucl_mask is not None and np.any(ucl_mask):
            fig.add_trace(go.Scatter(
                x=x_data[ucl_mask], y=y_data[ucl_mask] * 0.7, mode='markers',
                marker={'symbol': 'arrow-down', 'size': 8, 'color': color},
                legendgroup=number, showlegend=False, hoverinfo='skip'
            ), **subplot_kwargs or {})

        # Background Trace
        if x_bg is not None and bg is not None:
            fig.add_trace(go.Scatter(
                x=x_bg, y=bg, mode='lines', name=f'{label} BG', opacity=0.8,
                line={'color': color, 'dash': bg_dash_style}, legendgroup=number,
            ), **subplot_kwargs or {})

    # Adaptive log range
    if is_log_scale and 'range' not in layout_kwargs.get('yaxis', {}):
        arange = compute_adaptive_log_y_range(data_lists[1], data_lists[5])
        if arange: layout_kwargs.setdefault('yaxis', {})['range'] = arange

    fig.update_layout(**layout_kwargs)
    
    if out_format == 'dict':
        import json
        return json.loads(fig.to_json())
        
    return plot(fig, output_type='div', include_plotlyjs=False, config={'displaylogo': False})