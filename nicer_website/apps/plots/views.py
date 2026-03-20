"""
Main functions for backend functionality of the interactive plot page
"""
import os
import re
import time
import logging
import gzip
from typing import Any
from pathlib import Path
import tempfile
import zipfile
import numpy as np
from io import BytesIO
import plotly.graph_objs as go
from plotly.offline import plot
from astropy.io import fits
from astropy.table import Table
import warnings
from astropy.utils.exceptions import AstropyWarning

from django.conf import settings
from django.shortcuts import render
from django.db.models import QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse, FileResponse
from django.views.decorators.http import require_POST

from nicer_website.apps.file_mgr.models import Item
from src.utils.spectrum_preprocessing import spectrum_plot
from src.utils.light_curve_preprocessing import light_curve_plot
from src.utils.power_density_processing import get_pds_data_and_plot
from src.utils.summed_spectrum_preprocessing import summed_spectrum_plot
from src.utils.hardness_intensity_preprocessing import get_hid_data_and_plot, process_lc_file

logger = logging.getLogger(__name__)
warnings.simplefilter('ignore', category=AstropyWarning)

# --- 🟢 HELPER FUNCTION FOR GLOBAL HID (Single Point) 🟢 ---
def get_global_hid_point_plot(min_value, obs_id, file_paths, gti_numbers):
    try:
        all_hardness = []
        all_intensity = []
        logger.info(f"--- Processing Global HID for {obs_id} ({len(file_paths)} files) ---")

        for fp in file_paths:
            if not os.path.exists(fp): continue
            try:
                _, h_arr, i_arr = process_lc_file(fp)
                valid_mask = np.isfinite(h_arr) & np.isfinite(i_arr) & (h_arr > 0) & (i_arr > 0)
                if np.any(valid_mask):
                    all_hardness.extend(h_arr[valid_mask])
                    all_intensity.extend(i_arr[valid_mask])
            except Exception as e:
                continue
        
        if not all_hardness:
             return f"<div style='padding:20px; text-align:center; color: #666;'>No valid data extracted.</div>"

        avg_hardness = np.mean(all_hardness)
        avg_intensity = np.mean(all_intensity)

        trace = go.Scatter(
            x=[avg_hardness], y=[avg_intensity], mode='markers+text',
            text=[f"<b>{obs_id}</b>"], textposition="top center",
            marker=dict(size=18, color='red', symbol='circle', line=dict(width=2, color='black')),
            hoverinfo='text+x+y',
            hovertext=f"ObsID: {obs_id}<br>Avg Hardness: {avg_hardness:.3f}<br>Avg Intensity: {avg_intensity:.2f}",
            name=f'{obs_id}'
        )
        layout = go.Layout(
            title=dict(text=f'Global Average HID: {obs_id}', x=0.5),
            xaxis=dict(title='Average Hardness (Hard/Soft)', zeroline=False),
            yaxis=dict(title='Average Intensity (counts/s)', type='log'),
            hovermode='closest', width=600, height=500, template='plotly_white'
        )
        return plot(go.Figure(data=[trace], layout=layout), output_type='div', include_plotlyjs=False)
    except Exception as e:
        logger.error(f"Error generating global HID point: {e}")
        return f"<div style='color:red'>Error: {str(e)}</div>"

PLOTS: dict[str, dict[str, Any]] = {
   'spectrum': {'exists': False, 'min_value': None, 'file_type': '.jsgrp', 'function': spectrum_plot},
   'summed_spectrum': {'exists': False, 'min_value': None, 'file_type': '.jsgrp', 'function': summed_spectrum_plot},
   'light_curve': {'exists': False, 'min_value': 100, 'file_type': '.lc.gz', 'function': light_curve_plot},
   'power_density_spectrum': {'exists': False, 'min_value': 10, 'file_type': '-bin.pds', 'function': get_pds_data_and_plot},
   'hardness_intensity_diagram': {'exists': False, 'min_value': 25, 'file_type': '.lc.gz', 'function': get_hid_data_and_plot},
   'global_hid': {'exists': False, 'min_value': 1, 'file_type': '.lc.gz', 'function': get_global_hid_point_plot},
}

