"""
Main functions for backend functionality of the interactive plot page
"""
import os
import re
import zipfile
import tempfile
import logging as log
from time import time
from typing import Any
from pathlib import Path
from dataclasses import dataclass

import numpy as np
from django.conf import settings
from django.shortcuts import render
from django.db.models import QuerySet, Q
from django.http import HttpRequest, HttpResponse, JsonResponse, FileResponse

from nicer_website.apps.file_mgr.models import Item
from src.apps.plots.spectrum_preprocessing import spectrum_plot
from src.apps.plots.light_curve_preprocessing import light_curve_plot
from src.apps.plots.power_density_processing import get_pds_data_and_plot
from src.apps.plots.summed_spectrum_preprocessing import summed_spectrum_plot
from src.apps.plots.hardness_intensity_preprocessing import get_hid_data_and_plot


# Log axis
# Info field (avg count)
# Ability to choose grouping binning

LOGGER: log.Logger = log.getLogger(__name__)
PLOTS: dict[str, dict[str, Any]] = {
    'spectrum': {
        'exists': False,
        'min_value': 0,  # Default min_value for spectrum
        'file_type': '.jsgrp',
        'function': spectrum_plot,
    },
    'summed_spectrum': {
        'exists': False,
        'min_value': 0,  # Default min_value for summed spectrum
        'file_type': '.jsgrp',
        'function': summed_spectrum_plot,
    },
    'light_curve': {
        'exists': False,
        'min_value': 100, # Default min_value for light_curve
        'file_type': '.lc.gz',
        'function': light_curve_plot,
    },
    'power_density_spectrum': {
        'exists': False,
        'min_value': 10,  # Default min_value for PDS adaptive binning (significance-based)
        'file_type': '-bin.pds',
        'function': get_pds_data_and_plot,
    },
    'hardness_intensity_diagram': {
        'exists': False,
        'min_value': 25,  # Default min_value for HID adaptive binning
        'file_type': '.lc.gz',
        'function': get_hid_data_and_plot,
    },
}


@dataclass
class PlotRequest:
    """
    Dataclass for plot request parameters.

    Attributes
    ----------
    obs_id : int
        Observation ID
    min_value : float
        Minimum value for adaptive binning or plotting
    quality : str
        Pipeline quality
    plot_type : str
        Type of plot to generate
    gti_query : str | list[str]
        GTI query string or list of GTIs
    combined_obs_ids : list[int] | None
        List of combined observation IDs for multi-observation plots
    """
    obs_id: int
    min_value: float
    quality: str
    plot_type: str
    gti_query: str | list[str]
    combined_obs_ids: list[int] | None = None

    def __repr__(self) -> str:
        return (f'PlotRequest(obs_id={self.obs_id}, min_value={self.min_value}, '
                f'quality={self.quality}, plot_type={self.plot_type}, gti_query={self.gti_query}, '
                f'combined_obs_ids={self.combined_obs_ids})')


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


def multi_obs_gti(req: PlotRequest) -> JsonResponse:
    """
    Loads the combined GTI plot

    Parameters
    ----------
    req : PlotRequest
        Plot request containing combined observation IDs and other parameters

    Returns
    -------
    JsonResponse
        Json response containing the combined GTI plot
    """
    obs_id: int
    plot_divs: str
    plot_kwargs: dict[str, bool | int | float | list[int] | list[str]] = {
        'is_combined_obs': 'is_combined_obs' in PLOTS[req.plot_type].get('optional_params', []),
        'min_value': req.min_value,
        'obs_id': req.obs_id,
        'data_paths': [],
        'gti_numbers': [],
        'gti_labels': [],
    }
    idxs: np.ndarray
    query: Q = Q()
    files: QuerySet[Item]
    file: Item

    for obs_id in req.combined_obs_ids:
        query |= Q(obs_id=obs_id)

    files = Item.objects.filter(
        query,
        Q(name__contains=PLOTS[req.plot_type]['file_type']) | Q(name__contains=req.quality),
        type=Item.file,
    )

    for file in files:
        if match := re.search(r'GTI(\d+)', file.name):
            plot_kwargs['data_paths'].append(str(os.path.join(
                settings.DATA_DIR,
                file.obsid,
                'jspipe',
                file.name,
            )))
            plot_kwargs['gti_numbers'].append(int(match.group(1)))
            plot_kwargs['gti_labels'].append(f'GTI{match.group(1)} (Obs {obs_id})')

    idxs = np.argsort(plot_kwargs['gti_numbers'])
    plot_kwargs['data_paths'] = np.array(plot_kwargs['data_paths'])[idxs].tolist()
    plot_kwargs['gti_numbers'] = np.array(plot_kwargs['gti_numbers'])[idxs].tolist()
    plot_kwargs['gti_labels'] = np.array(plot_kwargs['gti_labels'])[idxs].tolist()

    if not plot_kwargs['data_paths']:
        LOGGER.error('No GTI files found')
        return JsonResponse({
            'error': 'No GTI files found for the specified combined observations'
        })

    plot_divs = PLOTS[req.plot_type]['function'](**plot_kwargs)
    LOGGER.info('Successfully generated plot divs')
    return JsonResponse({'plotDivs': [plot_divs]})


