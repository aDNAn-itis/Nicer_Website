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
import plotly.graph_objects as go_obj
import plotly.io as pio
from plotly.offline import plot
from astropy.io import fits
from astropy.table import Table
import warnings
from astropy.utils.exceptions import AstropyWarning
from dataclasses import dataclass
from django.core.cache import cache

import hashlib

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

from django.conf import settings
from django.shortcuts import render
from django.db.models import QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse, FileResponse
from django.views.decorators.http import require_POST

# Change the imports to start directly from 'src'
from nicer_website.apps.file_mgr.models import Item
from src.apps.plots.spectrum_preprocessing import spectrum_plot
from src.apps.plots.light_curve_preprocessing import light_curve_plot
from src.apps.plots.power_density_processing import get_pds_data_and_plot
from src.apps.plots.summed_spectrum_preprocessing import summed_spectrum_plot
from src.apps.plots.hardness_intensity_preprocessing import get_hid_data_and_plot, process_lc_file
from src.utils.background_screening import screen_gti_files, get_screening_summary


logger = logging.getLogger(__name__)
warnings.simplefilter('ignore', category=AstropyWarning)

# --- RAHUL'S DATACLASS (INTEGRATED) ---
@dataclass
class PlotRequest:
    obs_id: str = ""
    source: str = ""
    quality: str = "goddard"
    search_type: str = "obs_id"
    plot_types: list = None
    gti_query: str = ""
    min_value: int = None
    apply_screening: bool = False
    screening_energy_low: float = 2.0
    screening_energy_high: float = 5.0
    screening_min_bad_channels: int = 2

    @classmethod
    def from_request(cls, request: HttpRequest) -> 'PlotRequest':
        post = request.POST
        p_types = post.getlist('plot_types')
        if not p_types:
            possible_types = ['spectrum', 'summed-spectrum', 'light-curve', 'power-density-spectrum', 'hardness-intensity-diagram', 'global-hid']
            for pt in possible_types:
                if post.get(pt) == 'on':
                    p_types.append(pt.replace('-', '_'))

        return cls(
            obs_id=post.get('obs_id', ''),
            source=post.get('source', ''),
            quality=post.get('quality', 'goddard'),
            search_type=post.get('search_type', 'obs_id'),
            plot_types=p_types,
            gti_query=post.get('gti-search', ''),
            min_value=int(post.get('min_value')) if post.get('min_value') else None,
            apply_screening=post.get('apply_screening', 'false').lower() == 'true',
            screening_energy_low=float(post.get('screening_energy_low', 2.0)),
            screening_energy_high=float(post.get('screening_energy_high', 5.0)),
            screening_min_bad_channels=int(post.get('screening_min_bad_channels', 2))
        )

# --- YOUR HELPER FUNCTION FOR GLOBAL HID (Single Point) ---
def get_global_hid_point_plot(min_value, obs_id, file_paths, gti_numbers, output_type='div'):
    try:
        all_hardness = []
        all_intensity = []
        logger.info(f"--- Processing Global HID for {obs_id} ---")

        for fp in file_paths:
            if not os.path.exists(fp): continue
            try:
                # 🟢 FIXED: Unpack 4 values
                t, s, h, i = process_lc_file(fp)
                # 🟢 FIXED: Calculate Hardness Ratio (Hard / Soft)
                with np.errstate(divide='ignore', invalid='ignore'):
                    h_ratio = h / s

                valid_mask = np.isfinite(h_ratio) & np.isfinite(i) & (h_ratio > 0) & (i > 0)
                if np.any(valid_mask):
                   all_hardness.extend(h_ratio[valid_mask]) # Standardized calculated ratio
                   all_intensity.extend(i[valid_mask])       # Unpacked intensity array

            except Exception as e:
                logger.warning(f"Skip file {fp} due to: {e}")
                continue
        
        if not all_hardness:
             return f"<div style='padding:20px; text-align:center; color: #666;'>No valid data extracted for Global HID.</div>"

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
            xaxis=dict(title=r'$\text{Hardness}\ (4-12\ keV / 2-4\ keV)$', zeroline=False),
            yaxis=dict(title=r'$\text{Intensity}\ (counts/s)$', type='log'),
            hovermode='closest', width=600, height=500, template='plotly_white'
        )
        fig = go.Figure(data=[trace], layout=layout)
        if output_type == 'dict':
            import json
            return json.loads(fig.to_json())
        return plot(fig, output_type='div', include_plotlyjs=False)
    except Exception as e:
        logger.error(f"Error generating global HID point: {e}")
        return f"<div style='color:red'>Error: {str(e)}</div>"
    