def plot_gti(request: HttpRequest) -> JsonResponse:
   obs_id: str = request.POST.get('obs_id', '')
   quality: str = request.POST.get('quality', '')
   plot_type_str: str = request.POST.get('plot_type', '')
   gti_query_str: str = request.POST.get('gti-search', '')
   requested_min_value_str = request.POST.get('min_value')

   if not obs_id or not plot_type_str: return JsonResponse({'error': 'Missing params'}, status=400)
   plot_type: str = plot_type_str.replace('-', '_')
   if plot_type not in PLOTS: return JsonResponse({'error': f'Invalid plot type: {plot_type_str}'}, status=400)

   default_min_value = PLOTS[plot_type].get('min_value')
   try: min_value = int(requested_min_value_str) if requested_min_value_str else default_min_value
   except ValueError: min_value = default_min_value

   single_obs_dir_path_relative = os.path.join(obs_id, 'jspipe/')
   files_qs = Item.objects.filter(name__contains=quality, path=single_obs_dir_path_relative, type=Item.item_type[1][0]).order_by('name')
   plot_specific_files_qs = files_qs.filter(name__contains=PLOTS[plot_type]['file_type'])

   if not plot_specific_files_qs.exists(): return JsonResponse({'error': f'No files found for plot type {plot_type}'}, status=404)

   gti_list_parsed: list[int] = []
   if gti_query_str:
       processed_gti_query_parts = re.sub(r'[^\d,-]', '', gti_query_str).split(',')
       for gti_val_part in processed_gti_query_parts:
           if not gti_val_part: continue
           if '-' in gti_val_part:
               start, end = map(int, gti_val_part.split('-'))
               if start > end: start, end = end, start
               gti_list_parsed.extend(range(start, end + 1))
           elif gti_val_part.isdigit(): gti_list_parsed.append(int(gti_val_part))
       gti_list_parsed = sorted(list(set(gti_list_parsed)))

   final_file_paths_to_plot: list[str] = []
   final_gti_numbers_for_plot_func: list[int] = []
   full_dir_path_for_files = os.path.join(settings.DATA_DIR, single_obs_dir_path_relative)

   if gti_list_parsed:
       for gti_num in gti_list_parsed:
           file_match_item = plot_specific_files_qs.filter(name__regex=fr'GTI0*{gti_num}([^\\d]|$)').first()
           if file_match_item:
               final_file_paths_to_plot.append(os.path.join(full_dir_path_for_files, file_match_item.name))
               final_gti_numbers_for_plot_func.append(gti_num)

   if not final_file_paths_to_plot:
       default_file_item = plot_specific_files_qs.first()
       if default_file_item:
           final_file_paths_to_plot.append(os.path.join(full_dir_path_for_files, default_file_item.name))
           match = re.search(r'GTI(0*)(\\d+)', default_file_item.name)
           final_gti_numbers_for_plot_func = [int(match.group(2))] if match else [0]

   try:
       plot_divs_html = PLOTS[plot_type]['function'](min_value, obs_id, final_file_paths_to_plot, final_gti_numbers_for_plot_func)
       return JsonResponse({'plotDivs': [plot_divs_html]})
   except Exception as e:
       logger.exception(f"[plot_gti] Error: {e}")
       return JsonResponse({'error': f'Error generating plot: {str(e)}'}, status=500)


@require_POST
def plot_single_gti(request: HttpRequest) -> JsonResponse:
    try:
        obs_id: str = request.POST.get('obs_id', '')
        quality: str = request.POST.get('quality', '')
        start_time_str: str = request.POST.get('start_time')
        stop_time_str: str = request.POST.get('stop_time')

        if not all([obs_id, quality, start_time_str, stop_time_str]):
            return JsonResponse({'error': 'Missing required parameters.'}, status=400)

        start_time = float(start_time_str)
        stop_time = float(stop_time_str)
        
        plot_type = 'light_curve'
        plot_info = PLOTS.get(plot_type)
        if not plot_info:
            return JsonResponse({'error': 'Light curve plot type not configured.'}, status=500)

        min_value = plot_info.get('min_value', 100)

        # Find the relevant file. For a single GTI plot, we usually just need one of the .lc.gz files.
        # We don't need to distinguish by GTI number in the filename, as we filter by time.
        rel_dir_path = os.path.join(obs_id, 'jspipe/')
        file_item = Item.objects.filter(
            path=rel_dir_path,
            type=Item.item_type[1][0],
            name__contains=quality,
        ).filter(name__contains=plot_info['file_type']).first()

        if not file_item:
            return JsonResponse({'error': f'No light curve file found for ObsID {obs_id} with quality {quality}.'}, status=404)

        full_path = os.path.join(settings.DATA_DIR, rel_dir_path, file_item.name)
        
        # Call the plotting function with the time range
        plot_div = light_curve_plot(
            min_value=min_value,
            obs_id=f"{obs_id} (GTI)",
            data_paths=[full_path],
            gti_numbers=[0], # GTI number is not strictly needed as we filter by time
            gti_labels=[f"Time Range"],
            start_time=start_time,
            stop_time=stop_time
        )
        
        return JsonResponse({'plot_div': plot_div})

    except ValueError:
        return JsonResponse({'error': 'Invalid time format. Start and stop time must be numbers.'}, status=400)
    except Exception as e:
        logger.exception(f"[plot_single_gti] Error: {e}")
        return JsonResponse({'error': f'An unexpected error occurred: {str(e)}'}, status=500)

