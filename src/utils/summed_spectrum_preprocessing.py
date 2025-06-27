"""
Utilities to process and plot summed spectra across multiple GTIs
"""
import re
import os
import time
import logging
from typing import List, Tuple, Optional

import numpy as np
import pandas as pd
from numpy import ndarray
from astropy.io import fits

from src.utils.plots import data_plot
from src.utils.spectrum_preprocessing import channel_kev

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def summed_spectrum_data(
    data_paths: List[str],
    gti_numbers: List[int],
    cut_off: Tuple[float, float] = (0.3, 12)
) -> Tuple[ndarray, ndarray, ndarray, ndarray, ndarray]:
    """
    Sum spectral data across multiple GTIs and compute net rate and background.
    
    Parameters
    ----------
    data_paths : List[str]
        List of file paths to the spectrum files (.jsgrp format)
    gti_numbers : List[int]
        List of GTI numbers to process
    cut_off : Tuple[float, float], optional
        Energy range to include (default: 0.3 to 12 keV)
    
    Returns
    -------
    Tuple[ndarray, ndarray, ndarray, ndarray, ndarray]
        x_bin (energy), net_rate, net_rate_error, net_background, x_error
    """
    start_time = time.time()
    logger.info(f"Starting summed spectrum processing for {len(data_paths)} files")
    logger.info(f"GTI numbers: {gti_numbers}")
    logger.info(f"Cut-off range: {cut_off} keV")
    
    if not data_paths or not gti_numbers:
        raise ValueError("No data paths or GTI numbers provided")
    
    # Initialize accumulation arrays
    summed_spec = None
    summed_background = None
    summed_time = 0.0
    summed_52time = 0.0
    channels = None
    groupings = None
    
    # Process each GTI
    for i, (data_path, gti_number) in enumerate(zip(data_paths, gti_numbers)):
        gti_start_time = time.time()
        logger.info(f"Processing GTI {gti_number} ({i+1}/{len(data_paths)}): {data_path}")
        
        if not os.path.exists(data_path):
            logger.warning(f"Spectrum file not found: {data_path}")
            continue
            
        # Read spectrum file
        logger.debug(f"Opening spectrum FITS file: {data_path}")
        file_read_start = time.time()
        with fits.open(data_path) as spec_file:
            spectrum_info = spec_file[1].header
            spectrum_data = spec_file[1].data
            
            # Get detector count from response file
            response = spectrum_info['RESPFILE']
            nfpm = int(re.search(r'_d(\d+)', response).group(1))
            
            # Get exposure time
            gti_time = float(spectrum_info['EXPOSURE'])
            
        logger.debug(f"Spectrum file read in {time.time() - file_read_start:.3f}s")
        logger.debug(f"GTI {gti_number}: exposure={gti_time:.2f}s, nfpm={nfpm}")
        
        # Read background files
        bg_path = data_path.replace('.jsgrp', '.bg')
        ronbg_path = data_path.replace('.jsgrp', '.ronbg')
        
        logger.debug(f"Looking for background files: {bg_path}, {ronbg_path}")
        
        # Initialize arrays on first iteration
        if summed_spec is None:
            logger.info("Initializing summed spectrum arrays")
            init_start_time = time.time()
            channels = spectrum_data['CHANNEL']
            groupings = spectrum_data['GROUPING']
            summed_spec = np.zeros_like(spectrum_data['COUNTS'], dtype=float)
            summed_background = np.zeros_like(spectrum_data['COUNTS'], dtype=float)
            logger.info(f"Arrays initialized with shape {summed_spec.shape} in {time.time() - init_start_time:.3f}s")
        
        # Sum spectral counts: summed_spec[i] = summed_spec[i] + gti_spec[i,j]
        logger.debug(f"Adding spectrum counts for GTI {gti_number}")
        summed_spec += spectrum_data['COUNTS'].astype(float)
        
        # Handle background files
        bg_start_time = time.time()
        if os.path.exists(bg_path):
            logger.debug(f"Reading background file: {bg_path}")
            with fits.open(bg_path) as bg_file:
                bg_info = bg_file[1].header
                bg_data = bg_file[1].data
                
                # Convert to pandas DataFrame for easier column access
                bg_df = pd.DataFrame(bg_data)
                
                if 'RATE' in bg_df.columns:
                    # Convert rate to counts if needed
                    bg_counts = bg_df['RATE'] * bg_info['EXPOSURE']
                else:
                    bg_counts = bg_df['COUNTS']
                summed_background += bg_counts.astype(float)
            logger.debug(f"Background file processed in {time.time() - bg_start_time:.3f}s")
        else:
            logger.warning(f"Background file not found: {bg_path}")
        
        # Handle .ronbg files for readout noise background
        if os.path.exists(ronbg_path):
            logger.debug(f"Reading readout noise background file: {ronbg_path}")
            ronbg_start_time = time.time()
            with fits.open(ronbg_path) as ronbg_file:
                ronbg_info = ronbg_file[1].header
                ronbg_data = ronbg_file[1].data
                
                # Convert to pandas DataFrame for easier column access
                ronbg_df = pd.DataFrame(ronbg_data)
                
                if 'RATE' in ronbg_df.columns:
                    # For .ronbg files (count rate): summed_ronbg[i] = summed_ronbg[i] + gti_ronbg_rate[i,j] * gti_time[j]
                    ronbg_counts = ronbg_df['RATE'] * gti_time
                else:
                    ronbg_counts = ronbg_df['COUNTS']
                
                # Add readout noise background to total background
                summed_background += ronbg_counts.astype(float)
            logger.debug(f"Readout noise background processed in {time.time() - ronbg_start_time:.3f}s")
        else:
            logger.debug(f"Readout noise background file not found: {ronbg_path}")
        
        # Track exposure times
        summed_time += gti_time
        summed_52time += gti_time * nfpm / 52.0
        
        gti_elapsed = time.time() - gti_start_time
        logger.info(f"GTI {gti_number} processed in {gti_elapsed:.3f}s")
    
    processing_time = time.time() - start_time
    logger.info(f"All GTIs processed in {processing_time:.3f}s. Total exposure: {summed_time:.2f}s, 52-FPM normalized: {summed_52time:.2f}s")
    
    if summed_spec is None:
        raise ValueError("No valid spectrum files found")
    
    # Calculate error bars: summed_error_cts[i] = sqrt(summed_spec[i] > 1)
    logger.info("Calculating error bars and energy conversion")
    calc_start_time = time.time()
    summed_error_cts = np.sqrt(np.maximum(summed_spec, 1))
    
    # Convert channels to energy
    logger.debug("Converting channels to energy")
    x_data = channel_kev(channels)
    energy_bin_width = float(x_data[1] - x_data[0])
    
    # Apply grouping to bin the data
    logger.debug("Applying energy grouping")
    bins = np.argwhere(groupings == 1).flatten()
    bins = np.append(bins, len(groupings))
    logger.info(f"Energy binning: {len(bins)-1} bins from {len(channels)} channels")
    
    # Bin the data
    logger.debug("Binning spectral data")
    bin_start_time = time.time()
    x_bin = []
    net_rate = []
    net_rate_error = []
    net_background = []
    
    for i in range(len(bins) - 1):
        start_idx = bins[i]
        end_idx = bins[i + 1]
        
        # Energy bin center
        energy_center = np.mean(x_data[start_idx:end_idx])
        x_bin.append(energy_center)
        
        # Sum counts in this energy bin
        spec_counts = np.sum(summed_spec[start_idx:end_idx])
        bg_counts = np.sum(summed_background[start_idx:end_idx])
        error_counts = np.sqrt(np.sum(summed_error_cts[start_idx:end_idx]**2))
        
        # Calculate net rate: net_rate[i] = (summed_spec[i] - summed_background[i]) / summed_52time
        net_rate_val = (spec_counts - bg_counts) / summed_52time
        net_rate.append(net_rate_val)
        
        # Error bars: net_rate_error[i] = summed_error_cts[i] / summed_52time
        net_rate_error_val = error_counts / summed_52time
        net_rate_error.append(net_rate_error_val)
        
        # Background overlay: net_background[i] = summed_background[i] / summed_52time
        net_bg_val = bg_counts / summed_52time
        net_background.append(net_bg_val)
    
    # Convert to numpy arrays
    logger.debug(f"Data binning completed in {time.time() - bin_start_time:.3f}s")
    x_bin = np.array(x_bin)
    net_rate = np.array(net_rate)
    net_rate_error = np.array(net_rate_error)
    net_background = np.array(net_background)
    
    # Print detailed summed spectrum properties before energy cut-off
    print("\n" + "="*80)
    print("SUMMED SPECTRUM PROPERTIES AND VALUES")
    print("="*80)
    print(f"Total GTIs processed: {len(data_paths)}")
    print(f"GTI numbers: {gti_numbers}")
    print(f"Total exposure time: {summed_time:.3f} s")
    print(f"52-FPM normalized exposure: {summed_52time:.3f} s")
    print(f"Effective detector count: {summed_52time/summed_time*52:.1f} FPMs")
    print(f"Original spectrum channels: {len(channels)}")
    print(f"Energy bins after grouping: {len(x_bin)}")
    print(f"Energy range: {x_bin.min():.3f} - {x_bin.max():.3f} keV")
    print(f"Energy bin width: {energy_bin_width:.6f} keV")
    
    # Raw counts statistics
    total_spec_counts = np.sum(summed_spec)
    total_bg_counts = np.sum(summed_background)
    net_counts = total_spec_counts - total_bg_counts
    print(f"\nRAW COUNTS STATISTICS:")
    print(f"Total spectrum counts: {total_spec_counts:.0f}")
    print(f"Total background counts: {total_bg_counts:.0f}")
    print(f"Net counts: {net_counts:.0f}")
    print(f"Background fraction: {total_bg_counts/total_spec_counts*100:.1f}%")
    
    # Rate statistics (before energy cut-off)
    print(f"\nRATE STATISTICS (before energy cut-off):")
    print(f"Net rate range: {net_rate.min():.3e} - {net_rate.max():.3e} counts/s/det")
    print(f"Net rate mean: {net_rate.mean():.3e} counts/s/det")
    print(f"Net rate median: {np.median(net_rate):.3e} counts/s/det")
    print(f"Net rate stddev: {np.std(net_rate):.3e} counts/s/det")
    print(f"Net rate variance: {np.var(net_rate):.3e} counts/s/det")
    print(f"Background rate range: {net_background.min():.3e} - {net_background.max():.3e} counts/s/det")
    print(f"Background rate mean: {net_background.mean():.3e} counts/s/det")
    print(f"Signal-to-noise ratio (mean): {net_rate.mean()/(net_rate_error.mean()):.2f}")
    
    # Energy band statistics
    print(f"\nENERGY BAND STATISTICS:")
    low_energy_mask = x_bin <= 2.0
    mid_energy_mask = (x_bin > 2.0) & (x_bin <= 8.0)
    high_energy_mask = x_bin > 8.0
    
    if np.any(low_energy_mask):
        low_rate_sum = np.sum(net_rate[low_energy_mask])
        print(f"Low energy (≤2 keV) net rate sum: {low_rate_sum:.3e} counts/s/det")
    
    if np.any(mid_energy_mask):
        mid_rate_sum = np.sum(net_rate[mid_energy_mask])
        print(f"Mid energy (2-8 keV) net rate sum: {mid_rate_sum:.3e} counts/s/det")
    
    if np.any(high_energy_mask):
        high_rate_sum = np.sum(net_rate[high_energy_mask])
        print(f"High energy (>8 keV) net rate sum: {high_rate_sum:.3e} counts/s/det")
    
    # Sample data points for verification
    print(f"\nSAMPLE DATA POINTS (first 10 bins):")
    print(f"{'Energy (keV)':<12} {'Net Rate':<12} {'Error':<12} {'Background':<12}")
    print("-" * 50)
    for i in range(min(10, len(x_bin))):
        print(f"{x_bin[i]:<12.3f} {net_rate[i]:<12.3e} {net_rate_error[i]:<12.3e} {net_background[i]:<12.3e}")
    
    # Apply energy cut-off
    logger.debug(f"Applying energy cut-off: {cut_off[0]}-{cut_off[1]} keV")
    energy_mask = (x_bin >= cut_off[0]) & (x_bin <= cut_off[1])
    bins_before = len(x_bin)
    x_bin = x_bin[energy_mask]
    net_rate = net_rate[energy_mask]
    net_rate_error = net_rate_error[energy_mask]
    net_background = net_background[energy_mask]
    logger.info(f"Energy cut-off applied: {bins_before} -> {len(x_bin)} bins")
    
    # Print properties after energy cut-off
    print(f"\nAFTER ENERGY CUT-OFF ({cut_off[0]}-{cut_off[1]} keV):")
    print(f"Energy bins: {len(x_bin)}")
    print(f"Energy range: {x_bin.min():.3f} - {x_bin.max():.3f} keV")
    print(f"Net rate range: {net_rate.min():.3e} - {net_rate.max():.3e} counts/s/det")
    print(f"Net rate sum: {np.sum(net_rate):.3e} counts/s/det")
    print(f"Background rate sum: {np.sum(net_background):.3e} counts/s/det")
    
    # Check for any problematic values
    neg_rate_count = np.sum(net_rate < 0)
    zero_error_count = np.sum(net_rate_error <= 0)
    inf_count = np.sum(~np.isfinite(net_rate))
    
    print(f"\nDATA QUALITY CHECKS:")
    print(f"Negative net rates: {neg_rate_count}/{len(net_rate)} bins")
    print(f"Zero/negative errors: {zero_error_count}/{len(net_rate_error)} bins")
    print(f"Non-finite values: {inf_count}/{len(net_rate)} bins")
    
    if neg_rate_count > 0:
        print(f"WARNING: {neg_rate_count} bins have negative net rates (background > source)")
    
    print("="*80)
    print()
    
    # Calculate x_error (half bin width)
    x_error = np.full_like(x_bin, energy_bin_width / 2)
    
    total_time = time.time() - start_time
    logger.info(f"Summed spectrum processing completed in {total_time:.3f}s")
    logger.info(f"Final spectrum: {len(x_bin)} energy bins, energy range {x_bin.min():.3f}-{x_bin.max():.3f} keV")
    
    return x_bin, net_rate, net_rate_error, net_background, x_error