def single_obs_summed(data_dir: str, req: PlotRequest) -> tuple[list[int], list[str]]:
    """
    Loads all GTI files for a single observation summed spectrum.

    Parameters
    ----------
    data_dir : str
        Directory path for the observation
    req : PlotRequest
        Plot request containing observation ID and other parameters

    Returns
    -------
    tuple[list[int], list[str]]
        Tuple containing a list of GTI numbers and a list of file paths
    """
    gti_nums: list[int] = []
    file_paths: list[str] = []
    gti_match: re.Match[str] | None
    files: QuerySet[Item]
    file: Item

    files = Item.objects.filter(
        Q(name__contains=req.quality) & Q(name__contains=PLOTS[req.plot_type]['file_type']),
        obsid=req.obs_id,
        type=Item.file,
    )

    for file in files:
        file_path = os.path.join(data_dir, file.name)
        file_paths.append(file_path)
        gti_match = re.search(r'GTI(\d+)', file.name)

        if gti_match:
            gti_nums.append(int(gti_match.group(1)))
        else:
            gti_nums.append(0)
    return gti_nums, file_paths


def single_obs_gti(data_dir: str, req: PlotRequest) -> tuple[list[int], list[str]]:
    """
    Loads GTI files for a single observation based on the GTI query.

    Parameters
    ----------
    data_dir : str
        Directory path for the observation
    req : PlotRequest
        Plot request containing observation ID and other parameters

    Returns
    -------
    tuple[list[int], list[str]]
        Tuple containing a list of GTI numbers and a list of file paths
    """
    i: int
    gti_num: int
    gti: str
    gti_nums: list[int] = []
    file_paths: list[str] = []
    gti_match: re.Match[str] | None
    idxs: np.ndarray
    files: QuerySet[Item]
    query: Q = Q()
    file: Item | None

    gti_query = re.sub(r'[^\d,-]', '', req.gti_query).split(',')

    for gti in gti_query:
        if re.search(r'\d+-\d+', gti):
            gti_range = list(map(int, gti.split('-')))
            gti_range[-1] += 1
            gti_nums.extend(range(*gti_range))
        elif gti.isdigit():
            gti_nums.append(int(gti))

    gti_nums = np.unique(gti_nums).tolist()
    LOGGER.info(f'Parsed GTIs from query: {gti_nums}')

    for gti_num in gti_nums:
        query |= Q(name__regex=fr'^\w*GTI{gti_num}\D[-_.\w]*$')

    gti_nums = []
    files = Item.objects.filter(
        query,
        Q(name__contains=req.quality) & Q(name__contains=PLOTS[req.plot_type]['file_type']),
        obsid=req.obs_id,
        type=Item.file,
    )

    for file in files:
        gti_nums.append(int(re.search(r'GTI(\d+)', file.name).group(1)))
        file_paths.append(os.path.join(data_dir, file.name))

    idxs = np.argsort(gti_nums)
    gti_nums = np.array(gti_nums)[idxs].tolist()
    file_paths = np.array(file_paths)[idxs].tolist()

    if file_paths:
        return gti_nums, file_paths[::-1]

    LOGGER.info('No files found for specified GTIs (or no GTIs specified in query), attempting '
                'to use a default GTI')

    if file := files.first():
        file_paths = [os.path.join(data_dir, file.name)]

        if gti_match := re.search(r'GTI(\d+)', file.name):
            gti_nums = [int(gti_match.group(1))]
        else:
            LOGGER.warning(f'Could not extract GTI number from default file {file.name}, using GTI '
                           f'0 as fallback for plotting function')
            gti_nums = [0]
    return gti_nums, file_paths


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
    min_value: int
    obs_id: int
    ti: float
    quality: str
    plot_type: str
    dir_path: str
    gti_nums: list[int]
    file_paths: list[str]
    files: QuerySet[Item]
    plot_req: PlotRequest = PlotRequest(
        obs_id=int(request.POST.get('obs_id', 0)),
        min_value=float(request.POST.get('min_value', 0)),
        quality=request.POST.get('quality', ''),
        plot_type=request.POST.get('plot_type', '').replace('-', '_'),
        gti_query=request.POST.get('gti-search', ''),
        combined_obs_ids=[
            int(obs) for obs in request.POST.get('combined_obs_ids', '').split(',')
        ] if 'combined_obs_ids' in request.POST else None,
    )

    if not plot_req.min_value:
        plot_req.min_value = PLOTS[plot_req.plot_type]['min_value']

    data_dir = os.path.join(settings.DATA_DIR, os.path.join(str(plot_req.obs_id), 'jspipe'))
    LOGGER.info(f'Received POST data: {plot_req}')

    if not plot_req.obs_id and not plot_req.combined_obs_ids:
        LOGGER.error("obs_id is missing from POST data.")
        return JsonResponse({'error': 'obs_id is required.'}, status=400)
    if not plot_req.plot_type:
        LOGGER.error("plot_type is missing from POST data.")
        return JsonResponse({'error': 'plot_type is required.'}, status=400)

    if plot_req.plot_type not in PLOTS:
        LOGGER.error(f"Invalid plot type: '{plot_req.plot_type}'")
        return JsonResponse({'error': f'Invalid plot type: {plot_req.plot_type}'}, status=400)

    if plot_req.combined_obs_ids:
        LOGGER.info('Handling combined observations')
        return multi_obs_gti(plot_req)

    if plot_req.plot_type == 'summed_spectrum':
        LOGGER.info(f'Handling summed spectrum for ObsID: {plot_req.obs_id}')
        gti_nums, file_paths = single_obs_summed(data_dir, plot_req)
    else:
        LOGGER.info(f'Handling single observation for ObsID: {plot_req.obs_id}')
        gti_nums, file_paths = single_obs_gti(data_dir, plot_req)

    if not gti_nums or not file_paths:
        LOGGER.error('No GTI files found')
        return JsonResponse(
            {'error': f'No GTI files found for plot type {plot_req.plot_type} in ObsID '
                      f'{plot_req.obs_id}'},
            status=400,
        )

    LOGGER.info(f'Using GTIs: {gti_nums} with files: {file_paths}')
    ti = time()
    plot_divs = PLOTS[plot_req.plot_type]['function'](
        plot_req.min_value,
        plot_req.obs_id,
        file_paths,
        gti_nums
    )
    plot_function_time = time() - ti
    LOGGER.info(f'Generated plot divs in {plot_function_time:.3f} s')
    return JsonResponse({'plotDivs': [plot_divs]})