# ---------------------------------------------------------------------
# Handles BOTH Combined Plotting (Loop) AND Standard Search (Fallback)
# ---------------------------------------------------------------------
def plot_data(request: HttpRequest) -> JsonResponse:
    logger.info(f"[plot_data] Received POST request. Data: {request.POST}")
    
    # 1. Get raw input
    raw_obs_id_input: str = request.POST.get('obs_id')
    quality: str = request.POST.get('quality')
    plot_types = request.POST.getlist('plot_types')
    gti_query_str: str = request.POST.get('gti-search', '') # New: Get gti-search string

    gti_specifiers = {} # For new format: {obs_id: [gti_num, ...]}
    gti_list_parsed: list[int] = [] # For old format

    if gti_query_str:
        # Heuristic to check if we're using the new "obsid-gti" format vs. old "1,2,5-7"
        # Assumes obsids are long numbers (e.g., > 5 digits)
        is_obsid_gti_format = False
        if '-' in gti_query_str:
            # Check the part before the first hyphen of each comma-separated value
            is_obsid_gti_format = any(len(part.split('-')[0].strip()) > 2 for part in gti_query_str.split(','))

        if is_obsid_gti_format:
            parts = gti_query_str.split(',')
            for part in parts:
                match = re.match(r'(\d+)-(\d+)', part.strip())
                if match:
                    obs_id_str, gti_num_str = match.groups()
                    gti_num = int(gti_num_str)
                    if obs_id_str not in gti_specifiers:
                        gti_specifiers[obs_id_str] = []
                    gti_specifiers[obs_id_str].append(gti_num)
        else: # Fallback to old format "1,2,5-7"
            processed_gti_query_parts = re.sub(r'[^\d,-]', '', gti_query_str).split(',')
            for gti_val_part in processed_gti_query_parts:
                if not gti_val_part: continue
                if '-' in gti_val_part:
                    start, end = map(int, gti_val_part.split('-'))
                    if start > end: start, end = end, start
                    gti_list_parsed.extend(range(start, end + 1))
                elif gti_val_part.isdigit(): gti_list_parsed.append(int(gti_val_part))
            if gti_list_parsed:
                gti_list_parsed = sorted(list(set(gti_list_parsed)))
    
    # Handle manual plot type parsing
    if not plot_types:
        possible_types = ['spectrum', 'summed-spectrum', 'light-curve', 'power-density-spectrum', 'hardness-intensity-diagram', 'global-hid']
        for pt in possible_types:
            if request.POST.get(pt) == 'on':
                plot_types.append(pt.replace('-', '_'))

    if request.POST.get('get_detailed_info') == 'true':
        target_id = raw_obs_id_input.split(',')[0].strip() if ',' in raw_obs_id_input else raw_obs_id_input
        dir_path = os.path.join(settings.DATA_DIR, target_id, 'jspipe/')
        files = Item.objects.filter(name__contains=quality, path__startswith=os.path.join(target_id, 'jspipe/'), type=Item.item_type[1][0]).order_by('name')
        
        infos = []
        try:
            file_names = np.array(files.filter(name__contains='BGDATA.summary').values_list('name', flat=True))
            if file_names.size > 0:
                indices = np.argsort([int(re.search(r'GTI(\d+)', fn).group(1)) for fn in file_names])
                for gti_file_name in file_names[indices]:
                    gti_number = int(re.search(r'GTI(\d+)', gti_file_name).group(1))
                    file_name_on_disk = re.sub(r'js_\d+_', f'js_{target_id}_', gti_file_name)
                    full_path = os.path.join(dir_path, file_name_on_disk)
                    if os.path.exists(full_path):
                        info = np.char.replace(np.loadtxt(full_path, dtype=str, unpack=True), "'", '')
                        info_dict = dict(zip(*info))
                        info_dict['GTI'] = gti_number 
                        infos.append(info_dict)
        except Exception as e:
             logger.error(f"Error reading summary files: {e}")
             return JsonResponse({'error': 'Failed to read GTI summary data.'}, status=500)
        return JsonResponse({'info': infos})


    if plot_types:
        # Detect Split: "101,102" -> ["101", "102"]
        if ',' in raw_obs_id_input:
            obs_id_list = [x.strip() for x in raw_obs_id_input.split(',')]
        else:
            obs_id_list = [raw_obs_id_input]

        if gti_specifiers:
            obs_id_list = [obsid for obsid in obs_id_list if obsid in gti_specifiers]
            
        plot_divs: list[str] = []
        max_gtis: list[int] = [] 

        for plot_type in plot_types:
            plot_type_key = plot_type.replace('-', '_')
            if plot_type_key not in PLOTS: continue
            
            plot_info = PLOTS[plot_type_key]
            
            all_file_paths_combined = []
            all_gti_numbers_combined = []
            current_max_gti = 0

            # Loop through ALL requested ObsIDs
            for single_obs_id in obs_id_list:
                single_obs_dir = os.path.join(settings.DATA_DIR, single_obs_id, 'jspipe/')
                files = Item.objects.filter(name__contains=quality, path__startswith=os.path.join(single_obs_id, 'jspipe/'), type=Item.item_type[1][0]).order_by('name')
                file_names_qs = files.filter(name__contains=plot_info['file_type']).exclude(name__regex=r'_BAND\d+')
                
                if not file_names_qs.exists(): continue

                # Determine which GTIs to use for THIS observation
                gtis_to_process = []
                if gti_specifiers:
                    # New format: Use GTIs specified for this obsid, otherwise empty list.
                    gtis_to_process = gti_specifiers.get(single_obs_id, [])
                elif gti_list_parsed:
                    # Old format: Use the same general list of GTIs for all obsids
                    gtis_to_process = gti_list_parsed

                if plot_type_key == 'summed_spectrum' or plot_type_key == 'global_hid':
                    for file_item in file_names_qs.order_by('name'):
                        all_file_paths_combined.append(os.path.join(single_obs_dir, file_item.name))
                        gti_match = re.search(r'GTI(\d+)', file_item.name)
                        if gti_match: all_gti_numbers_combined.append(int(gti_match.group(1)))
                elif gtis_to_process: # If specific GTIs are requested for this plot type
                    for gti_num in gtis_to_process:
                        file_match_item = file_names_qs.filter(name__regex=fr'GTI0*{gti_num}([^\\d]|$)').first()
                        if file_match_item:
                            all_file_paths_combined.append(os.path.join(single_obs_dir, file_match_item.name))
                            all_gti_numbers_combined.append(gti_num)
                else: # Default behavior: include all GTIs if no specific ones were requested
                    for file_item in file_names_qs.order_by('name'):
                        all_file_paths_combined.append(os.path.join(single_obs_dir, file_item.name))
                        gti_match = re.search(r'GTI(\d+)', file_item.name)
                        if gti_match: 
                            val = int(gti_match.group(1))
                            all_gti_numbers_combined.append(val)
                            if val > current_max_gti: current_max_gti = val

            max_gtis.append(current_max_gti)

            if not all_file_paths_combined:
                continue

            try:
                plot_div = plot_info['function'](plot_info['min_value'], ",".join(obs_id_list), all_file_paths_combined, all_gti_numbers_combined)
                plot_divs.append(plot_div)
            except Exception as e:
                logger.exception(f"[plot_data] Error plotting {plot_type_key}: {e}")
                return JsonResponse({'error': str(e)}, status=500)
        
        if not plot_divs: return JsonResponse({'error': 'No plots could be generated.'})
             
        return JsonResponse({'plotDivs': plot_divs, 'maxGTI': max_gtis, 'obsID': raw_obs_id_input})

    # If no plot_types and no detail request, it means User clicked "Search"
    if not raw_obs_id_input: return JsonResponse({'error': 'No observation ID provided.'}, status=400)
    
    # Safe splitting: Use the first ID if a list was somehow passed (unlikely in simple search)
    obs_id = raw_obs_id_input.split(',')[0].strip()

    all_files_qs = Item.objects.filter(path__startswith=os.path.join(obs_id, 'jspipe/'), name__contains=quality, type=Item.item_type[1][0])
    first_file = all_files_qs.order_by('name').first()
    
    if not first_file: return JsonResponse({'error': f'No data found for ObsID {obs_id} with quality {quality}.'}, status=404)

    gti_count = len(set(re.search(r'GTI(\d+)', f.name).group(1) for f in all_files_qs if re.search(r'GTI(\d+)', f.name)))
    
    observation_data = {
        "obsid": obs_id,
        "source": first_file.source or "N/A",
        "gti_count": gti_count,
        "ra": f"{first_file.ra:.2f}" if first_file.ra is not None else "N/A",
        "dec": f"{first_file.dec:.2f}" if first_file.dec is not None else "N/A",
        "start_time": first_file.tstart_tt or "N/A",
    }
    return JsonResponse({
        "source_name": first_file.source or obs_id,
        "observations": [observation_data]
    })


