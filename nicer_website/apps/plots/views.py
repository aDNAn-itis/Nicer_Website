"""
Main functions for backend functionality of the interactive plot page
"""
import os
import re
import time
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
from src.utils.summed_spectrum_preprocessing import summed_spectrum_plot

import logging
logger: logging.Logger = logging.getLogger(__name__)



# Log axis
# Info field (avg count)
# Ability to choose grouping binning

# Global variable
PLOTS: dict[str, dict[str, Any]] = {
    'spectrum': {
        'exists': False,
        'min_value': None,  # Default min_value for spectrum
        'file_type': '.jsgrp',
        'function': spectrum_plot,
    },
    'summed_spectrum': {
        'exists': False,
        'min_value': None,  # Default min_value for summed spectrum
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
    # plot_divs: str # Defined later
    obs_id: str = request.POST.get('obs_id', '')
    quality: str = request.POST.get('quality', '')
    plot_type_str: str = request.POST.get('plot_type', '')
    gti_query_str: str = request.POST.get('gti-search', '')
    requested_min_value_str = request.POST.get('min_value')

    logger.info(f"[plot_gti START] Received POST data: obs_id='{obs_id}', quality='{quality}', plot_type='{plot_type_str}', gti-search='{gti_query_str}', min_value='{requested_min_value_str}'")

    if not obs_id:
        logger.error("[plot_gti] obs_id is missing from POST data.")
        return JsonResponse({'error': 'obs_id is required.'}, status=400)
    if not plot_type_str:
        logger.error("[plot_gti] plot_type is missing from POST data.")
        return JsonResponse({'error': 'plot_type is required.'}, status=400)

    plot_type: str = plot_type_str.replace('-', '_')

    if plot_type not in PLOTS:
        logger.error(f"[plot_gti] Invalid plot_type: '{plot_type_str}' (parsed as '{plot_type}')")
        return JsonResponse({'error': f'Invalid plot type: {plot_type_str}'}, status=400)

    default_min_value = PLOTS[plot_type].get('min_value')
    min_value: int | None

    if requested_min_value_str is not None and requested_min_value_str != '':
        try:
            min_value = int(requested_min_value_str)
            logger.info(f"[plot_gti] Parsed min_value from request: {min_value}")
        except ValueError:
            logger.warning(f"[plot_gti] Could not parse requested_min_value_str '{requested_min_value_str}' to int. Using default: {default_min_value}")
            min_value = default_min_value
    else:
        min_value = default_min_value
        logger.info(f"[plot_gti] min_value not in request or empty. Using default: {min_value}")
    
    logger.info(f"[plot_gti] Final min_value for plotting: {min_value}")

    # Handle combined observations case - Assuming this part is okay for now based on logs
    if 'combined_obs_ids' in request.POST:
        logger.info("[plot_gti] Handling combined observations.")
        # For brevity, assuming this path is less critical for the current bug
        # but should be reviewed for logging consistency if issues arise there.
        obs_ids_str = request.POST.get('combined_obs_ids')
        obs_ids = obs_ids_str.split(',')
        all_file_names = []
        all_gti_list = []
        gti_obs_mapping = []

        for current_obs_id_combined in obs_ids:
            current_dir_path_combined = os.path.join(current_obs_id_combined, 'jspipe/')
            # Ensure 'quality' and 'plot_type' are used correctly here
            files_combined_qs = Item.objects.filter(
                name__contains=quality, # Make sure quality is available and correct
                path=current_dir_path_combined,
                type=Item.item_type[1][0],
            ).filter(name__contains=PLOTS[plot_type]['file_type']).order_by('name')

            for file_item_combined in files_combined_qs:
                if match := re.search(r'GTI(\d+)', file_item_combined.name):
                    gti_num_combined = int(match.group(1))
                    full_path_combined = os.path.join(settings.DATA_DIR, current_dir_path_combined, file_item_combined.name)
                    all_file_names.append(full_path_combined)
                    all_gti_list.append(gti_num_combined)
                    gti_obs_mapping.append(current_obs_id_combined)
        
        if not all_file_names:
            logger.error("[plot_gti] Combined: No GTI files found.")
            return JsonResponse({'error': 'No GTI files found for the specified combined observations'})

        gti_labels = [f'GTI{gti_num} (Obs {obs_id_map})' for gti_num, obs_id_map in zip(all_gti_list, gti_obs_mapping)]
        plot_kwargs = {
            'min_value': min_value,
            'obs_id': obs_id, # This might need to be a list or handled differently by the plotting function
            'data_paths': all_file_names,
            'gti_numbers': all_gti_list,
            'gti_labels': gti_labels,
        }
        if 'is_combined_obs' in PLOTS[plot_type].get('optional_params', []):
            plot_kwargs['is_combined_obs'] = True
        
        try:
            plot_divs = PLOTS[plot_type]['function'](**plot_kwargs)
            logger.info(f"[plot_gti] Combined: Successfully generated plot divs.")
            return JsonResponse({'plotDivs': [plot_divs]})
        except Exception as e:
            logger.exception(f"[plot_gti] Combined: Error during plot generation: {e}")
            return JsonResponse({'error': f'Error generating combined plot: {str(e)}'}, status=500)


    # Handle single observation case
    logger.info(f"[plot_gti] Handling single observation for obs_id: {obs_id}")
    single_obs_dir_path_relative = os.path.join(obs_id, 'jspipe/')
    
    files_qs = Item.objects.filter(
        name__contains=quality,
        path=single_obs_dir_path_relative,
        type=Item.item_type[1][0],
    ).order_by('name')
    logger.info(f"[plot_gti] Found {files_qs.count()} items for obs_id '{obs_id}', quality '{quality}' in path '{single_obs_dir_path_relative}'")

    plot_specific_files_qs = files_qs.filter(name__contains=PLOTS[plot_type]['file_type'])
    logger.info(f"[plot_gti] Found {plot_specific_files_qs.count()} files matching plot type '{plot_type}' (file_type: '{PLOTS[plot_type]['file_type']}')")

    if not plot_specific_files_qs.exists():
        logger.error(f"[plot_gti] No files found for plot type '{plot_type}' in obs '{obs_id}'. Cannot plot.")
        return JsonResponse({'error': f'No files found for plot type {plot_type} in observation {obs_id}'}, status=404)

    gti_list_parsed: list[int] = []
    if gti_query_str:
        processed_gti_query_parts = re.sub(r'[^\d,-]', '', gti_query_str).split(',')
        logger.info(f"[plot_gti] Processed GTI query parts: {processed_gti_query_parts}")
        for gti_val_part in processed_gti_query_parts:
            if not gti_val_part: continue
            if re.search(r'^\d+-\d+$', gti_val_part):
                start_str, end_str = gti_val_part.split('-')
                start, end = int(start_str), int(end_str)
                if start > end: start, end = end, start
                gti_list_parsed.extend(range(start, end + 1))
            elif gti_val_part.isdigit():
                gti_list_parsed.append(int(gti_val_part))
            else:
                logger.warning(f"[plot_gti] Skipping invalid GTI value in query part: '{gti_val_part}'")
        gti_list_parsed = sorted(list(set(gti_list_parsed))) # Unique and sorted
    logger.info(f"[plot_gti] Parsed gti_list from query: {gti_list_parsed}")

    final_file_paths_to_plot: list[str] = []
    final_gti_numbers_for_plot_func: list[int] = []
    
    full_dir_path_for_files = os.path.join(settings.DATA_DIR, single_obs_dir_path_relative)

    if gti_list_parsed:
        for gti_num in gti_list_parsed:
            # Regex to find files for a specific GTI number. Example: ني1130360113_0mpu7_cl_GTI0.lc.gz
            # We need to match _GTI{gti_num} or GTI{gti_num}_ or GTI{gti_num}. to avoid GTI1 matching GTI10
            # Using a regex that looks for GTI, optional leading zeros, the number, and then a non-digit character or end of string.
            file_match_item = plot_specific_files_qs.filter(name__regex=fr'GTI0*{gti_num}([^\\d]|$)').first()
            if file_match_item:
                logger.info(f"[plot_gti] Found file '{file_match_item.name}' for GTI '{gti_num}'")
                final_file_paths_to_plot.append(os.path.join(full_dir_path_for_files, file_match_item.name))
                final_gti_numbers_for_plot_func.append(gti_num)
            else:
                logger.warning(f"[plot_gti] No file found for GTI '{gti_num}' with plot type '{plot_type}'")
    
    logger.info(f"[plot_gti] Files selected based on gti_list_parsed: {final_file_paths_to_plot}")

    if not final_file_paths_to_plot:
        logger.info(f"[plot_gti] No files found for specified GTIs (or no GTIs specified in query). Attempting to use a default GTI for plot type '{plot_type}'.")
        default_file_item = plot_specific_files_qs.first() # Takes the first available file for this plot type
        if default_file_item:
            final_file_paths_to_plot.append(os.path.join(full_dir_path_for_files, default_file_item.name))
            # Try to extract GTI number from this default file to pass to the plotting function
            match = re.search(r'GTI(0*)(\\d+)', default_file_item.name)
            if match:
                default_gti_num = int(match.group(2))
                final_gti_numbers_for_plot_func = [default_gti_num] # Use this GTI for the plot call
                logger.info(f"[plot_gti] Using default file '{default_file_item.name}' (extracted GTI: {default_gti_num}) for plot type '{plot_type}'")
            else:
                final_gti_numbers_for_plot_func = [0] # Fallback GTI number if not extractable
                logger.warning(f"[plot_gti] Could not extract GTI number from default file '{default_file_item.name}'. Using GTI 0 as fallback for plotting function.")
        else:
            # This case should have been caught by "if not plot_specific_files_qs.exists()" earlier, but as a safeguard:
            logger.error(f"[plot_gti] CRITICAL: No default file could be found for plot type '{plot_type}' for obs_id '{obs_id}'.")
            return JsonResponse({'error': 'No data files could be selected for plotting.'}, status=404)

    if not final_file_paths_to_plot:
        logger.error(f"[plot_gti] CRITICAL: After all checks, no files (neither specific nor default) could be selected for plotting for obs_id '{obs_id}', plot type '{plot_type}'.")
        return JsonResponse({'error': 'No data files could be selected for plotting.'}, status=404)

    logger.info(f"[plot_gti] Calling plotting function for '{plot_type}' with: min_value={min_value}, obs_id='{obs_id}', file_paths={final_file_paths_to_plot}, gti_numbers={final_gti_numbers_for_plot_func}")
    
    # Special handling for summed spectrum - use all available GTI files regardless of selection
    if plot_type == 'summed_spectrum':
        logger.info(f"[plot_gti] Summed spectrum detected - using all available GTI files instead of selection")
        all_gti_files = []
        all_gti_numbers = []
        
        for file_item in plot_specific_files_qs.order_by('name'):
            file_path = os.path.join(full_dir_path_for_files, file_item.name)
            all_gti_files.append(file_path)
            # Extract GTI number from filename
            gti_match = re.search(r'GTI(\d+)', file_item.name)
            if gti_match:
                all_gti_numbers.append(int(gti_match.group(1)))
            else:
                all_gti_numbers.append(0)  # fallback
        
        final_file_paths_to_plot = all_gti_files
        final_gti_numbers_for_plot_func = all_gti_numbers
        logger.info(f"[plot_gti] Summed spectrum using {len(all_gti_files)} GTI files: GTIs {all_gti_numbers}")
    
    try:
        # The plotting function expects: min_value, obs_id, data_paths (list of full paths), gti_numbers (list of ints)
        plot_function_start = time.time()
        plot_divs_html = PLOTS[plot_type]['function'](
            min_value, 
            obs_id, 
            final_file_paths_to_plot, 
            final_gti_numbers_for_plot_func
        )
        plot_function_time = time.time() - plot_function_start
        logger.info(f"[plot_gti] Successfully generated plot divs for '{plot_type}' in {plot_function_time:.3f}s.")
    except Exception as e:
        logger.exception(f"[plot_gti] Error during plot generation for '{plot_type}': {e}")
        return JsonResponse({'error': f'Error generating plot: {str(e)}'}, status=500)
        
    return JsonResponse({'plotDivs': [plot_divs_html]})


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
                logger.info(f"[plot_data] Processing plot type: {plot_type}")
                plot_info['exists'] = True
                file_names = files.filter(name__contains=plot_info['file_type'])
                file_names = file_names.exclude(name__regex=r'_BAND\d+')
                if file_names:
                    max_gti.append(len(file_names))

                    plot_function_start = time.time()
                    
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
                        
                        logger.info(f"[plot_data] Summed spectrum using {len(all_file_paths)} GTI files: GTIs {all_gti_numbers}")
                        
                        plot_div = plot_info['function'](
                            plot_info['min_value'],
                            obs_id,
                            all_file_paths,
                            all_gti_numbers,
                        )
                    else:
                        # Regular handling for other plot types - use first file only
                        file_name = file_names.first().name
                        logger.info(f"[plot_data] Calling {plot_type} function with file: {file_name}")
                        plot_div = plot_info['function'](
                            plot_info['min_value'],
                            obs_id,
                            [dir_path + file_name],
                            [0],
                        )
                    
                    plot_function_time = time.time() - plot_function_start
                    logger.info(f"[plot_data] {plot_type} function completed in {plot_function_time:.3f}s")
                    
                    plot_divs.append(plot_div)
                else:
                    logger.warning(f"[plot_data] No files found for plot type: {plot_type}")
                    max_gti.append(0)

    except AttributeError as error:
        logger.error(f'{error}\nNo valid data in {dir_path}')
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
                for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI*'):
                    logger.info(f"Adding file to archive: {file}")
                    archive.write(str(file), file.name)
                    files_added = True
            else:
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

def download_data(request: HttpRequest):
    """Handle data downloads for observations and GTIs"""
    data_type = request.GET.get('type')
    obs_id = request.GET.get('obs_id')
    gti_numbers_str = request.GET.get('gti_numbers')
    quality = request.GET.get('quality') 

    logger.info(f"Download request - Type: {data_type}, OBS_ID: {obs_id}, GTI: {gti_numbers_str}, Quality: {quality}")

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
                                    logger.warning(f"No files found for GTI{gti_num} with quality {quality}")

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
        logger.exception("Error in download_data")
        return HttpResponse(f'Error: {str(e)}', status=500)

    return HttpResponse('Invalid request', status=400)

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
