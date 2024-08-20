"""
Main functions for backend functionality of the interactive plot page
"""
import re
import logging as log
from typing import Any

import numpy as np
from numpy import ndarray
from django.conf import settings
from django.shortcuts import render
from django.db.models import QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse

from nicer_website.apps.file_mgr.models import Item
from src.utils.spectrum_preprocessing import spectrum_plot
from src.utils.light_curve_preprocessing import light_curve_plot
from src.utils.power_density_processing import get_pds_data_and_plot
from src.utils.hardness_intensity_preprocessing import get_hid_data_and_plot

# Log axis
# Info field (avg count)
# Ability to choose grouping binning

# Global variable
PLOTS: dict[str, dict[str, Any]] = {
    'spectrum': {
        'exists': False,
        'min_value': None,
        'file_type': '.jsgrp',
        'function': spectrum_plot,
    },
    'light_curve': {
        'exists': False,
        'min_value': 100,
        'file_type': '.lc.gz',
        'function': light_curve_plot,
    },
    'power_density_spectrum': {
        'exists': False,
        'min_value': None,
        'file_type': '-bin.pds',
        'function': get_pds_data_and_plot,
    },
    'hardness_intensity_diagram': {
        'exists': False,
        'min_value': None,
        'file_type': '.lc.gz',
        'function': get_hid_data_and_plot,
    },
}


def plot_gti(request: HttpRequest) -> JsonResponse:
    """
    Plots multiple GTI observations for a single plot

    Parameters
    ----------
    request : HttpRequest
        Http request containing the variables GTI query (gti-search), observation ID (obs_id),
        pipeline quality (quality) and plot type (plot_type)

    Returns
    -------
    JsonResponse
        Json response containing the plot as a list of the HTML element (plotDivs)
    """
    gti: int | str
    min_value: int = int(request.POST['min_value'])
    plot_divs: str
    obs_id: str = request.POST['obs_id']
    quality: str = request.POST['quality']
    plot_type: str = request.POST['plot_type']
    dir_path: str = f'{obs_id}/jspipe/'
    gti_query: str | list[str] = request.POST['gti-search']
    gti_range: list[int]
    gti_list: list[int | range] = []
    file_names: list[str] = []
    files: QuerySet
    file_name: Item

    # Filter by quality, observation ID, and filter for files
    files = Item.objects.filter(
        name__contains=quality,
        path=dir_path,
        type=Item.item_type[1][0],
    ).order_by('name')

    # Filter by the plot type and append relative file location to data path
    dir_path = f'{settings.DATA_DIR}/{dir_path}'
    files = files.filter(name__contains=PLOTS[plot_type]['file_type'])

    # Remove characters that are not numbers or dashes, and separate by commas
    gti_query = re.sub(r'[^\d,-]', '', gti_query).split(',')

    # Convert dashes to a list of integers in the range of the two numbers
    for gti in gti_query:
        if re.search(r'\d+-\d+', gti):
            gti_range = list(map(int, gti.split('-')))
            gti_range[-1] += 1
            gti_list.extend(range(*gti_range))
        elif gti.isdigit():
            gti_list.append(int(gti))

    # Filter for each GTI
    for gti in gti_list:
        file_name = files.filter(name__regex=fr'^\w*GTI{gti}[^\d][-_.\w]*$').first()

        if file_name:
            file_names.append(dir_path + file_name.name)

    # If not GTI found, use the first available GTI
    if not file_names:
        file_name = files.first().name
        gti_list = re.search(r'GTI(\d+)', file_name).group(1)
        file_names.append(dir_path + file_name)

    # Plot each GTI
    plot_divs = PLOTS[plot_type]['function'](min_value, file_names, gti_list)
    return JsonResponse({'plotDivs': [plot_divs]})