def fetch_observations(request: HttpRequest, count: int = 5) -> JsonResponse:
   root: str = Item._meta.get_field('path').get_default()
   obs_id: str = request.GET.get('obs_id')
   source: str = request.GET.get('source')
   suggested_obs: QuerySet

   if obs_id:
       suggested_obs = Item.objects.filter(name__startswith=obs_id, path=root, type=Item.item_type[0][0]).order_by('name')[:count]
   elif source:
       suggested_obs = Item.objects.filter(source__icontains=source, type=Item.item_type[1][0]).values('source').distinct().order_by('source')[:count]
   else:
       return JsonResponse({'error': 'No observation ID or source name provided'})

   if not suggested_obs.exists(): return JsonResponse({'error': 'Observational data not found'})

   if obs_id: return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('name', flat=True))})
   else: return JsonResponse({'dir_suggestions': list(suggested_obs.values_list('source', flat=True))})


def fetch_sources(request: HttpRequest, count: int = 5) -> JsonResponse:
   source_query = request.GET.get('source')
   suggested_sources = Item.objects.filter(source__icontains=source_query).values('source').distinct().order_by('source')[:count]
   return JsonResponse({'source_suggestions': list(suggested_sources)})

def fetch_gtis(request: HttpRequest) -> JsonResponse:
    obs_id = request.GET.get('obs_id')
    quality = request.GET.get('quality', 'goddard') # Default to 'goddard'
    
    if not obs_id:
        return JsonResponse({'error': 'Observation ID is required.'}, status=400)

    try:
        # Construct the path prefix for filtering
        path_prefix = os.path.join(obs_id, 'jspipe/')
        
        # Filter items by path prefix and quality, then get all file names
        # We assume GTI information is in the filename for filtering
        files_with_gti_info = Item.objects.filter(
            path__startswith=path_prefix,
            name__contains=quality,
            type=Item.item_type[1][0] # Assuming this is the correct item type for files
        ).values_list('name', flat=True)

        gti_numbers = set()
        gti_regex = re.compile(r'GTI(\d+)')

        for filename in files_with_gti_info:
            match = gti_regex.search(filename)
            if match:
                gti_numbers.add(int(match.group(1)))
        
        # Return sorted unique GTI numbers
        return JsonResponse({'gtis': sorted(list(gti_numbers))})

    except Exception as e:
        logger.exception(f"[fetch_gtis] Error fetching GTIs for ObsID {obs_id}: {e}")
        return JsonResponse({'error': f'Failed to fetch GTIs: {str(e)}'}, status=500)