def calculate_default_binning(file_path, plot_type):
    """
    Calculate default binning to reduce number of plotted points for faster rendering.
    Target: ~500-1000 points per plot for optimal performance.
    """
    try:
        if not file_path or not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
            return None

        from astropy.io import fits
        if plot_type in ['spectrum', 'summed_spectrum']:
            with fits.open(file_path) as hdul:
                if len(hdul) > 1 and 'SPECTRUM' in hdul:
                    counts = hdul['SPECTRUM'].data['COUNTS']
                    total_bins = len(counts)
                    max_counts = np.max(counts)
                    target_points = 500
                    bin_factor = max(1, total_bins // target_points)
                    min_counts = max(1, int(max_counts * 0.01))
                    return max(bin_factor, min_counts)
                    
        elif plot_type == 'light_curve':
            # LC files are often gzipped ASCII, not always FITS
            if file_path.endswith('.lc.gz'):
                return 80 # Default for LC
                
            with fits.open(file_path) as hdul:
                if len(hdul) > 1 and 'RATE' in hdul:
                    rate = hdul['RATE'].data['RATE']
                    total_bins = len(rate)
                    mean_rate = np.mean(rate)
                    target_bins = 100
                    bins_to_combine = max(1, total_bins // target_bins)
                    min_bins_for_100_counts = max(1, int(100 / mean_rate)) if mean_rate > 0 else 1
                    return max(bins_to_combine, min_bins_for_100_counts)
                    
        elif plot_type == 'power_density_spectrum':
            return 15 # Default significance threshold for PDS
            
    except Exception:
        # Silently fail, fallback to PLOTS default
        pass
    return None

PLOTS: dict[str, dict[str, Any]] = {
   'spectrum': {'exists': False, 'min_value': None, 'file_type': '.jsgrp', 'function': spectrum_plot},
   'summed_spectrum': {'exists': False, 'min_value': None, 'file_type': '.jsgrp', 'function': summed_spectrum_plot},
   'light_curve': {'exists': False, 'min_value': 100, 'file_type': '.lc.gz', 'function': light_curve_plot},
   'power_density_spectrum': {'exists': False, 'min_value': 10, 'file_type': '-bin.pds', 'function': get_pds_data_and_plot},
   'hardness_intensity_diagram': {'exists': False, 'min_value': 25, 'file_type': '.lc.gz', 'function': get_hid_data_and_plot},
   'global_hid': {'exists': False, 'min_value': 1, 'file_type': '.lc.gz', 'function': get_global_hid_point_plot},
}

def plot_gti(request: HttpRequest) -> JsonResponse:
    # 1. Fetch raw strings from POST
    obs_id_raw: str = request.POST.get('obs_id', '')
    quality: str = request.POST.get('quality', '')
    plot_type_raw: str = request.POST.get('plot_type', '')
    gti_query_str: str = request.POST.get('gti-search', '')
    requested_min_value_str = request.POST.get('min_value')
    output_format = request.POST.get('format', 'div')
    search_type = request.POST.get('search_type', 'obs_id')

    # 2. Basic Validation
    if not obs_id_raw or not plot_type_raw:
        return JsonResponse({'error': 'Missing params'}, status=400)

    # 3. Clean and Normalize Plot Type (Fixes the UnboundLocalError)
    # Strip prefixes and handle hyphens/underscores consistently
    # Improved normalization to handle "combined-" prefixes and "-comparison" suffixes
    plot_type = plot_type_raw.replace('combined_', '').replace('combined-', '')
    plot_type = plot_type.replace('_comparison', '').replace('-comparison', '')
    plot_type = plot_type.replace('-', '_')
    
    if plot_type not in PLOTS:
        return JsonResponse({'error': f'Invalid plot type: {plot_type_raw}'}, status=400)

    # 4. Handle Observation IDs (Combined-Aware)
    # Split "113,114" into ["113", "114"]
    obs_id_list = [oid.strip() for oid in obs_id_raw.split(',') if oid.strip()]

    # Parse Screening Toggles
    apply_screening = request.POST.get('apply_screening', 'false').lower() == 'true'
    try:
        screening_energy_low = float(request.POST.get('screening_energy_low', 2.0))
        screening_energy_high = float(request.POST.get('screening_energy_high', 5.0))
        screening_min_bad_channels = int(request.POST.get('screening_min_bad_channels', 2))
    except (ValueError, TypeError):
        screening_energy_low, screening_energy_high, screening_min_bad_channels = 2.0, 5.0, 2

    # Set min_value logic
    default_min_value = PLOTS[plot_type].get('min_value')
    try:
        min_value = int(requested_min_value_str) if requested_min_value_str else default_min_value
    except ValueError:
        min_value = default_min_value

    # 5. Locate Files across ALL provided Observation IDs
    final_file_paths_to_plot = []
    final_gti_numbers_for_plot_func = []
    final_gti_labels_for_plot_func = []

    # Parse requested GTIs (e.g., "0,1,2-5" or "12345-0,67890-1")
    gti_list_parsed: list[int] = []
    gti_specifiers = {}

    if gti_query_str:
        is_obsid_gti_format = False
        if '-' in gti_query_str:
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
        else:
            processed_parts = re.sub(r'[^\d,-]', '', gti_query_str).split(',')
            for part in processed_parts:
                if not part: continue
                if '-' in part:
                    try:
                        start, end = map(int, part.split('-'))
                        if start > end: start, end = end, start
                        gti_list_parsed.extend(range(start, end + 1))
                    except ValueError: continue
                elif part.isdigit():
                    gti_list_parsed.append(int(part))
            gti_list_parsed = sorted(list(set(gti_list_parsed)))

    # 6. File Discovery Loop (The fix for the Path Construction Error)
    # We look into each observation's 'jspipe' directory separately
    for oid in obs_id_list:
        rel_path = os.path.join(oid, 'jspipe')
        full_dir_path = os.path.join(settings.DATA_DIR, rel_path)
        # 🟢 CORRECTED: Chain the filters and exclude BAND files to prevent duplicate legend entries
        plot_files_qs = Item.objects.filter(
            path=rel_path,
            name__contains=quality
        ).filter(
            name__contains=PLOTS[plot_type]['file_type']
        ).exclude(name__regex=r'_BAND\d+').order_by('name')

        if gti_specifiers and oid in gti_specifiers:
            gtis_to_process = gti_specifiers[oid]
        elif gti_list_parsed:
            gtis_to_process = gti_list_parsed
        else:
            gtis_to_process = []

        if gtis_to_process:
            for gti_num in gtis_to_process:
                file_match = plot_files_qs.filter(name__regex=fr'GTI0*{gti_num}([^\\d]|$)').first()
                if file_match:
                    final_file_paths_to_plot.append(os.path.join(full_dir_path, file_match.name))
                    final_gti_numbers_for_plot_func.append(gti_num)
                    final_gti_labels_for_plot_func.append(oid)
        else:
            # 🟢 Initial Load Behavior: If no specific GTI requested, include ALL files for this ObsID
            for item in plot_files_qs:
                final_file_paths_to_plot.append(os.path.join(full_dir_path, item.name))
                match = re.search(r'GTI(0*)(\d+)', item.name)
                final_gti_numbers_for_plot_func.append(int(match.group(2)) if match else 0)
                final_gti_labels_for_plot_func.append(oid)

    if not final_file_paths_to_plot:
        return JsonResponse({'error': f'No data files found for {obs_id_raw}'}, status=404)

    # 7. Apply Background Screening (Optional)
    screening_summary = None
    bg_dash = 'solid'
    if apply_screening and plot_type in ['spectrum', 'summed_spectrum']:
        screened_files, screened_gtis, screening_results = screen_gti_files(
            final_file_paths_to_plot, final_gti_numbers_for_plot_func,
            energy_low=screening_energy_low, energy_high=screening_energy_high, min_bad_channels=screening_min_bad_channels
        )
        screening_summary = get_screening_summary(screening_results)
        if screened_files:
            # Need to filter labels as well to match screened files
            new_labels = []
            for sf in screened_files:
                # Find matching index in original list
                for idx, orig_f in enumerate(final_file_paths_to_plot):
                    if sf == orig_f:
                        new_labels.append(final_gti_labels_for_plot_func[idx])
                        break
            final_file_paths_to_plot, final_gti_numbers_for_plot_func = screened_files, screened_gtis
            final_gti_labels_for_plot_func = new_labels
        else:
            screening_summary['all_failed'] = True
            bg_dash = 'dash'

    # 8. Generate Final Plot HTML
    try:
        plot_func = PLOTS[plot_type]['function']
        # Pass output_type if function supports it
        kwargs = {}
        if output_format == 'json':
            kwargs['output_type'] = 'dict'
        
        # Always pass gti_labels to support combined/multi-obs plotting
        kwargs['gti_labels'] = final_gti_labels_for_plot_func

        if plot_type in ('spectrum', 'summed_spectrum'):
            # Use raw obs_id string for title generation, but the gathered file list for data
            plot_divs_result = plot_func(min_value, obs_id_raw, final_file_paths_to_plot, final_gti_numbers_for_plot_func, bg_dash=bg_dash, **kwargs)
        else:
            plot_divs_result = plot_func(min_value, obs_id_raw, final_file_paths_to_plot, final_gti_numbers_for_plot_func, **kwargs)
            
        response_data = {'plotDivs': [plot_divs_result]}
        if screening_summary:
            response_data['screeningSummary'] = screening_summary
            
        response_data['gtiQuery'] = gti_query_str
        response_data['plotType'] = plot_type
            
        return JsonResponse(response_data)
        
    except Exception as e:
        logger.exception(f"[plot_gti] Error generating plot: {e}")
        return JsonResponse({'error': f'Internal Error: {str(e)}'}, status=500)
    

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

        rel_dir_path = os.path.join(obs_id, 'jspipe')
        file_item = Item.objects.filter(
            path=rel_dir_path,
            type=Item.item_type[1][0],
            name__contains=quality,
        ).filter(name__contains=plot_info['file_type']).first()

        if not file_item:
            return JsonResponse({'error': f'No light curve file found for ObsID {obs_id} with quality {quality}.'}, status=404)

        full_path = os.path.join(settings.DATA_DIR, rel_dir_path, file_item.name)
        
        plot_div = light_curve_plot(
            min_value=min_value,
            obs_id=f"{obs_id} (GTI)",
            data_paths=[full_path],
            gti_numbers=[0],
            gti_labels=[obs_id],
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
    # UPGRADED TO USE PlotRequest Class
    req = PlotRequest.from_request(request)
    logger.info(f"[plot_data] Processing {req.obs_id}")
    
    raw_obs_id_input = req.obs_id
    source = req.source
    quality = req.quality
    search_type = req.search_type
    plot_types = req.plot_types
    gti_query_str = req.gti_query

    # --- SOURCE SEARCH RESTORED ---
    if search_type == 'source' and source:
        obs_items = Item.objects.filter(
            source__icontains=source,
            type=Item.item_type[1][0],
        ).values('path', 'source').distinct()

        obs_ids = []
        for item in obs_items:
            try:
                path_parts = item['path'].split(os.path.sep)
                if len(path_parts) > 0 and path_parts[0].isdigit():
                    obs_ids.append({'obs_id': path_parts[0], 'source': item['source']})
            except Exception:
                continue

        seen = set()
        unique_obs_ids = []
        for d in obs_ids:
            if d['obs_id'] not in seen:
                unique_obs_ids.append(d)
                seen.add(d['obs_id'])
        obs_ids = unique_obs_ids

        if len(obs_ids) > 1:
            return JsonResponse({
                'multiple_observations': True,
                'obs_ids': obs_ids,
                'source': source
            })

        if obs_ids:
            raw_obs_id_input = obs_ids[0]['obs_id']

    # --- GTI PARSING RESTORED ---
    gti_specifiers = {} 
    gti_list_parsed: list[int] = [] 

    if gti_query_str:
        is_obsid_gti_format = False
        if '-' in gti_query_str:
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
        else: 
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

    # --- SCREENING TOGGLES (Using req object) ---
    apply_screening = req.apply_screening
    screening_energy_low = req.screening_energy_low
    screening_energy_high = req.screening_energy_high
    screening_min_bad_channels = req.screening_min_bad_channels

    if request.POST.get('get_detailed_info') == 'true':
        target_id = raw_obs_id_input.split(',')[0].strip() if ',' in raw_obs_id_input else raw_obs_id_input
        dir_path = os.path.join(settings.DATA_DIR, target_id, 'jspipe')
        files = Item.objects.filter(name__contains=quality, path__startswith=os.path.join(target_id, 'jspipe'), type=Item.item_type[1][0]).order_by('name')
        
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
        if ',' in raw_obs_id_input:
            obs_id_list = [x.strip() for x in raw_obs_id_input.split(',')]
        else:
            obs_id_list = [raw_obs_id_input]

        if gti_specifiers:
            obs_id_list = [obsid for obsid in obs_id_list if obsid in gti_specifiers]
            
        plot_divs: list[str] = []
        max_gtis: list[int] = [] 
        screening_summaries = {}
        default_binnings = {}

        for plot_type in plot_types:
            plot_type_key = plot_type.replace('-', '_')
            if plot_type_key not in PLOTS: continue
            
            plot_info = PLOTS[plot_type_key]
            all_file_paths_combined = []
            all_gti_numbers_combined = []
            all_gti_labels_combined = []
            current_max_gti = 0

            for single_obs_id in obs_id_list:
                single_obs_dir = os.path.join(settings.DATA_DIR, single_obs_id, 'jspipe')
                files = Item.objects.filter(name__contains=quality, path__startswith=os.path.join(single_obs_id, 'jspipe'), type=Item.item_type[1][0]).order_by('name')
                file_names_qs = files.filter(name__contains=plot_info['file_type']).exclude(name__regex=r'_BAND\d+')
                
                if not file_names_qs.exists(): continue

                gtis_to_process = []
                if gti_specifiers:
                    gtis_to_process = gti_specifiers.get(single_obs_id, [])
                elif gti_list_parsed:
                    gtis_to_process = gti_list_parsed

                # Ensure this block is collecting files from ALL obs_ids in the list
                if plot_type_key == 'summed_spectrum' or plot_type_key == 'global_hid':
                    for file_item in file_names_qs.order_by('name'):
                       all_file_paths_combined.append(os.path.join(single_obs_dir, file_item.name))
                       all_gti_labels_combined.append(single_obs_id)
                       gti_match = re.search(r'GTI(\d+)', file_item.name)
                       if gti_match: 
                          all_gti_numbers_combined.append(int(gti_match.group(1)))
                          
                elif gtis_to_process: 
                    for gti_num in gtis_to_process:
                        file_match_item = file_names_qs.filter(name__regex=fr'GTI0*{gti_num}([^\\d]|$)').first()
                        if file_match_item:
                            all_file_paths_combined.append(os.path.join(single_obs_dir, file_match_item.name))
                            all_gti_numbers_combined.append(gti_num)
                            all_gti_labels_combined.append(single_obs_id)
                else: 
                    for file_item in file_names_qs.order_by('name'):
                        all_file_paths_combined.append(os.path.join(single_obs_dir, file_item.name))
                        all_gti_labels_combined.append(single_obs_id)
                        gti_match = re.search(r'GTI(\d+)', file_item.name)
                        if gti_match: 
                            val = int(gti_match.group(1))
                            all_gti_numbers_combined.append(val)
                            if val > current_max_gti: current_max_gti = val

            max_gtis.append(current_max_gti)

            if not all_file_paths_combined:
                continue

            calc_min = calculate_default_binning(all_file_paths_combined[0], plot_type_key)
            actual_min_value = req.min_value if req.min_value else (calc_min if calc_min is not None else plot_info['min_value'])
            default_binnings[plot_type_key] = actual_min_value

            bg_dash = 'solid'
            if apply_screening and plot_type_key in ['spectrum', 'summed_spectrum', 'power_density_spectrum']:
                passed_files, passed_gtis, results = screen_gti_files(
                    all_file_paths_combined, all_gti_numbers_combined,
                    energy_low=screening_energy_low, energy_high=screening_energy_high, min_bad_channels=screening_min_bad_channels
                )
                
                screening_summaries[plot_type_key] = get_screening_summary(results)
                
                if passed_files:
                    # Filter labels to match screened files
                    new_labels = []
                    for pf in passed_files:
                        for idx, orig_f in enumerate(all_file_paths_combined):
                            if pf == orig_f:
                                new_labels.append(all_gti_labels_combined[idx])
                                break
                    all_file_paths_combined = passed_files
                    all_gti_numbers_combined = passed_gtis
                    all_gti_labels_combined = new_labels
                else:
                    bg_dash = 'dash' 
                    screening_summaries[plot_type_key]['all_failed'] = True

            try:
                if plot_type_key in ['spectrum', 'summed_spectrum']:
                    plot_div = plot_info['function'](actual_min_value, ",".join(obs_id_list), all_file_paths_combined, all_gti_numbers_combined, bg_dash=bg_dash, gti_labels=all_gti_labels_combined)
                else:
                    plot_div = plot_info['function'](actual_min_value, ",".join(obs_id_list), all_file_paths_combined, all_gti_numbers_combined, gti_labels=all_gti_labels_combined)
                plot_divs.append(plot_div)
            except Exception as e:
                logger.exception(f"[plot_data] Error plotting {plot_type_key}: {e}")
                return JsonResponse({'error': str(e)}, status=500)
        
        if not plot_divs: return JsonResponse({'error': 'No plots could be generated.'})
        
        return JsonResponse({
            'plotDivs': plot_divs, 
            'maxGTI': max_gtis, 
            'obsID': raw_obs_id_input,
            'defaultBinnings': default_binnings,
            'screeningSummaries': screening_summaries,
            'gtiQuery': gti_query_str,  # 🟢 ADDED: Return the query used
        })

    if not raw_obs_id_input: return JsonResponse({'error': 'No observation ID provided.'}, status=400)
    
    obs_id = raw_obs_id_input.split(',')[0].strip()
    # Note for Ethan: I am sticking to `path__startswith` string-matching rather than
    # swapping entirely to the `obs_id` integer lookups. Many of my advanced routing 
    # and UI features depend heavily on these path strings to function properly.
    # Since Postgres has the `path_idx` index on this column, speed/performance 
    # is still optimized for this approach. (Also `db_update.py` was tweaked to strip 
    # the leading slash to ensure compatibility with this method).
    all_files_qs = Item.objects.filter(path__startswith=os.path.join(obs_id, 'jspipe'), name__contains=quality, type=Item.item_type[1][0])
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

    if obs_id: return JsonResponse({'suggestions': list(suggested_obs.values_list('name', flat=True))})
    else: return JsonResponse({'suggestions': list(suggested_obs.values_list('source', flat=True))})


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
        path_prefix = os.path.join(obs_id, 'jspipe')
        
        # Filter items by path prefix and quality, then get all file names
        files_with_gti_info = Item.objects.filter(
            path__startswith=path_prefix,
            name__contains=quality,
            type=Item.item_type[1][0] 
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
                    # Broaden glob to catch both 'js_' and 'js_ni' prefixes
                    gti_files = list(jspipe_dir.glob(f'js*{obs_id}*_{quality}*GTI{gti_num}*'))
                    
                    if not gti_files: return HttpResponse(f'No files found for GTI{gti_num}', status=404)
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
                                # Broaden glob here as well
                                gti_files = list(jspipe_dir.glob(f'js*{obs_id}*_{quality}*GTI{gti_num}*'))
                                if gti_files:
                                    for file in gti_files: archive.write(str(file), file.name); files_added = True
                            if not files_added: return HttpResponse('No GTI files found', status=404)
                        return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_GTI_{"-".join(gti_numbers)}_{quality}.zip')
            else:
                # Broaden glob for 'all GTIs' download
                gti_files = list(jspipe_dir.glob(f'js*{obs_id}*_{quality}*GTI*'))
                if not gti_files: return HttpResponse(f'No GTI files found', status=404)
                with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
                    with zipfile.ZipFile(tmp.name, 'w') as archive:
                        for file in gti_files: archive.write(str(file), file.name)
                    return FileResponse(open(tmp.name, 'rb'), as_attachment=True, filename=f'{obs_id}_all_GTI_{quality}.zip')
        elif data_type == 'obs': 
            return create_obs_archive(obs_id, base_path)
        else: 
            return HttpResponse('Invalid data type', status=400)
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
    
    playlist_obs_ids = [x.strip() for x in obs_ids_str.split(',')]
    
    # 1. Identify Source and fetch ALL obsids for that source for context
    source_name = None
    all_source_obs_ids = []
    try:
        first_item = Item.objects.filter(path__startswith=playlist_obs_ids[0] + os.path.sep).first()
        if first_item and first_item.source:
            source_name = first_item.source
            paths = Item.objects.filter(source=source_name).values_list('path', flat=True).distinct()
            all_source_obs_ids = sorted(list(set(p.split(os.path.sep)[0] for p in paths if p.split(os.path.sep)[0].isdigit())))
    except Exception: pass

    # Ensure all playlist items are included even if source discovery failed
    obs_ids_to_process = list(playlist_obs_ids)
    for oid in all_source_obs_ids:
        if oid not in obs_ids_to_process:
            obs_ids_to_process.append(oid)

    fig = go.Figure()
    raw_data = []
    
    # Separate points for background trace to keep plot clean
    bg_x, bg_y, bg_obsids = [], [], []

    for obs_id in obs_ids_to_process:
        abs_dir_path = os.path.join(settings.DATA_DIR, obs_id, 'jspipe') 
        rel_dir_path = os.path.join(obs_id, 'jspipe')
        
        files = Item.objects.filter(
            name__contains=quality, path__startswith=rel_dir_path, type=Item.item_type[1][0]
        ).filter(name__contains='.lc.gz').exclude(name__contains='.bg').exclude(name__contains='.keithbg')
        
        paths = [os.path.join(abs_dir_path, f.name) for f in files]
        all_hardness, all_intensity = [], []

        for fp in paths:
            try:
                t, s, h, i = process_lc_file(fp)
                with np.errstate(divide='ignore', invalid='ignore'):
                    h_ratio = h / s
                valid = np.isfinite(h_ratio) & np.isfinite(i) & (h_ratio > 0) & (i > 0)
                if np.any(valid):
                    all_hardness.extend(h_ratio[valid])
                    all_intensity.extend(i[valid])
            except Exception: continue
        
        if all_hardness and all_intensity:
            avg_h, avg_i = np.mean(all_hardness), np.mean(all_intensity)
            is_active = obs_id in playlist_obs_ids
            raw_data.append({'obsid': obs_id, 'hardness': float(avg_h), 'intensity': float(avg_i)})
            
            if is_active:
                # Add individual trace for playlist items (Legend entry)
                fig.add_trace(go.Scatter(
                    x=[avg_h], y=[avg_i], mode='markers+text', text=[obs_id],
                    textposition='top center', name=obs_id,
                    marker=dict(size=12, line=dict(width=1, color='white')),
                    hovertemplate=f"<b>{obs_id}</b><br>Hardness: %{{x:.3f}}<br>Intensity: %{{y:.2f}}<extra></extra>"
                ))
            else:
                bg_x.append(avg_h)
                bg_y.append(avg_i)
                bg_obsids.append(obs_id)

    # Add single background trace for context points
    if bg_x:
        fig.add_trace(go.Scatter(
            x=bg_x, y=bg_y, mode='markers',
            marker=dict(size=8, color='#e5e7eb', opacity=0.4),
            name='Other Observations',
            text=bg_obsids,
            hoverinfo='text+x+y',
            showlegend=True
        ))

    if not raw_data: 
        return JsonResponse({'error': 'No valid data found.'})

    fig.update_layout(
        title=f'Global HID: {source_name or "Multi-Observation"}',  
        xaxis=dict(title=r'$\text{Hardness}\ (4-12\ keV / 2-4\ keV)$', showline=True, linewidth=1, linecolor='black', showgrid=False),
        yaxis=dict(title=r'$\text{Intensity}\ (counts/s)$', type='log', showline=True, linewidth=1, linecolor='black', showgrid=False),
        height=600, template='plotly_white', plot_bgcolor='white', paper_bgcolor='white', font=dict(color='black'),
        showlegend=True, hovermode='closest'
    )

    div = plot(fig, output_type='div', include_plotlyjs=False)
    return JsonResponse({'plotDiv': div, 'rawData': raw_data})


def plot_theater_png(request: HttpRequest) -> HttpResponse:
    """
    Generates a static PNG for the LC Theater using Plotly.
    Matches the EXACT logic of the background interactive plots.
    """
    obs_id = request.GET.get('obs_id', '')
    plot_type = request.GET.get('plot_type', '').replace('-', '_')
    quality = request.GET.get('quality', 'goddard')
    playlist_str = request.GET.get('playlist', '')
    playlist = [x.strip() for x in playlist_str.split(',')] if playlist_str else []

    if not obs_id or not plot_type:
        return HttpResponse("Missing parameters", status=400)

    # 1. 🟢 CACHE LOOKUP (v9 - Size reduced to 9) - TEMPORARILY DISABLED FOR DEVELOPMENT
    cache_key = f"theater_v9_{obs_id}_{plot_type}_{quality}"
    if plot_type == 'global_hid' and playlist_str:
        playlist_hash = hashlib.md5(playlist_str.encode()).hexdigest()[:8]
        cache_key += f"_{playlist_hash}"
    
    # =========================================================================
    # 🚨🚨🚨 URGENT PRODUCTION REMINDER: CACHE IS PAUSED FOR DEVELOPMENT 🚨🚨🚨
    # =========================================================================
    # UNCOMMENT THE BLOCK BELOW BEFORE DEPLOYING TO PRODUCTION!
    # If left commented, generating 4 plots per user click will CRASH the server.
    # 
    # cached_img = cache.get(cache_key)
    # if cached_img:
    #     response = HttpResponse(cached_img, content_type="image/png")
    #     response['Cache-Control'] = 'public, max-age=86400' 
    #     return response
    # =========================================================================

    # 2. Locate Data
    plot_info = PLOTS.get(plot_type)
    if not plot_info:
        return HttpResponse("Invalid plot type", status=400)

    full_paths = []
    gti_numbers = []
    if plot_type != 'global_hid':
        # 🟢 ROBUST GTI DISCOVERY (Matches plot_data logic)
        rel_dir_fragment = os.path.join(obs_id, 'jspipe')
        query = Item.objects.filter(
            path__contains=rel_dir_fragment, 
            name__contains=quality,
            type=Item.item_type[1][0] # Ensure we only get files
        ).filter(name__contains=plot_info['file_type'])
        
        if plot_type in ['light_curve', 'hardness_intensity_diagram']:
            query = query.exclude(name__contains='.bg-lc.gz').exclude(name__contains='.bg3c-lc.gz')
        
        # 🟢 CRITICAL: Exclude sub-bands to prevent duplicate legend entries/lines
        file_items = query.exclude(name__regex=r'_BAND\d+').order_by('name')
        if not file_items.exists():
            return HttpResponse(f"No data files found for {obs_id} ({plot_type})", status=404)
        
        for item in file_items:
            # Reconstruct absolute path carefully
            path_cleaned = item.path.lstrip('./').lstrip('/')
            fp = os.path.join(settings.DATA_DIR, path_cleaned, item.name)
            
            if os.path.exists(fp):
                full_paths.append(fp)
                match = re.search(r'GTI(\d+)', item.name)
                gti_numbers.append(int(match.group(1)) if match else 0)
    
    try:
        # 3. Use default binning logic (Original Behavior)
        m_val = plot_info.get('min_value', 10)
        if full_paths:
            calc_min = calculate_default_binning(full_paths[0], plot_type)
            if calc_min is not None:
                m_val = calc_min
        
        def fig_to_png(fig_obj):
            if not fig_obj or not hasattr(fig_obj, 'update_layout'): return None
            fig_obj.update_layout(
                width=700, height=500,
                margin=dict(l=50, r=20, t=50, b=50),
                paper_bgcolor='white',
                plot_bgcolor='white',
                font=dict(size=12, color='black'),
                showlegend=False
            )
            return pio.to_image(fig_obj, format='png', engine='kaleido')

        img_data = None

        if plot_type == 'light_curve':
            # 🟢 Pass ALL paths and GTI numbers
            res = light_curve_plot(m_val, obs_id, full_paths, gti_numbers, gti_labels=[obs_id]*len(full_paths), output_type='dict')
            if isinstance(res, dict): img_data = fig_to_png(go_obj.Figure(res))

        elif plot_type == 'power_density_spectrum':
            # 🟢 Pass ALL paths and GTI numbers
            res = get_pds_data_and_plot(m_val, obs_id, full_paths, gti_numbers, gti_labels=[obs_id]*len(full_paths), output_type='dict')
            if isinstance(res, dict): img_data = fig_to_png(go_obj.Figure(res))

        elif plot_type == 'hardness_intensity_diagram':
            # 🟢 Pass ALL paths and GTI numbers
            res = get_hid_data_and_plot(m_val, obs_id, full_paths, gti_numbers, gti_labels=[obs_id]*len(full_paths), output_type='dict')
            if isinstance(res, dict): img_data = fig_to_png(go_obj.Figure(res))
            
        elif plot_type == 'global_hid':
            fig = get_global_hid_theater_figure(obs_id, quality=quality, playlist=playlist)
            img_data = fig_to_png(fig)

        if img_data:
            # =========================================================================
            # 🚨🚨🚨 URGENT PRODUCTION REMINDER: UNCOMMENT THIS FOR PRODUCTION 🚨🚨🚨
            # =========================================================================
            # cache.set(cache_key, img_data)
            # =========================================================================

            response = HttpResponse(img_data, content_type="image/png")
            response['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0' # Prevent browser caching too during dev
            return response
        else:
            return HttpResponse("Error generating figure", status=500)

    except Exception as e:
        logger.exception(f"Theater PNG Speed Error: {e}")
        return HttpResponse(f"Error: {str(e)}", status=500)


def get_global_hid_theater_figure(obs_id, quality='goddard', playlist=None):
    """
    Generates a Global HID figure for the theater.
    Shows the full source context in light gray, 
    the playlist in medium gray with labels, and the current obs_id in blue.
    """
    # 1. Identify Source and fetch ALL obsids for that source for context
    source_name = None
    all_source_obs_ids = []
    playlist = playlist or []
    
    # Try to find source name from current obs_id or playlist items
    discovery_ids = [obs_id] + playlist
    try:
        for oid in discovery_ids:
            item = Item.objects.filter(path__startswith=oid, source__isnull=False).exclude(source='').first()
            if item and item.source:
                source_name = item.source
                paths = Item.objects.filter(source=source_name).values_list('path', flat=True).distinct()
                all_source_obs_ids = sorted(list(set(p.replace('\\', '/').split('/')[0] for p in paths if p and p.replace('\\', '/').split('/')[0].isdigit())))
                break
    except Exception as e:
        logger.warning(f"Source discovery failed for {obs_id}: {e}")

    # Ensure all playlist items and current obs_id are included
    obs_ids_to_process = list(set([obs_id] + playlist))
    for oid in all_source_obs_ids:
        if oid not in obs_ids_to_process:
            obs_ids_to_process.append(oid)
    
    fig = go.Figure()
    
    # Points to plot
    bg_x, bg_y, bg_obsids = [], [], []       # All other obs
    curr_x, curr_y = [], []                   # Active obs_id

    for oid in obs_ids_to_process:
        rel_dir_path = os.path.join(oid, 'jspipe')
        abs_dir_path = os.path.join(settings.DATA_DIR, rel_dir_path)
        
        files = Item.objects.filter(
            name__contains=quality, path__startswith=rel_dir_path, type=Item.item_type[1][0]
        ).filter(name__contains='.lc.gz').exclude(name__contains='.bg').exclude(name__contains='.keithbg')
        
        paths = [os.path.join(abs_dir_path, f.name) for f in files]
        all_hardness, all_intensity = [], []

        for fp in paths:
            try:
                t, s, h, i = process_lc_file(fp)
                with np.errstate(divide='ignore', invalid='ignore'):
                    h_ratio = h / s
                valid = np.isfinite(h_ratio) & np.isfinite(i) & (h_ratio > 0) & (i > 0)
                if np.any(valid):
                    all_hardness.extend(h_ratio[valid])
                    all_intensity.extend(i[valid])
            except Exception: continue
        
        if all_hardness and all_intensity:
            avg_h, avg_i = np.mean(all_hardness), np.mean(all_intensity)
            
            if oid == obs_id:
                curr_x.append(avg_h)
                curr_y.append(avg_i)
            else:
                bg_x.append(avg_h)
                bg_y.append(avg_i)
                bg_obsids.append(oid)

    # Layer 1: Background History - Dark Grey, no labels
    if bg_x:
        fig.add_trace(go.Scatter(
            x=bg_x, y=bg_y, mode='markers',
            marker=dict(size=9, color='#6b7280', opacity=0.8),
            text=bg_obsids,
            name='Other Obs'
        ))
        
    # Layer 2: Active Frame - Bright Blue + BOLD LABEL
    if curr_x:
        fig.add_trace(go.Scatter(
            x=curr_x, y=curr_y, mode='markers+text',
            text=[obs_id], textposition='top center',
            marker=dict(size=9, color='#3b82f6'),
            textfont=dict(color='#1d4ed8', size=11, family='Arial Black'),
            name='Current'
        ))

    fig.update_layout(
        title=f'Global HID: {source_name or "Unknown"}',
        xaxis=dict(title=r'$\text{Hardness}\ (4-12\ keV / 2-4\ keV)$', showline=True, linewidth=1, linecolor='black'),
        yaxis=dict(title=r'$\text{Intensity}\ (counts/s)$', type='log', showline=True, linewidth=1, linecolor='black'),
        template='plotly_white',
        showlegend=False,
        margin=dict(l=50, r=20, t=50, b=50)
    )
    
    return fig