def plot_data(request: HttpRequest) -> JsonResponse:
    file_name: str
    obs_id: str = request.POST.get('obs_id')
    source_name: str = request.POST.get('source_name')
    quality: str = request.POST['quality']
    dir_path: str
    max_gti: list[int] = []
    plot_divs: list[str] = []
    infos: list[dict[str, Any]] = []
    plot_type: dict[str, Any]
    logger: log.Logger = log.getLogger(__name__)
    info: np.ndarray
    indices: np.ndarray
    file_names: np.ndarray
    files: QuerySet

    if obs_id:
        # Existing obs_id search logic
        dir_path = f'{obs_id}/jspipe/'
        files = Item.objects.filter(
            name__contains=quality,
            path__startswith=dir_path,
            type=Item.item_type[1][0],
        ).order_by('name')
    elif source_name:
        # New source name search logic
        files = Item.objects.filter(
            name__contains=quality,
            source_name__icontains=source_name,
            type=Item.item_type[1][0],
        ).order_by('name')
        if files:
            obs_id = files.first().path.split('/')[0]
            dir_path = f'{obs_id}/jspipe/'
        else:
            return JsonResponse({'error': 'No files found for the given source name'})
    else:
        return JsonResponse({'error': 'No observation ID or source name provided'})

    dir_path = f'{settings.DATA_DIR}/{dir_path}'

    # Try to get data for specified plots
    try:
        # Get summary files for each GTI
        file_names = np.array(
            files.filter(name__contains='BGDATA.summary').values_list('name', flat=True)
        )

        # Sort by GTI number
        indices = np.argsort(
            [int(re.search(r'GTI(\d+)', file_name).group(1)) for file_name in file_names]
        )

        # Get GTI info
        found_source_name = None
        for file_name in file_names[indices]:
            file_name = dir_path + file_name
            info = np.char.replace(np.loadtxt(file_name, dtype=str, unpack=True), "'", '')
            info_dict = dict(zip(*info))
            infos.append(info_dict | {'GTI': re.search(r'GTI\d+', file_name).group(0)})

            if 'OBJECT' in info_dict and not found_source_name:
                found_source_name = info_dict['OBJECT']

        # Plot depending on the data type
        for plot_type, plot_info in PLOTS.items():
            # mapping between HTML form names and PLOTS keys
            html_to_plot_type = {
                'spectrum': 'spectrum',
                'light-curve': 'light_curve',
                'power-density-spectrum': 'power_density_spectrum',
                'hardness-intensity-diagram': 'hardness_intensity_diagram'
            }

            # Check if this plot type is requested in the POST data
            if any(html_name for html_name, plot_key in html_to_plot_type.items()
                   if html_name in request.POST and plot_key == plot_type):
                plot_info['exists'] = True
                file_names = files.filter(name__contains=plot_info['file_type'])
                file_names = file_names.exclude(name__regex=r'_BAND\d+')
                if file_names:
                    file_name = file_names.first().name
                    max_gti.append(len(file_names))

                    plot_divs.append(plot_info['function'](
                        plot_info['min_value'],
                        [dir_path + file_name],
                        [0],
                    ))
                else:
                    max_gti.append(0)

    except AttributeError as error:
        logger.error(f'{error}\nNo valid data in {dir_path}')
        return JsonResponse({'error': f'Error processing data: {str(error)}'})

    return JsonResponse({
        'plotDivs': plot_divs,
        'obsID': obs_id,
        'quality': quality,
        'spectrum': PLOTS['spectrum']['exists'],
        'lightCurve': PLOTS['light_curve']['exists'],
        'powerSpectrum': PLOTS['power_density_spectrum']['exists'],
        'hardnessIntensity': PLOTS['hardness_intensity_diagram']['exists'],
        'maxGTI': max_gti,
        'info': infos,
        'source_name': found_source_name or source_name,
    })


# def fetch_observations(request: HttpRequest, count: int = 5) -> JsonResponse:
#     """
#     Queries the data base with a provided path to return the first 5 items
#     that contain the path and item name sorted by type first, then name
#
#     Parameters
#     ----------
#     request : HttpRequest
#         Request containing the variable 'path' which contains the path and item name
#     count : int, default = 5
#         Number of items to return
#
#     Returns
#     -------
#     JsonResponse
#         Json response containing a dictionary with 5 items matching the query
#     """
#     # Get the queried observation ID from the request and root path
#     root: str = Item._meta.get_field('path').get_default()  # pylint: disable=protected-access # get source name field
#     obs_id: str = request.GET.get('obs_id')
#     suggested_obs: QuerySet
#
#     # Query the database for the first 5 observation IDs that match the query
#     suggested_obs = Item.objects.filter(
#         name__startswith=obs_id,
#         path=root,
#         type=Item.item_type[0][0],
#     ).order_by('name')[:count]
#
#     return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('name', flat=True))})

def fetch_observations(request: HttpRequest, count: int = 5) -> JsonResponse:
    """
    Queries the database with a provided path to return the first 5 items
    that contain the path and item name sorted by type first, then name.

    Parameters
    ----------
    request : HttpRequest
        Request containing the variable 'obs_id' or 'source' for search.
    count : int, default = 5
        Number of items to return.

    Returns
    -------
    JsonResponse
        JSON response containing a dictionary with matching items.
    """
    root: str = Item._meta.get_field('path').get_default()
    obs_id: str = request.GET.get('obs_id')
    source_name: str = request.GET.get('source')
    suggested_obs: QuerySet

    if obs_id:
        # Query the database for the first 5 observation IDs that match the query
        suggested_obs = Item.objects.filter(
            name__startswith=obs_id,
            path=root,
            type=Item.item_type[0][0],
        ).order_by('name')[:count]
    elif source_name:
        # Query the database for the first 5 source names that contain the query
        suggested_obs = Item.objects.filter(
            source_name__icontains=source_name,
            type=Item.item_type[1][0],
        ).values('source_name').distinct().order_by('source_name')[:count]
    else:
        return JsonResponse({'error': 'No observation ID or source name provided'})

    # Check if any results were found and return them
    if not suggested_obs.exists():
        return JsonResponse({'error': 'Observational data not found'})

    # Return the relevant data based on whether obs_id or source_name was searched
    if obs_id:
        return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('name', flat=True))})
    else:
        return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('source_name', flat=True))})




def fetch_sources(request: HttpRequest, count: int = 5) -> JsonResponse:
    """
    Queries the data base for source names that contain the provided string
    """
    source_query = request.GET.get('source')
    suggested_sources = Item.objects.filter(
        source_name__icontains=source_query
    ).values('source_name').distinct().order_by('source_name')[:count]

    return JsonResponse({'source_suggestions': list(suggested_sources)})


def interactive_plot(request: HttpRequest) -> HttpResponse:
    """
    Loads the interactive plot page

    Parameters
    ----------
    request : HttpRequest
        Request for the interactive plot page

    Returns
    -------
    HttpResponse
        Interactive plot page
    """
    return render(request, 'plots/plot.html', {
        'plot_divs': None,
    })