def interactive_plot(request: HttpRequest) -> HttpResponse:
   return render(request, 'plots/plot.html', {'plot_divs': None})


def create_gti_archive(obs_id, gti_list, base_path):
   logger.info(f"Creating GTI archive for OBS_ID {obs_id}, GTIs: {gti_list}")
   jspipe_dir = base_path / obs_id / 'jspipe'

   if not jspipe_dir.exists(): return HttpResponse(f'Directory not found: {jspipe_dir}', status=404)

   with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
       with zipfile.ZipFile(tmp.name, 'w') as archive:
           files_added = False
           if not gti_list:
               for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI*'):
                   archive.write(str(file), file.name)
                   files_added = True
           else:
               for gti_num in gti_list:
                   for file in jspipe_dir.glob(f'js_ni{obs_id}*_GTI{gti_num}'):
                       if f'_GTI{gti_num}' in str(file):
                           archive.write(str(file), file.name)
                           files_added = True
           if not files_added: return HttpResponse('No GTI files found', status=404)
       return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_GTI_{"-".join(gti_list) if gti_list else "all"}.zip')


def download_data(request: HttpRequest):
   data_type = request.GET.get('type')
   obs_id = request.GET.get('obs_id')
   gti_numbers_str = request.GET.get('gti_numbers')
   quality = request.GET.get('quality')

   if not obs_id: return HttpResponse('OBS_ID is required', status=400)
   if not quality: return HttpResponse('Quality is required', status=400)
   quality = quality.lower()

   try:
       base_path = Path(settings.DATA_DIR)
       jspipe_dir = base_path / obs_id / 'jspipe'
       if not jspipe_dir.exists(): return HttpResponse(f'Directory not found: {jspipe_dir}', status=404)

       if data_type == 'gti':
           if gti_numbers_str:
               gti_numbers = gti_numbers_str.split(',')
               if len(gti_numbers) == 1:
                   gti_num = gti_numbers[0]
                   gti_files = list(jspipe_dir.glob(f'js_ni{obs_id}*_{quality}_GTI{gti_num}*'))
                   if not gti_.files: return HttpResponse(f'No files found for GTI{gti_num}', status=404)
                   if len(gti_files) == 1: return FileResponse(open(str(gti_files[0]), 'rb'), as_attachment=True, filename=gti_files[0].name)
                   with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                       with zipfile.ZipFile(tmp.name, 'w') as archive:
                           for file in gti_files: archive.write(str(file), file.name)
                       return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_GTI{gti_num}_{quality}.zip')
               else:
                   with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                       with zipfile.ZipFile(tmp.name, 'w') as archive:
                           files_added = False
                           for gti_num in gti_numbers:
                               gti_files = list(jspipe_dir.glob(f'js_ni{obs_id}*_{quality}_GTI{gti_num}*'))
                               if gti_files:
                                   for file in gti_files: archive.write(str(file), file.name); files_added = True
                           if not files_added: return HttpResponse('No GTI files found', status=404)
                       return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_GTI_{"-".join(gti_numbers)}_{quality}.zip')
           else:
               gti_files = list(jspipe_dir.glob(f'js_ni{obs_id}*_{quality}_GTI*'))
               if not gti_files: return HttpResponse(f'No GTI files found', status=404)
               with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                   with zipfile.ZipFile(tmp.name, 'w') as archive:
                       for file in gti_files: archive.write(str(file), file.name)
                   return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_all_GTI_{quality}.zip')
       elif data_type == 'obs': return create_obs_archive(obs_id, base_path)
       else: return HttpResponse('Invalid data type', status=400)
   except Exception as e:
       logger.exception("Error in download_data")
       return HttpResponse(f'Error: {str(e)}', status=500)


