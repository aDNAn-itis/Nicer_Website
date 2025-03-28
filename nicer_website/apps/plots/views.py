"""
Main functions for backend functionality of the interactive plot page
"""
import os
import re
import logging as log
from typing import Any
from pathlib import Path
import tempfile
import zipfile

import numpy as np
from django.conf import settings
from django.shortcuts import render
from django.db.models import QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse, FileResponse

from nicer_website.apps.file_mgr.models import Item
from src.utils.spectrum_preprocessing import spectrum_plot
from src.utils.light_curve_preprocessing import light_curve_plot
from src.utils.power_density_processing import get_pds_data_and_plot
from src.utils.hardness_intensity_preprocessing import get_hid_data_and_plot

import logging
logger: logging.Logger = logging.getLogger(__name__)



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
        Http request containing either:
        - Single observation: GTI query (gti-search), observation ID (obs_id)
        - Multiple observations: comma-separated observation IDs (combined_obs_ids)
        Also includes pipeline quality (quality) and plot type (plot_type)

    Returns
    -------
    JsonResponse
        Json response containing the plot as a list of the HTML element (plotDivs)
    """
    gti: int | str
    min_value: int | None
    plot_divs: str
    obs_id: str = request.POST.get('obs_id') or ''
    quality: str = request.POST.get('quality')
    plot_type: str = request.POST.get('plot_type').replace('-', '_')
    dir_path: str = os.path.join(obs_id, 'jspipe/')
    gti_query: str | list[str] = request.POST.get('gti-search')
    gti_range: list[int]
    gti_list: list[int | range] = []
    file_names: list[str] = []
    files: QuerySet
    file_name: Item

    # min_value = int(request.POST.get('min_value') or PLOTS[plot_type]['min_value'])
    requested_min_value = request.POST.get('min_value')
    default_min_value = PLOTS[plot_type]['min_value'] if plot_type in PLOTS else None
    if requested_min_value is not None:
        try:
            min_value = int(requested_min_value)
        except (ValueError, TypeError):
            min_value = default_min_value
    else:
        min_value = default_min_value
        
    if plot_type not in PLOTS:
        return JsonResponse({
            'error': f'Invalid plot type: {plot_type}. Valid types are: {", ".join(PLOTS.keys())}'
        }, status=400)

    # Handle combined observations case
    if 'combined_obs_ids' in request.POST:
        obs_ids = request.POST.get('combined_obs_ids').split(',')
        all_file_names = []
        all_gti_list = []
        gti_obs_mapping = []

        for obs_id in obs_ids:
            dir_path = os.path.join(obs_id, 'jspipe/')
            files = Item.objects.filter(
                name__contains=quality,
                path=dir_path,
                type=Item.item_type[1][0],
            ).order_by('name')

            files = files.filter(name__contains=PLOTS[plot_type]['file_type'])

            for file_name in files:
                if match := re.search(r'GTI(\d+)', file_name.name):
                    gti = int(match.group(1))
                    full_path = os.path.join(settings.DATA_DIR, dir_path, file_name.name)
                    all_file_names.append(full_path)
                    all_gti_list.append(gti)
                    gti_obs_mapping.append(obs_id)

        if not all_file_names:
            return JsonResponse({'error': 'No GTI files found for the specified observations'})

        gti_labels = [f'GTI{gti} (Obs {obs_id})' for gti, obs_id in zip(all_gti_list, gti_obs_mapping)]

        plot_kwargs = {
            'min_value': min_value,
            'obs_id': obs_id,
            'data_paths': all_file_names,
            'gti_numbers': all_gti_list,
            'gti_labels': gti_labels,
        }

        if 'is_combined_obs' in PLOTS[plot_type].get('optional_params', []):
            plot_kwargs['is_combined_obs'] = True

        plot_divs = PLOTS[plot_type]['function'](**plot_kwargs)
        return JsonResponse({'plotDivs': [plot_divs]})

    # Handle single observation case
    required_params = ['plot_type', 'obs_id', 'gti-search']
    missing_params = [param for param in required_params if param not in request.POST]

    if missing_params:
        return JsonResponse({
            'error': f'Missing required parameters: {", ".join(missing_params)}'
        }, status=400)

    # Filter by quality, observation ID, and filter for files
    files = Item.objects.filter(
        name__contains=quality,
        path=dir_path,
        type=Item.item_type[1][0],
    ).order_by('name')

    # Filter by the plot type and append relative file location to data path
    dir_path = os.path.join(settings.DATA_DIR, dir_path)
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
            file_names.append(os.path.join(dir_path, file_name.name))

    # If no GTI found, use the first available GTI
    if not file_names:
        file_name = files.first()
        if not file_name:
            return JsonResponse({'error': 'No GTI files found for the specified observation'})

        match = re.search(r'GTI(\d+)', file_name.name)
        if not match:
            return JsonResponse({'error': 'Invalid GTI format in file name'})

        gti_list = [int(match.group(1))]
        file_names.append(dir_path + file_name.name)

    # Plot each GTI
    plot_divs = PLOTS[plot_type]['function'](min_value, obs_id, file_names, gti_list)
    return JsonResponse({'plotDivs': [plot_divs]})


def plot_data(request: HttpRequest) -> JsonResponse:
    """
    Tries to plot the specified data, matching the correct plot type

    Supports energy spectrum, light curve, and power density

    Parameters
    ----------
    request : HttpRequest
        POST request containing the variables observation ID (obs_id) or source name (source),
        pipeline (quality), and file types to be plotted (.jsgrp, .lc.gz)

    Returns
    -------
    JsonResponse
        Json response containing the plots as a list of HTML elements (plotDivs),
        observation ID (obsID), quality (quality), if spectrum is plotted (spectrum),
        and if light curve is plotted (lightCurve)
    """
    dir_path: str
    file_name: str
    obs_id: str = request.POST.get('obs_id')
    source: str = request.POST.get('source')
    quality: str = request.POST.get('quality')
    search_type: str = request.POST.get('search_type')
    max_gti: list[int] = []
    plot_divs: list[str] = []
    infos: list[dict[str, Any]] = []
    obs_ids: list[dict[str, str]]
    plot_type: dict[str, Any]
    logger: log.Logger = log.getLogger(__name__)
    info: np.ndarray
    indices: np.ndarray
    file_names: np.ndarray
    files: QuerySet
    obs_items: QuerySet

    if search_type == 'source' and source:
        obs_items = Item.objects.filter(
            source__icontains=source,
            type=Item.item_type[1][0],
        ).values('path', 'source').distinct()

        obs_ids = []
        for item in obs_items:
            path_parts = item['path'].split('/')
            if len(path_parts) > 0:
                obs_ids.append({'obs_id': path_parts[0], 'source': item['source']})

        if len(obs_ids) > 1:
            return JsonResponse({
                'multiple_observations': True,
                'obs_ids': obs_ids,
                'source': source
            })

        obs_id = obs_ids[0]['obs_id'] if obs_ids else None

    if obs_id:
        files = Item.objects.filter(
            name__contains=quality,
            path__startswith=os.path.join(obs_id, 'jspipe/'),
            type=Item.item_type[1][0],
        ).order_by('name')
        print(f"Found {files.count()} files for obs_id {obs_id}")

    if not obs_id or not files.exists():
        return JsonResponse({
            'error': f'No observable data found for '
            f"{f'source: {source}' if search_type == 'source' else f'observation ID: {obs_id}'}"
        })

    item = files.first()
    obs_info = {
        'ra': item.ra,
        'dec': item.dec,
        'tstart_tt': item.tstart_tt,
        'tstop_tt': item.tstop_tt,
        'obs_id': obs_id,
        'source': source or item.source,
        'ndets_used': item.ndets_used,
        'ushoot_net_rate': item.ushoot_net_rate,
        'oshoot_net_rate': item.oshoot_net_rate,
        'goodx_5_12_rate': item.changegoodx_5_12_rate,
    }

    dir_path = os.path.join(settings.DATA_DIR, obs_id, 'jspipe/')

    # Try to get data for specified plots
    try:
        # Get summary files for each GTI
        file_names = np.array(
            files.filter(name__contains='BGDATA.summary').values_list('name', flat=True)
        )

        if file_names.size == 0:
            return JsonResponse({'error': 'No summary files found for the given source name'})

        # Sort by GTI number
        indices = np.argsort(
            [int(re.search(r'GTI(\d+)', file_name).group(1)) for file_name in file_names]
        )

        # Get GTI info
        found_source = None
        available_gti = set()
        for file_name in file_names[indices]:
            gti_number = int(re.search(r'GTI(\d+)', file_name).group(1))
            available_gti.add(gti_number)

        if not available_gti:
            return JsonResponse({'error': 'No GTI data available'})

        for gti in range(max(available_gti) + 1):
            if gti not in available_gti:
                break
            file_name = re.sub(r'js_\d+_', f'js_{obs_id}_', file_names[indices][gti])
            file_name = dir_path + file_name
            info = np.char.replace(np.loadtxt(file_name, dtype=str, unpack=True), "'", '')
            info_dict = dict(zip(*info))
            infos.append(info_dict | {'GTI': f'GTI{gti}'})

            if 'OBJECT' in info_dict and not found_source:
                found_source = info_dict['OBJECT']

        # Plot depending on the data type
        for plot_type, plot_info in PLOTS.items():
            # Check if this plot type is requested in the POST data
            if plot_type.replace('_', '-') in request.POST:
            # if any(html_name for html_name, plot_key in html_to_plot_type.items()
                #    if html_name in request.POST and plot_key == plot_type):
                plot_info['exists'] = True
                file_names = files.filter(name__contains=plot_info['file_type'])
                file_names = file_names.exclude(name__regex=r'_BAND\d+')
                if file_names:
                    file_name = file_names.first().name
                    max_gti.append(len(file_names))

                    plot_divs.append(plot_info['function'](
                        plot_info['min_value'],
                        obs_id,
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
        'source': found_source or source,
        'obs_info': obs_info,
    })


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
    source: str = request.GET.get('source')
    suggested_obs: QuerySet

    if obs_id:
        # Query the database for the first 5 observation IDs that match the query
        suggested_obs = Item.objects.filter(
            name__startswith=obs_id,
            path=root,
            type=Item.item_type[0][0],
        ).order_by('name')[:count]
    elif source:
        # Query the database for the first 5 source names that contain the query
        suggested_obs = Item.objects.filter(
            source__icontains=source,
            type=Item.item_type[1][0],
        ).values('source').distinct().order_by('source')[:count]
    else:
        return JsonResponse({'error': 'No observation ID or source name provided'})

    # Check if any results were found and return them
    if not suggested_obs.exists():
        return JsonResponse({'error': 'Observational data not found'})

    # Return the relevant data based on whether obs_id or source was searched
    if obs_id:
        return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('name', flat=True))})
    else:
        return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('source', flat=True))})


def fetch_sources(request: HttpRequest, count: int = 5) -> JsonResponse:
    """
    Queries the data base for source names that contain the provided string
    """
    source_query = request.GET.get('source')
    suggested_sources = Item.objects.filter(
        source__icontains=source_query
    ).values('source').distinct().order_by('source')[:count]

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

def download_data(request):
    """Handle data downloads for observations and GTIs"""
    data_type = request.GET.get('type')
    obs_id = request.GET.get('obs_id')
    gti_numbers = request.GET.get('gti_numbers')

    logger.info(f"Download request - Type: {data_type}, OBS_ID: {obs_id}, GTI: {gti_numbers}")

    if not obs_id:
        return HttpResponse('OBS_ID is required', status=400)

    try:
        base_path = Path(settings.DATA_DIR)
        
        if data_type == 'gti':
            jspipe_dir = base_path / obs_id / 'jspipe'
            
            if not jspipe_dir.exists():
                return HttpResponse(f'Directory not found: {jspipe_dir}', status=404)

            if gti_numbers:
                gti_num = gti_numbers.split(',')[0]  # Get the first GTI number
                logger.info(f"Looking for GTI{gti_num} files")
                
                # Use strict pattern matching for GTI files
                matching_files = []
                for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI{gti_num}'):
                    if f'_GTI{gti_num}' in str(file):
                        matching_files.append(file)
                
                logger.info(f"Found files: {matching_files}")
                
                if not matching_files:
                    return HttpResponse(f'No files found for GTI{gti_num}', status=404)
                
                # If single file, return it directly
                if len(matching_files) == 1:
                    return FileResponse(
                        open(str(matching_files[0]), 'rb'),
                        as_attachment=True,
                        filename=matching_files[0].name
                    )
                
                # If multiple files, create a zip
                with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                    with zipfile.ZipFile(tmp.name, 'w') as archive:
                        for file in matching_files:
                            archive.write(str(file), file.name)
                    
                    return FileResponse(
                        open(tmp.name, 'rb'),
                        as_attachment=True,
                        filename=f'{obs_id}_GTI{gti_num}.zip'
                    )
            else:
                # If no GTI specified, return all GTI files
                return create_gti_archive(obs_id, [], base_path)
        
        elif data_type == 'obs':
            return create_obs_archive(obs_id, base_path)
        
        else:
            return HttpResponse('Invalid data type', status=400)

    except Exception as e:
        logger.exception("Error in download_data")
        return HttpResponse(f'Error: {str(e)}', status=500)

    # Fallback response if somehow we get here
    return HttpResponse('Invalid request', status=400)

def create_gti_archive(obs_id, gti_list, base_path):
    """Create a zip archive of GTI files"""
    logger.info(f"Creating GTI archive for OBS_ID {obs_id}, GTIs: {gti_list}")
    
    jspipe_dir = base_path / obs_id / 'jspipe'
    
    if not jspipe_dir.exists():
        return HttpResponse(f'Directory not found: {jspipe_dir}', status=404)

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        with zipfile.ZipFile(tmp.name, 'w') as archive:
            files_added = False
            
            if not gti_list:
                # Get all GTI files
                for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI*'):
                    logger.info(f"Adding file to archive: {file}")
                    archive.write(str(file), file.name)
                    files_added = True
            else:
                # Add files for specific GTIs
                for gti_num in gti_list:
                    for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI{gti_num}'):
                        if f'_GTI{gti_num}' in str(file):
                            logger.info(f"Adding file to archive: {file}")
                            archive.write(str(file), file.name)
                            files_added = True

            if not files_added:
                return HttpResponse('No GTI files found', status=404)

        return FileResponse(
            open(tmp.name, 'rb'),
            as_attachment=True,
            filename=f'{obs_id}_GTI_{"-".join(gti_list) if gti_list else "all"}.zip'
        )

def create_obs_archive(obs_id, base_path):
    """Create a zip archive of an entire observation"""
    obs_path = base_path / obs_id
    
    if not obs_path.exists():
        return HttpResponse('Observation not found', status=404)

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        with zipfile.ZipFile(tmp.name, 'w') as archive:
            for root, _, files in os.walk(str(obs_path)):
                for file in files:
                    file_path = os.path.join(root, file)
                    archive_path = os.path.relpath(file_path, str(obs_path))
                    archive.write(file_path, archive_path)

        return FileResponse(
            open(tmp.name, 'rb'),
            as_attachment=True,
            filename=f'{obs_id}_full.zip'
        )
