"""
Functions to plot graphs
"""
import logging
from typing import Any

import plotly.graph_objs as go
from numpy import ndarray
from plotly.offline import plot
from plotly.colors import qualitative

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
    """
    Plots data with uncertainties and background if provided.

    Parameters
    ----------
    plot_type : str, default = markers
        Plot marker type, can be markers, lines, or lines+markers
    gti_numbers : list[int] | None, default = None
        List of GTI numbers
    gti_labels : list[str] | None, default = None
        List of labels for each GTI
    colors : list[str] | None, default = None
        List of colors for each GTI, if None uses qualitative.Plotly
    x_errors : list[ndarray] | None, default = None
        List of x error bars
    x_data_list : list[ndarray] | None, default = None
        List of x-axis data
    y_data_list : list[ndarray] | None, default = None
        List of y-axis data
    y_uncertainties : list[ndarray] | None, default = None
        List of y-axis uncertainties
    background_list : list[ndarray] | None, default = None
        List of y-axis data for background
    x_background_list : list[ndarray] | None, default = None
        List of x-axis data for background
    plot_kwargs : dict[str, Any] | None, default = None
        Additional keyword arguments to pass to go.Scatter
    layout_kwargs : dict[str, Any] | None, default = None
        Additional keyword arguments to pass to fig.update_layout
    subplot_kwargs : dict[str, Any] | None, default = None
        Additional keyword arguments to pass to fig.add_trace
    color_data : ndarray | None, default = None
        Single array of color data for scatter plots
    fig : go.Figure | None, default = None
        Existing figure to add traces to, if None a new figure will be created

    Returns
    -------
    str
        Plot as HTML
    """
    trace_kwargs: dict[str, Any]
    logger: logging.Logger = logging.getLogger(__name__)

    # Initialize dictionaries
    plot_kwargs = plot_kwargs or {}
    layout_kwargs = layout_kwargs or {}
    fig = fig or go.Figure()

    bg_dash_style = plot_kwargs.pop('bg_dash', 'solid')

    # Check if gti_numbers is None or an empty list/array
    if gti_numbers is None or len(gti_numbers) == 0: 
        gti_numbers = [0]

    # Ensure all data lists have the same length
    data_lists = [
        x_data_list,
        y_data_list,
        x_errors,
        y_uncertainties,
        x_background_list,
        background_list,
    ]
    data_lists = [lst if lst is not None else [None] * len(gti_numbers) for lst in data_lists]

    if gti_labels is None:
        gti_labels = [f'GTI{number}' for number in gti_numbers]

    for (
        label,
        number,
        x_data,
        y_data,
        x_error,
        y_uncertainty,
        x_background,
        background,
        color,
    ) in zip(
        gti_labels,
        gti_numbers,
        *data_lists,
        colors or qualitative.Plotly * (len(gti_numbers) // len(qualitative.Plotly) + 1),
    ):
        if x_data is None or y_data is None:
            logger.warning(f"Missing data for GTI {number}. Skipping.")
            continue

        trace_kwargs = {
            'x': x_data,
            'y': y_data,
            'mode': plot_type,
            'name': label,
            'opacity': 1.0,  # Default opacity
            'line': {'color': color},
            'marker': {'color': color, 'opacity': 1.0},  # Default marker opacity
            'legendgroup': number,
        }

        if x_error is not None:
            trace_kwargs['error_x'] = {'type': 'data', 'array': x_error, 'visible': True}
        if y_uncertainty is not None:
            trace_kwargs['error_y'] = {'type': 'data', 'array': y_uncertainty, 'visible': True}

        # For scatter plots with color data
        if color_data is not None and len(x_data_list) == 1:
            trace_kwargs.update({
                'mode': 'markers',
                'marker': {
                    'size': 5,
                    'color': color_data,
                    'colorscale': 'Viridis',
                    'colorbar': {'title': layout_kwargs.get('colorbar_title', 'Time')},
                    'showscale': True,
                    'opacity': 1.0  # Default marker opacity
                }
            })

        # Update with any additional plot-specific kwargs
        trace_kwargs.update(plot_kwargs)

        fig.add_trace(go.Scatter(**trace_kwargs), **subplot_kwargs or {})

        # Add background trace if provided
        if x_background is not None and background is not None:
            fig.add_trace(go.Scatter(
                x=x_background,
                y=background,
                mode='lines',
                name=f'{label} BG',
                opacity=0.8,
                line={'color': color, 'dash': bg_dash_style},
                legendgroup=number,
            ), **subplot_kwargs or {})

    fig.update_layout(**layout_kwargs)

    return plot(
        fig,
        output_type='div',
        include_plotlyjs=False,
        config={'displaylogo': False},
    )