def create_obs_archive(obs_id, base_path):
   obs_path = base_path / obs_id
   if not obs_path.exists(): return HttpResponse('Observation not found', status=404)
   with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
       with zipfile.ZipFile(tmp.name, 'w') as archive:
           for root, _, files in os.walk(str(obs_path)):
               for file in files:
                   file_path = os.path.join(root, file)
                   archive_path = os.path.relpath(file_path, str(obs_path))
                   archive.write(file_path, archive_path)
       return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_full.zip')


@require_POST
def source_search_view(request):
    try:
        source_name = request.POST.get('source', '')
        quality = request.POST.get('quality', '')
        if not source_name: return JsonResponse({'error': 'Source name is required.'}, status=400)
        logger.info(f"[source_search_view] Searching for source: '{source_name}', quality: '{quality}'")

        obs_paths = Item.objects.filter(source__icontains=source_name, type=Item.item_type[1][0]).values('path', 'source').distinct()
        observations = []
        obs_ids_seen = set()

        for item in obs_paths:
            try: obs_id = item['path'].split(os.path.sep)[0]
            except Exception: continue 
            if obs_id in obs_ids_seen or not obs_id.isdigit(): continue 
            obs_ids_seen.add(obs_id)
            
            all_files_qs = Item.objects.filter(path=item['path'], name__contains=quality, type=Item.item_type[1][0])
            first_file = all_files_qs.order_by('name').first()
            if first_file:
                gti_count = len(set(re.search(r'GTI(\d+)', n).group(1) for n in all_files_qs.filter(name__contains='GTI').values_list('name', flat=True) if re.search(r'GTI(\d+)', n)))
                observations.append({
                    "obsid": obs_id, "source": first_file.source or "N/A", "gti_count": gti_count,
                    "ra": f"{first_file.ra:.2f}" if first_file.ra is not None else "N/A",
                    "dec": f"{first_file.dec:.2f}" if first_file.dec is not None else "N/A",
                    "start_time": first_file.tstart_tt or "N/A", "duration": "N/A", "mode": "N/A"
                })
        if not observations: return JsonResponse({'error': f'No observations found for source "{source_name}".'}, status=404)
        return JsonResponse({"source_name": observations[0]['source'], "observations": observations})
    except Exception as e:
        logger.exception(f"[source_search_view] Error: {e}")
        return JsonResponse({"error": str(e)}, status=500)