def plot_data(request: HttpRequest) -> JsonResponse:
    """
    Tries to plot the specified data, matching the correct plot type.

    Supports energy spectrum, light curve, and power density.

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
    root: str
    dir_path: str
    file_name: str
    obs_search: bool = request.POST.get('obs_search', 'true').lower() == 'true'
    obs_id: str = request.POST.get('obs_id', '')
    source: str = request.POST.get('source', '')
    quality: str = request.POST.get('quality', '')
    max_gti: list[int] = []
    plot_divs: list[str] = []
    infos: list[dict[str, Any]] = []
    obs_ids: list[dict[str, str]] = []
    item: Item
    plot_type: dict[str, Any]
    info: np.ndarray
    indices: np.ndarray
    file_names: np.ndarray
    files: QuerySet[Item]
    obs_items: QuerySet[Item]

    if not obs_search and source:
        obs_items = Item.objects.filter(
            source=source,
            type=Item.dir,
        ).distinct('path', 'source')

        for item in obs_items:
            root = Path(item.path).parts[0]
            obs_ids.append({'obs_id': root, 'source': item.source})

        if len(obs_ids) > 1:
            return JsonResponse({
                'multiple_observations': True,
                'obs_ids': obs_ids,
                'source': source
            })

        obs_id = obs_ids[0]['obs_id'] if obs_ids else ''

    if obs_id:
        files = Item.objects.filter(
            name__contains=quality,
            path__startswith=os.path.join(obs_id, 'jspipe'),
            type=Item.file,
        ).order_by('name')
        print(f"Found {files.count()} files for obs_id {obs_id}")

    if not obs_id or not files.exists():
        return JsonResponse({
            'error': f'No observable data found for '
            f"{f'observation ID: {obs_id}' if obs_search else f'source: {source}'}"
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
        'goodx_0p5_12_rate': item.goodx_0p5_12_rate,
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
            info = np.char.replace(np.loadtxt(
                os.path.join(dir_path, file_name),
                dtype=str,
                unpack=True,
            ), "'", '')
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
                LOGGER.info(f"[plot_data] Processing plot type: {plot_type}")
                plot_info['exists'] = True
                file_names = files.filter(name__contains=plot_info['file_type'])
                file_names = file_names.exclude(name__regex=r'_BAND\d+')
                if file_names:
                    max_gti.append(len(file_names))
                    plot_function_start = time()

                    # Special handling for summed spectrum - include all GTI files
                    if plot_type == 'summed_spectrum':
                        # Get all GTI files for summed spectrum
                        all_file_paths = []
                        all_gti_numbers = []

                        for file_item in file_names.order_by('name'):
                            all_file_paths.append(dir_path + file_item.name)
                            # Extract GTI number from filename
                            gti_match = re.search(r'GTI(\d+)', file_item.name)
                            if gti_match:
                                all_gti_numbers.append(int(gti_match.group(1)))
                            else:
                                all_gti_numbers.append(0)  # fallback

                        LOGGER.info(
                            f"[plot_data] Summed spectrum using {len(all_file_paths)} "
                            f"GTI files: GTIs {all_gti_numbers}",
                        )
                        plot_div = plot_info['function'](
                            plot_info['min_value'],
                            obs_id,
                            all_file_paths,
                            all_gti_numbers,
                        )
                    else:
                        # Regular handling for other plot types - use first file only
                        file_name = file_names.first().name
                        LOGGER.info(
                            f"[plot_data] Calling {plot_type} function with file: {file_name}",
                        )
                        plot_div = plot_info['function'](
                            plot_info['min_value'],
                            obs_id,
                            [dir_path + file_name],
                            [0],
                        )

                    plot_function_time = time() - plot_function_start
                    LOGGER.info(
                        f"[plot_data] {plot_type} function completed in {plot_function_time:.3f}s",
                    )
                    plot_divs.append(plot_div)
                else:
                    LOGGER.warning(f"[plot_data] No files found for plot type: {plot_type}")
                    max_gti.append(0)

    except AttributeError as error:
        LOGGER.error(f'{error}\nNo valid data in {dir_path}')
        return JsonResponse({'error': f'Error processing data: {str(error)}'})

    return JsonResponse({
        'plotDivs': plot_divs,
        'obsID': obs_id,
        'quality': quality,
        'spectrum': PLOTS['spectrum']['exists'],
        'summedSpectrum': PLOTS['summed_spectrum']['exists'],
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
        Request containing the variable 'obs_id' or 'source' for search
    count : int, default = 5
        Number of items to return

    Returns
    -------
    JsonResponse
        JSON response containing a dictionary with matching items
    """
    obs_id: str = request.GET.get('obs_id', '')
    source: str = request.GET.get('source', '')
    suggested_obs: QuerySet[Item]

    # Query the database for the first 5 observation IDs or source names that match the query
    if obs_id:
        suggested_obs = Item.objects.filter(
            name__startswith=obs_id,
            path=Item.root,
            type=Item.dir,
        ).order_by('name')[:count]
    elif source:
        suggested_obs = Item.objects.filter(
            source__istartswith=source,
            type=Item.dir,
        ).distinct().order_by('source')[:count]
    else:
        return JsonResponse({
            'suggestions': [],
            'error': 'No observation ID or source name provided',
        })

    # Check if any results were found and return them
    if not suggested_obs.exists():
        return JsonResponse({'suggestions': [], 'error': 'Observational data not found'})
    return JsonResponse({
        'suggestions': list(suggested_obs.values_list('name' if obs_id else 'source', flat=True)),
    })