def summed_spectrum_plot(
    min_value: int,
    obs_id: int,
    data_paths: List[str],
    gti_numbers: List[int],
    cut_off: Optional[Tuple[float, float]] = None,
    gti_labels: Optional[List[str]] = None
) -> str:
    """
    Create a summed spectrum plot across multiple GTIs.
    
    This function implements the summed spectrum algorithm as specified:
    - Sums spectral counts across GTIs: summed_spec[i] = summed_spec[i] + gti_spec[i,j]
    - Tracks exposure time: summed_time = summed_time + gti_time[j]
    - Tracks 52-FPM normalized exposure: summed_52time = summed_52time + gti_time[j]*gti_nfpm[i]/52
    - Handles different background file types:
      * .bg files (counts): summed as counts
      * .ronbg files (count rate): summed_ronbg[i] = summed_ronbg[i] + gti_ronbg_rate[i,j] * gti_time[j]
    - Calculates net rate: net_rate[i] = (summed_spec[i] - summed_background[i]) / summed_52time
    - Calculates error bars: net_rate_error[i] = sqrt(summed_spec[i] > 1) / summed_52time
    - Provides background overlay: net_background[i] = summed_background[i] / summed_52time
    
    Parameters
    ----------
    min_value : int
        Minimum value for each bin (currently not used for summed spectrum)
    obs_id : int
        Observation ID
    data_paths : List[str]
        File paths to the spectra (.jsgrp files)
    gti_numbers : List[int]
        List of GTI numbers
    cut_off : Optional[Tuple[float, float]]
        Range of accepted data in keV (default: 0.3 to 12 keV)
    gti_labels : Optional[List[str]]
        List of GTI labels (not used for summed spectrum)
    
    Returns
    -------
    str
        Summed spectrum plot as HTML
    """
    if cut_off is None:
        cut_off = (0.3, 12)
    
    logger.info(f"Starting summed spectrum plot for observation {obs_id}")
    logger.info(f"Input: {len(data_paths)} data paths, {len(gti_numbers)} GTI numbers")
    logger.info(f"Energy cut-off: {cut_off} keV")
    
    # Validate inputs
    if not data_paths:
        logger.error("No data paths provided for summed spectrum")
        return "Error: No data paths provided for summed spectrum"
    
    if not gti_numbers:
        logger.error("No GTI numbers provided for summed spectrum")
        return "Error: No GTI numbers provided for summed spectrum"
    
    if len(data_paths) != len(gti_numbers):
        logger.error(f"Mismatch: {len(data_paths)} data paths vs {len(gti_numbers)} GTI numbers")
        return "Error: Number of data paths must match number of GTI numbers"
    
    # Check for existing files
    logger.info("Validating file paths")
    valid_paths = []
    valid_gtis = []
    missing_files = []
    
    for path, gti in zip(data_paths, gti_numbers):
        if os.path.exists(path):
            valid_paths.append(path)
            valid_gtis.append(gti)
            logger.debug(f"Found file for GTI {gti}: {path}")
        else:
            missing_files.append(f"GTI{gti}: {path}")
            logger.warning(f"Missing file for GTI {gti}: {path}")
    
    if not valid_paths:
        error_msg = f"Error: No valid spectrum files found. Missing files: {'; '.join(missing_files)}"
        logger.error(error_msg)
        return error_msg
    
    if missing_files:
        warning_msg = f"Warning: Some files missing for summed spectrum: {'; '.join(missing_files)}"
        logger.warning(warning_msg)
        print(warning_msg)
    
    logger.info(f"Processing {len(valid_paths)} valid files for GTIs: {valid_gtis}")
    
    try:
        # Get summed spectrum data
        plot_start_time = time.time()
        logger.info("Calling summed_spectrum_data function")
        x_bin, net_rate, net_rate_error, net_background, x_error = summed_spectrum_data(
            valid_paths, valid_gtis, cut_off
        )
        data_time = time.time() - plot_start_time
        logger.info(f"Data processing completed in {data_time:.3f}s")
        
        # Create plot with both net spectrum and background
        if len(valid_gtis) > 1:
            gti_range = f"GTI {min(valid_gtis)}-{max(valid_gtis)} ({len(valid_gtis)} GTIs)"
        else:
            gti_range = f"GTI {valid_gtis[0]}"
        
        logger.info(f"Creating plot for {gti_range}")
        logger.info(f"Plot data summary: {len(x_bin)} energy bins, net_rate range: {net_rate.min():.3e} to {net_rate.max():.3e}")
        logger.info(f"Background range: {net_background.min():.3e} to {net_background.max():.3e}")
        
        # Print final plot data summary
        print("\n" + "="*60)
        print("FINAL PLOT DATA SUMMARY")
        print("="*60)
        print(f"Observation ID: {obs_id}")
        print(f"GTI range: {gti_range}")
        print(f"Energy range plotted: {x_bin.min():.3f} - {x_bin.max():.3f} keV")
        print(f"Number of data points: {len(x_bin)}")
        print(f"Net rate statistics:")
        print(f"  Min: {net_rate.min():.3e} counts/s/det")
        print(f"  Max: {net_rate.max():.3e} counts/s/det")
        print(f"  Mean: {net_rate.mean():.3e} counts/s/det")
        print(f"  Median: {np.median(net_rate):.3e} counts/s/det")
        print(f"Background statistics:")
        print(f"  Min: {net_background.min():.3e} counts/s/det")
        print(f"  Max: {net_background.max():.3e} counts/s/det")
        print(f"  Mean: {net_background.mean():.3e} counts/s/det")
        print(f"Peak energy bin: {x_bin[np.argmax(net_rate)]:.3f} keV (rate: {net_rate.max():.3e})")
        print("="*60)
        print()
        
        plot_creation_start = time.time()
        result = data_plot(
            gti_numbers=[0],  # Single trace for summed data
            x_data_list=[x_bin],
            y_data_list=[net_rate],
            x_background_list=[x_bin],
            background_list=[net_background],
            x_errors=[x_error],
            y_uncertainties=[net_rate_error],
            plot_kwargs={'mode': 'markers'},
            layout_kwargs={
                'title': f'Summed Spectrum {obs_id}',
                'xaxis_title': r'$\text{Energy}\ (keV)$',
                'yaxis_title': r'$\text{Net Rate}\ (counts\ s^{-1}\ det^{-1})$',
                'xaxis_type': 'log',
                'yaxis_type': 'log',
                'showlegend': True,
            },
            gti_labels=[f'Net Spectrum ({gti_range})']
        )
        plot_creation_time = time.time() - plot_creation_start
        logger.info(f"Plot creation completed in {plot_creation_time:.3f}s")
        logger.info(f"Plot HTML length: {len(result)} characters")
        logger.info(f"Plot HTML preview: {result[:200]}...")
        
        total_plot_time = time.time() - plot_start_time
        logger.info(f"Total summed spectrum plot generation time: {total_plot_time:.3f}s")
        
        return result
        
    except Exception as e:
        error_msg = f"Error generating summed spectrum: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return error_msg