def plot_combined_global_hid(request: HttpRequest) -> JsonResponse:
    obs_ids_str = request.POST.get('obs_ids', '')
    quality = request.POST.get('quality', 'goddard')
    
    if not obs_ids_str: 
        return JsonResponse({'error': 'No ObsIDs provided.'}, status=400)
    
    obs_ids = [x.strip() for x in obs_ids_str.split(',')]
    
    # Create the figure object
    fig = go.Figure()

    # Loop through each ObsID to calculate its single point and add a trace
    for obs_id in obs_ids:
        # Construct paths
        abs_dir_path = os.path.join(settings.DATA_DIR, obs_id, 'jspipe/') 
        rel_dir_path = os.path.join(obs_id, 'jspipe/')
        
        # Fetch lightcurve files for this ObsID
        files = Item.objects.filter(
            name__contains=quality, 
            path__startswith=rel_dir_path, 
            type=Item.item_type[1][0]
        ).filter(name__contains='.lc.gz')
        
        paths = [os.path.join(abs_dir_path, f.name) for f in files]
        
        all_hardness = []
        all_intensity = []

        # Process all files for this single ObsID to get an average
        for fp in paths:
            try:
                # Reuse your existing processing logic
                _, h_arr, i_arr = process_lc_file(fp)
                valid = np.isfinite(h_arr) & np.isfinite(i_arr) & (h_arr > 0) & (i_arr > 0)
                
                if np.any(valid):
                    all_hardness.extend(h_arr[valid])
                    all_intensity.extend(i_arr[valid])
            except Exception: 
                continue
        
        # If we have data, calculate the mean point and add a trace
        if all_hardness and all_intensity:
            avg_h = np.mean(all_hardness)
            avg_i = np.mean(all_intensity)
            
            # Add a trace for THIS specific ObsID
            fig.add_trace(go.Scatter(
                x=[avg_h], 
                y=[avg_i], 
                mode='markers+text',
                text=[obs_id],
                textposition='top center',
                name=obs_id,  # This creates the Legend entry
                marker=dict(size=12, line=dict(width=1, color='white')), # Clean marker style
                hovertemplate=(
                    f"<b>{obs_id}</b><br>" +
                    "Hardness: %{x:.3f}<br>" +
                    "Intensity: %{y:.2f} counts/s<br>" +
                    "<extra></extra>"
                )
            ))

    # Check if any traces were added
    if not fig.data: 
        return JsonResponse({'error': 'No valid data found for the selected observations.'})

    # Update Layout to match your preferred style (White bg, black axis lines)
    fig.update_layout(
        title='Global HID (Muti-Observation PLOT)',  
        xaxis=dict(
            title='Average Hardness (Hard/Soft)', 
            showline=True, 
            linewidth=1, 
            linecolor='black', 
            showgrid=False
        ),
        yaxis=dict(
            title='Average Intensity (counts/s)', 
            type='log', 
            showline=True, 
            linewidth=1, 
            linecolor='black', 
            showgrid=False
        ),
        height=600,
        template='plotly_white',
        plot_bgcolor='white',
        paper_bgcolor='white',
        font=dict(color='black'),
        showlegend=True,  # Shows the list of ObsIDs on the right
        hovermode='closest'
    )

    div = plot(fig, output_type='div', include_plotlyjs=False)
    return JsonResponse({'plotDiv': div})