def fetch_sources(request: HttpRequest, count: int = 5) -> JsonResponse:
    """
    Queries the data base for source names that contain the provided string
    """
    source_query = request.GET.get('source')
    suggested_sources = Item.objects.filter(
        source__icontains=source_query
    ).values('source').distinct().order_by('source')[:count]
    return JsonResponse({'source_suggestions': list(suggested_sources)})


def create_gti_archive(obs_id, gti_list, base_path):
    """Create a zip archive of GTI files"""
    LOGGER.info(f"Creating GTI archive for OBS_ID {obs_id}, GTIs: {gti_list}")
    jspipe_dir = base_path / obs_id / 'jspipe'

    if not jspipe_dir.exists():
        return HttpResponse(f'Directory not found: {jspipe_dir}', status=404)

    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        with zipfile.ZipFile(tmp.name, 'w') as archive:
            files_added = False

            if not gti_list:
                for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI*'):
                    LOGGER.info(f"Adding file to archive: {file}")
                    archive.write(str(file), file.name)
                    files_added = True
            else:
                for gti_num in gti_list:
                    for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI{gti_num}'):
                        if f'_GTI{gti_num}' in str(file):
                            LOGGER.info(f"Adding file to archive: {file}")
                            archive.write(str(file), file.name)
                            files_added = True

            if not files_added:
                return HttpResponse('No GTI files found', status=404)

        return FileResponse(
            open(tmp.name, 'rb'),
            as_attachment=True,
            filename=f'{obs_id}_GTI_{"-".join(gti_list) if gti_list else "all"}.zip'
        )


def download_data(request: HttpRequest):
    """Handle data downloads for observations and GTIs"""
    data_type = request.GET.get('type')
    obs_id = request.GET.get('obs_id')
    gti_numbers_str = request.GET.get('gti_numbers')
    quality = request.GET.get('quality')
    LOGGER.info(f"Download request - Type: {data_type}, OBS_ID: {obs_id}, GTI: {gti_numbers_str}, Quality: {quality}")

    if not obs_id:
        return HttpResponse('OBS_ID is required', status=400)

    if not quality:
        return HttpResponse('Quality is required', status=400)

    quality = quality.lower()

    try:
        base_path = Path(settings.DATA_DIR)
        jspipe_dir = base_path / obs_id / 'jspipe'

        if not jspipe_dir.exists():
            return HttpResponse(f'Directory not found: {jspipe_dir}', status=404)

        if data_type == 'gti':
            if gti_numbers_str:
                gti_numbers = gti_numbers_str.split(',')

                if len(gti_numbers) == 1:
                    gti_num = gti_numbers[0]
                    gti_files = list(jspipe_dir.glob(f'js_ni{obs_id}*_{quality}_GTI{gti_num}*'))

                    if not gti_files:
                        return HttpResponse(f'No files found for GTI{gti_num} with quality {quality}', status=404)

                    if len(gti_files) == 1:
                        return FileResponse(
                            open(str(gti_files[0]), 'rb'),
                            as_attachment=True,
                            filename=gti_files[0].name
                        )

                    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                        with zipfile.ZipFile(tmp.name, 'w') as archive:
                            for file in gti_files:
                                archive.write(str(file), file.name)

                        return FileResponse(
                            open(tmp.name, 'rb'),
                            as_attachment=True,
                            filename=f'{obs_id}_GTI{gti_num}_{quality}.zip'
                        )

                else:
                    # multiple GTIs as a zip
                    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                        with zipfile.ZipFile(tmp.name, 'w') as archive:
                            files_added = False
                            for gti_num in gti_numbers:
                                gti_files = list(jspipe_dir.glob(f'js_ni{obs_id}*_{quality}_GTI{gti_num}*'))
                                if gti_files:
                                    for file in gti_files:
                                        archive.write(str(file), file.name)
                                        files_added = True
                                else:
                                    LOGGER.warning(f"No files found for GTI{gti_num} with quality {quality}")

                            if not files_added:
                                return HttpResponse('No GTI files found for the selected GTIs', status=404)
                        return FileResponse(
                            open(tmp.name, 'rb'),
                            as_attachment=True,
                            filename=f'{obs_id}_GTI_{"-".join(gti_numbers)}_{quality}.zip'
                        )
            else:
                gti_files = list(jspipe_dir.glob(f'js_ni{obs_id}*_{quality}_GTI*'))
                if not gti_files:
                    return HttpResponse(f'No GTI files found for the observation with quality {quality}', status=404)
                with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                    with zipfile.ZipFile(tmp.name, 'w') as archive:
                        for file in gti_files:
                            archive.write(str(file), file.name)
                    return FileResponse(
                        open(tmp.name, 'rb'),
                        as_attachment=True,
                        filename=f'{obs_id}_all_GTI_{quality}.zip'
                    )
        elif data_type == 'obs':
            return create_obs_archive(obs_id, base_path)
        else:
            return HttpResponse('Invalid data type', status=400)

    except Exception as e:
        LOGGER.exception("Error in download_data")
        return HttpResponse(f'Error: {str(e)}', status=500)


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
