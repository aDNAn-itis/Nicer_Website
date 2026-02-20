/**
 * Interactive linking between scientifically related plots
 * This module enables appropriate linking between plots that share physical or conceptual relationships
 * Updated to follow Jack Steiner's clarifications on proper data linking scenarios
 */

// Store state for highlighted points
const highlightState = {
  active: false,
  selectedRange: null,
  selectedGTI: null, // Track selected GTI for GTI-level linking
  originalOpacities: new Map(), // Store original opacities to restore them
  linkedPlots: new Set(), // Track which plots are currently linked
  currentLinkingType: null, // Track the type of linking currently active
};

// Define appropriate linking relationships based on Jack Steiner's feedback
const LINKING_RELATIONSHIPS = {
  // GTI-level linking: entire spectrum linked to entire light curve for same GTI
  GTI_LINKING: {
    plots: ['spectrum', 'summed_spectrum', 'lightcurve'],
    description:
      'GTI-level linking where entire spectrum corresponds to entire light curve for same GTI',
    linkingLevel: 'gti', // Links at GTI level, not point-to-point
  },

  // HID linking: time-based selection in light curve highlights corresponding HID points
  HID_LINKING: {
    plots: ['lightcurve', 'hardness'],
    description:
      'Time range selection in light curve highlights corresponding HID points from same time period',
    linkingLevel: 'temporal', // Links based on temporal correspondence
  },

  // Spectrum-HID zoom linking: only these two plot types can have synchronized zooming
  SPECTRUM_HID_ZOOM_LINKING: {
    plots: ['spectrum', 'hardness'],
    description: 'Spectrum and HID plots can have synchronized zooming',
    linkingLevel: 'zoom', // Links zooming behavior only
  },

  // Power spectrum remains independent
  FREQUENCY_LINKING: {
    plots: ['power_density'],
    description: 'Frequency domain plots - independent of time domain',
    linkingLevel: 'independent',
  },
};

/**
 * Initialize the interactive linking between scientifically related plots
 * This should be called after plots are loaded
 */
export function initInteractiveLinking() {
  // Find all plotly graphs on the page
  const plotlyGraphs = document.querySelectorAll('.js-plotly-plot');

  // No graphs found, exit early
  if (!plotlyGraphs.length) {
    console.log('No plots found to initialize interactive linking');
    return;
  }

  console.log(
    `Found ${plotlyGraphs.length} Plotly graphs to initialize interactive linking`,
  );

  // Identify  plots by type
  const plotsByType = identifyPlotTypes(plotlyGraphs);

  console.log('Identified plots:', plotsByType);

  // Set up appropriate linking relationships based on Jack Steiner's feedback
  setupGTILevelLinking(plotsByType);
  setupHIDLinking(plotsByType);
  setupSpectrumHIDZoomLinking(plotsByType);

  console.log(
    'Interactive linking initialized with scientifically appropriate relationships per Jack Steiner feedback',
  );
}

/**
 * Identify plot types from a collection of Plotly graphs
 * @param {NodeList} plots - Collection of Plotly graph elements
 * @returns {Object} Object containing arrays of plots by type
 */
function identifyPlotTypes(plots) {
  const plotTypes = {
    spectrum: [],
    summed_spectrum: [],
    lightcurve: [],
    power_density: [],
    hardness: [],
    intensity: [],
  };

  plots.forEach((plot, index) => {
    const plotType = classifyPlot(plot);
    if (plotType && plotTypes[plotType]) {
      plotTypes[plotType].push(plot);
      console.log(`Plot ${index + 1} classified as: ${plotType}`);
    } else {
      console.log(`Plot ${index + 1} could not be classified`);
    }
  });

  return plotTypes;
}

/**
 * Classify a single plot based on various indicators
 * @param {HTMLElement} plot - The plot element
 * @returns {string|null} The plot type or null if unidentified
 */
function classifyPlot(plot) {
  // Check container ID first
  const container = plot.closest('[id]');
  if (container) {
    const containerId = container.id.toLowerCase();

    if (containerId.includes('spectrum')) {
      if (containerId.includes('summed')) return 'summed_spectrum';
      return 'spectrum';
    }
    if (
      containerId.includes('light-curve') ||
      containerId.includes('lightcurve')
    ) {
      return 'lightcurve';
    }
    if (containerId.includes('power') && containerId.includes('density')) {
      return 'power_density';
    }
    if (containerId.includes('hardness')) {
      return 'hardness';
    }
    if (containerId.includes('intensity')) {
      return 'intensity';
    }
  }

  // Check plot title
  if (plot.layout && plot.layout.title) {
    const title = plot.layout.title.text?.toLowerCase() || '';

    if (title.includes('spectrum')) {
      if (title.includes('summed')) return 'summed_spectrum';
      return 'spectrum';
    }
    if (title.includes('light curve') || title.includes('lightcurve')) {
      return 'lightcurve';
    }
    if (title.includes('power density')) {
      return 'power_density';
    }
    if (title.includes('hardness')) {
      return 'hardness';
    }
    if (title.includes('intensity') && !title.includes('hardness')) {
      return 'intensity';
    }
  }

  // Check axis labels
  if (plot.layout) {
    const xAxisTitle = plot.layout.xaxis?.title?.text?.toLowerCase() || '';
    const yAxisTitle = plot.layout.yaxis?.title?.text?.toLowerCase() || '';

    // Spectrum plots typically have energy (keV) on x-axis
    if (xAxisTitle.includes('energy') || xAxisTitle.includes('kev')) {
      return 'spectrum';
    }

    // Light curve plots have time on x-axis
    if (xAxisTitle.includes('time') || xAxisTitle.includes('second')) {
      if (yAxisTitle.includes('hardness')) return 'hardness';
      if (yAxisTitle.includes('intensity') || yAxisTitle.includes('count'))
        return 'lightcurve';
    }

    // Power density plots have frequency on x-axis
    if (xAxisTitle.includes('frequency') || xAxisTitle.includes('hz')) {
      return 'power_density';
    }
  }

  // Check data characteristics as fallback
  if (plot.data && plot.data.length > 0) {
    const firstTrace = plot.data[0];
    if (firstTrace.x && firstTrace.x.length > 0) {
      const sampleX = firstTrace.x[0];
      const maxX = Math.max(...firstTrace.x);

      // Typical energy values (keV range)
      if (sampleX > 0 && maxX < 20) {
        return 'spectrum';
      }

      // Typical time values (seconds, could be large)
      if (sampleX > 100 || maxX > 1000) {
        return 'lightcurve'; // Default temporal plot
      }

      // Frequency values (Hz, typically small)
      if (sampleX >= 0 && maxX < 100 && sampleX < 10) {
        return 'power_density';
      }
    }
  }

  return null;
}

/**
 * Set up GTI-level linking between spectra and light curves
 * This implements the correct linking where entire spectrum corresponds to entire light curve
 * @param {Object} plotsByType - Object containing arrays of plots by type
 */
function setupGTILevelLinking(plotsByType) {
  const spectralPlots = [
    ...plotsByType.spectrum,
    ...plotsByType.summed_spectrum,
  ];
  const lightCurvePlots = [...plotsByType.lightcurve];

  if (spectralPlots.length === 0 || lightCurvePlots.length === 0) {
    console.log('No spectrum-light curve pairs found for GTI linking');
    return;
  }

  console.log(
    `Setting up GTI-level linking between ${spectralPlots.length} spectral plots and ${lightCurvePlots.length} light curve plots`,
  );

  // Set up GTI selection handlers
  [...spectralPlots, ...lightCurvePlots].forEach((plot) => {
    setupGTIClickHandler(plot, spectralPlots, lightCurvePlots);
  });
}

/**
 * Set up HID (Hardness Intensity Diagram) linking with light curves
 * Time range selection in light curve highlights corresponding HID points
 * @param {Object} plotsByType - Object containing arrays of plots by type
 */
function setupHIDLinking(plotsByType) {
  const lightCurvePlots = [...plotsByType.lightcurve, ...plotsByType.intensity];
  const hardnessPlots = [...plotsByType.hardness];

  if (lightCurvePlots.length === 0 || hardnessPlots.length === 0) {
    console.log('No light curve-HID pairs found for HID linking');
    return;
  }

  console.log(
    `Setting up HID linking between ${lightCurvePlots.length} temporal plots and ${hardnessPlots.length} hardness plots`,
  );

  // Set up temporal selection handlers for HID linking
  lightCurvePlots.forEach((plot) => {
    const relatedHIDPlots = hardnessPlots;
    setupHIDClickHandler(plot, relatedHIDPlots);
  });
}

/**
 * Set up zoom linking only between spectrum and HID plots
 * @param {Object} plotsByType - Object containing arrays of plots by type
 */
function setupSpectrumHIDZoomLinking(plotsByType) {
  const spectrumPlots = [
    ...plotsByType.spectrum,
    ...plotsByType.summed_spectrum,
  ];
  const hidPlots = [...plotsByType.hardness];

  if (spectrumPlots.length === 0 || hidPlots.length === 0) {
    console.log('No spectrum-HID pairs found for zoom linking');
    return;
  }

  console.log(
    `Setting up zoom linking between ${spectrumPlots.length} spectrum plots and ${hidPlots.length} HID plots`,
  );

  // Set up zoom synchronization only between spectrum and HID
  [...spectrumPlots, ...hidPlots].forEach((plot) => {
    const linkedPlots =
      plot.classList.contains('spectrum') ||
      (plot.layout?.xaxis?.title?.text?.toLowerCase() || '').includes(
        'energy',
      ) ||
      (plot.layout?.xaxis?.title?.text?.toLowerCase() || '').includes('kev')
        ? hidPlots
        : spectrumPlots;
    setupSpectrumHIDZoomHandler(plot, linkedPlots);
  });
}

/**
 * Set up GTI-level click handler
 * @param {HTMLElement} plot - The plot element
 * @param {Array} spectralPlots - Array of spectral plots
 * @param {Array} lightCurvePlots - Array of light curve plots
 */
function setupGTIClickHandler(plot, spectralPlots, lightCurvePlots) {
  try {
    if (plot.getAttribute('data-gti-linking') === 'true') {
      console.log(`Plot ${plot.id} already has GTI linking handlers`);
      return;
    }

    console.log(`Setting up GTI-level click handler for plot ${plot.id}`);
    plot.setAttribute('data-gti-linking', 'true');

    const handleGTIClick = function (data) {
      if (!data || !data.points || data.points.length === 0) {
        console.log('GTI click detected but no points found');
        return;
      }

      console.log('GTI-level plot click detected:', data);

      // For GTI linking, we highlight entire plots rather than specific ranges
      const clickedGTI = determineGTIFromClick(data, plot);

      console.log(`GTI-level selection: ${clickedGTI || 'current dataset'}`);

      // Toggle GTI highlighting
      if (
        highlightState.active &&
        highlightState.currentLinkingType === 'gti' &&
        highlightState.selectedGTI === clickedGTI
      ) {
        // If clicking on the same GTI, turn off highlighting
        resetGTIHighlights([...spectralPlots, ...lightCurvePlots]);
      } else {
        // Highlight entire plots for this GTI
        highlightEntireGTI([...spectralPlots, ...lightCurvePlots], clickedGTI);
      }
    };

    if (typeof Plotly !== 'undefined' && typeof Plotly.on === 'function') {
      Plotly.on(plot, 'plotly_click', handleGTIClick);
      console.log('Set up GTI-level Plotly event handlers');
    }
  } catch (error) {
    console.error('Error setting up GTI click handler:', error);
  }
}

/**
 * Set up HID linking click handler
 * @param {HTMLElement} lightCurvePlot - The light curve plot element
 * @param {Array} hardnessPlots - Array of hardness plots to link with
 */
function setupHIDClickHandler(lightCurvePlot, hardnessPlots) {
  try {
    if (lightCurvePlot.getAttribute('data-hid-linking') === 'true') {
      console.log(`Plot ${lightCurvePlot.id} already has HID linking handlers`);
      return;
    }

    console.log(
      `Setting up HID linking click handler for plot ${lightCurvePlot.id}`,
    );
    lightCurvePlot.setAttribute('data-hid-linking', 'true');

    const handleHIDClick = function (data) {
      if (!data || !data.points || data.points.length === 0) {
        console.log('HID click detected but no points found');
        return;
      }

      console.log('HID linking plot click detected:', data);

      const point = data.points[0];
      const timeValue = point.x;

      // Define time window for HID correlation
      const timeWindow = calculateTimeWindow(lightCurvePlot, timeValue);

      console.log(
        `HID linking temporal region: [${timeWindow[0]}, ${timeWindow[1]}] s`,
      );

      // Toggle HID highlighting
      if (
        highlightState.active &&
        highlightState.currentLinkingType === 'hid' &&
        highlightState.selectedRange &&
        Math.abs(highlightState.selectedRange[0] - timeWindow[0]) < 0.01
      ) {
        // If clicking on the same region, turn off highlighting
        resetHIDHighlights([lightCurvePlot, ...hardnessPlots]);
      } else {
        // Highlight corresponding HID points
        highlightHIDRegion([lightCurvePlot, ...hardnessPlots], timeWindow);
      }
    };

    if (typeof Plotly !== 'undefined' && typeof Plotly.on === 'function') {
      Plotly.on(lightCurvePlot, 'plotly_click', handleHIDClick);
      console.log('Set up HID linking Plotly event handlers');
    }
  } catch (error) {
    console.error('Error setting up HID click handler:', error);
  }
}

/**
 * Set up spectrum-HID zoom handler
 * @param {HTMLElement} plot - The plot element
 * @param {Array} linkedPlots - Array of plots to sync zoom with
 */
function setupSpectrumHIDZoomHandler(plot, linkedPlots) {
  try {
    if (plot.getAttribute('data-spectrum-hid-zoom') === 'true') {
      console.log(`Plot ${plot.id} already has spectrum-HID zoom handlers`);
      return;
    }

    console.log(`Setting up spectrum-HID zoom handler for plot ${plot.id}`);
    plot.setAttribute('data-spectrum-hid-zoom', 'true');

    const handleZoom = function (eventData) {
      console.log('Zoom event detected for spectrum-HID linking:', eventData);

      // Synchronize zoom only between spectrum and HID plots
      synchronizeSpectrumHIDZoom(plot, linkedPlots, eventData);
    };

    if (typeof Plotly !== 'undefined' && typeof Plotly.on === 'function') {
      Plotly.on(plot, 'plotly_relayout', handleZoom);
      console.log('Set up spectrum-HID zoom handlers');
    }
  } catch (error) {
    console.error('Error setting up spectrum-HID zoom handler:', error);
  }
}

/**
 * Determine GTI from click data (placeholder - would need actual GTI metadata)
 * @param {Object} data - Click event data
 * @param {HTMLElement} plot - The plot element
 * @returns {string|null} GTI identifier
 */
function determineGTIFromClick(data, plot) {
  // This is a placeholder - in a real implementation, you would:
  // 1. Access GTI metadata associated with the plot
  // 2. Determine which GTI the clicked point belongs to
  // 3. Return the GTI identifier

  // For now, we'll use a simple approach based on plot type
  const plotType = plot.getAttribute('data-plot-type') || 'unknown';
  return `gti_${plotType}_current`;
}

/**
 * Highlight entire plots for GTI-level linking
 * @param {Array} plots - Array of plot elements
 * @param {string} gti - GTI identifier
 */
function highlightEntireGTI(plots, gti) {
  highlightState.active = true;
  highlightState.selectedGTI = gti;
  highlightState.currentLinkingType = 'gti';

  plots.forEach((plot) => {
    applyGTIHighlighting(plot);
    plot.classList.add('gti-linking-active');
    highlightState.linkedPlots.add(plot);
  });

  console.log(
    `GTI-level highlighting applied to ${plots.length} plots for GTI: ${gti}`,
  );
}

/**
 * Highlight HID region based on temporal selection
 * @param {Array} plots - Array of plot elements
 * @param {Array} timeWindow - Time window [min, max]
 */
function highlightHIDRegion(plots, timeWindow) {
  highlightState.active = true;
  highlightState.selectedRange = timeWindow;
  highlightState.currentLinkingType = 'hid';

  plots.forEach((plot) => {
    applyHIDHighlighting(plot, timeWindow);
    plot.classList.add('hid-linking-active');
    highlightState.linkedPlots.add(plot);
  });

  console.log(
    `HID linking highlighting applied to ${plots.length} plots for time window: [${timeWindow[0]}, ${timeWindow[1]}]`,
  );
}

/**
 * Apply GTI-level highlighting (entire plot highlight)
 * @param {HTMLElement} plot - The plot element
 */
function applyGTIHighlighting(plot) {
  try {
    if (!plot || !plot.data) return;

    // Store original state
    if (!highlightState.originalOpacities.has(plot)) {
      const originalState = new Map();
      plot.data.forEach((trace, i) => {
        originalState.set(i, {
          color: trace.marker?.color,
          opacity: trace.marker?.opacity || trace.opacity || 1,
          size: trace.marker?.size || 6,
        });
      });
      highlightState.originalOpacities.set(plot, originalState);
    }

    // Apply subtle highlighting to entire plot
    const updates = {};
    const traceIndices = [];

    plot.data.forEach((trace, i) => {
      if (!trace.x || !trace.y) return;

      traceIndices.push(i);

      // Apply consistent highlighting across entire plot
      if (trace.marker) {
        updates[`marker.line.color[${i}]`] = 'rgba(255, 215, 0, 0.8)'; // Gold border
        updates[`marker.line.width[${i}]`] = 2;
      }
    });

    if (traceIndices.length > 0) {
      Plotly.restyle(plot, updates, traceIndices);
    }
  } catch (error) {
    console.error('Error applying GTI highlighting:', error);
  }
}

/**
 * Apply HID highlighting based on temporal correlation
 * @param {HTMLElement} plot - The plot element
 * @param {Array} timeWindow - Time window [min, max]
 */
function applyHIDHighlighting(plot, timeWindow) {
  // Use the existing temporal highlighting logic
  applyTemporalHighlighting(plot, timeWindow);
}

/**
 * Synchronize zoom only between spectrum and HID plots
 * @param {HTMLElement} sourcePlot - The plot that was zoomed
 * @param {Array} linkedPlots - Array of spectrum or HID plots to synchronize with
 * @param {Object} eventData - Zoom event data
 */
function synchronizeSpectrumHIDZoom(sourcePlot, linkedPlots, eventData) {
  try {
    // Only synchronize if the event contains axis range changes
    if (
      !eventData ||
      (!eventData['xaxis.range'] && !eventData['yaxis.range'])
    ) {
      return;
    }

    console.log('Synchronizing zoom between spectrum and HID plots');

    const updates = {};
    if (eventData['xaxis.range']) {
      updates['xaxis.range'] = eventData['xaxis.range'];
    }
    if (eventData['yaxis.range']) {
      updates['yaxis.range'] = eventData['yaxis.range'];
    }

    // Apply zoom to linked spectrum or HID plots only
    linkedPlots.forEach((plot) => {
      if (plot !== sourcePlot) {
        Plotly.relayout(plot, updates);
      }
    });
  } catch (error) {
    console.error('Error synchronizing spectrum-HID zoom:', error);
  }
}

/**
 * Calculate appropriate time window around a clicked point
 * @param {HTMLElement} plot - The plot element
 * @param {number} timeValue - The clicked time value
 * @returns {Array} Time window [min, max]
 */
function calculateTimeWindow(plot, timeValue) {
  // Get the time range of the plot to determine appropriate window size
  if (plot.data && plot.data.length > 0) {
    const firstTrace = plot.data[0];
    if (firstTrace.x && firstTrace.x.length > 0) {
      const times = [...firstTrace.x].sort((a, b) => a - b);
      const totalTimeRange = times[times.length - 1] - times[0];

      // Use 2% of the total time range as the window, with min/max bounds
      const windowSize = Math.max(1, Math.min(10, totalTimeRange * 0.02));

      return [timeValue - windowSize / 2, timeValue + windowSize / 2];
    }
  }

  // Fallback: use 1 second window
  return [timeValue - 0.5, timeValue + 0.5];
}

/**
 * Highlight a temporal region across multiple temporal plots
 * @param {Array} plots - Array of plot elements to highlight
 * @param {Array} timeWindow - Time window [min, max] to highlight
 */
function highlightTemporalRegion(plots, timeWindow) {
  highlightState.active = true;
  highlightState.selectedRange = timeWindow;

  plots.forEach((plot) => {
    applyTemporalHighlighting(plot, timeWindow);
    plot.classList.add('temporal-linking-active');
    highlightState.linkedPlots.add(plot);
  });
}

/**
 * Apply temporal highlighting to a single plot
 * @param {HTMLElement} plot - The plot element
 * @param {Array} timeWindow - Time window [min, max] to highlight
 */
function applyTemporalHighlighting(plot, timeWindow) {
  try {
    if (!plot || !plot.data) return;

    const updates = {
      'marker.color': [],
      'marker.opacity': [],
      'marker.size': [],
    };
    const traceIndices = [];

    // Store original state if not stored yet
    if (!highlightState.originalOpacities.has(plot)) {
      const originalState = new Map();
      plot.data.forEach((trace, i) => {
        originalState.set(i, {
          color: trace.marker?.color,
          opacity: trace.marker?.opacity || trace.opacity || 1,
          size: trace.marker?.size || 6,
        });
      });
      highlightState.originalOpacities.set(plot, originalState);
    }

    // Build update arrays for Plotly.restyle
    plot.data.forEach((trace, i) => {
      if (!trace.x || !trace.y) return;

      const colors = [];
      const opacities = [];
      const sizes = [];

      // Calculate highlighting for time-based data
      const windowCenter = (timeWindow[0] + timeWindow[1]) / 2;
      const windowWidth = timeWindow[1] - timeWindow[0];

      for (let j = 0; j < trace.x.length; j++) {
        const time = trace.x[j];
        const distanceFromCenter = Math.abs(time - windowCenter);
        const normalizedDistance = distanceFromCenter / (windowWidth / 2);

        // Calculate opacity based on distance from center
        let opacity = Math.max(0.2, 1 - normalizedDistance);
        if (normalizedDistance <= 1) {
          opacity = Math.max(0.8, opacity); // Strong highlight within window
        }

        // Calculate size and color based on opacity
        const size = 6 + (opacity - 0.2) * 4;
        const color = `rgba(255, 140, 0, ${opacity})`; // Orange for temporal highlight

        colors.push(color);
        opacities.push(opacity);
        sizes.push(size);
      }

      if (colors.length > 0) {
        traceIndices.push(i);
        updates['marker.color'].push(colors);
        updates['marker.opacity'].push(opacities);
        updates['marker.size'].push(sizes);
      }
    });

    // Apply updates efficiently using Plotly.restyle
    if (traceIndices.length > 0) {
      for (const [prop, values] of Object.entries(updates)) {
        if (values.length === traceIndices.length) {
          Plotly.restyle(plot, { [prop]: values }, traceIndices);
        }
      }
    }
  } catch (error) {
    console.error('Error applying temporal highlighting:', error);
  }
}

/**
 * Reset highlights on all linked plots
 * @param {Array} plots - Array of plot elements to reset
 */
function resetAllHighlights(plots) {
  plots.forEach((plot) => {
    resetPlotHighlights(plot);
    plot.classList.remove('temporal-linking-active');
    highlightState.linkedPlots.delete(plot);
  });

  // Reset state
  highlightState.active = false;
  highlightState.selectedRange = null;

  console.log('All temporal highlights reset');
}

/**
 * Reset highlights on a single plot
 * @param {HTMLElement} plot - The plot element to reset
 */
function resetPlotHighlights(plot) {
  try {
    if (!plot || !plot.data) return;

    // Check if we have stored original state
    const originalState = highlightState.originalOpacities.get(plot);
    if (!originalState) return;

    // Apply original colors and opacities
    plot.data.forEach((trace, i) => {
      const original = originalState.get(i);
      if (original) {
        const update = {
          'marker.color': original.color,
          'marker.opacity': original.opacity,
          'marker.size': original.size,
        };

        Plotly.restyle(plot, update, [i]);
      }
    });
  } catch (error) {
    console.error(`Error resetting highlights for plot:`, error);
  }
}

/**
 * Reset GTI highlights
 * @param {Array} plots - Array of plot elements to reset
 */
function resetGTIHighlights(plots) {
  plots.forEach((plot) => {
    resetPlotHighlights(plot);
    plot.classList.remove('gti-linking-active');
    highlightState.linkedPlots.delete(plot);
  });

  highlightState.active = false;
  highlightState.selectedGTI = null;
  highlightState.currentLinkingType = null;

  console.log('GTI highlights reset');
}

/**
 * Reset HID highlights
 * @param {Array} plots - Array of plot elements to reset
 */
function resetHIDHighlights(plots) {
  plots.forEach((plot) => {
    resetPlotHighlights(plot);
    plot.classList.remove('hid-linking-active');
    highlightState.linkedPlots.delete(plot);
  });

  highlightState.active = false;
  highlightState.selectedRange = null;
  highlightState.currentLinkingType = null;

  console.log('HID highlights reset');
}

/**
 * Diagnostic function updated with new linking types
 */
export function diagnosePlotlyGraphs() {
  console.log('--- Diagnosing Plotly Graphs (Updated for Proper Linking) ---');

  const graphs = document.querySelectorAll('.js-plotly-plot');
  console.log(`Found ${graphs.length} Plotly graph elements`);

  const plotsByType = identifyPlotTypes(graphs);

  console.log('\n--- Plot Classification ---');
  Object.entries(plotsByType).forEach(([type, plots]) => {
    console.log(`${type}: ${plots.length} plots`);
    plots.forEach((plot, index) => {
      console.log(`  - Plot ${index + 1}: ID ${plot.id}`);
    });
  });

  console.log('\n--- Linking Status (Per Jack Steiner Feedback) ---');
  graphs.forEach((graph, index) => {
    console.log(`Graph #${index + 1} - ID: ${graph.id}`);
    console.log(
      `  GTI linking: ${
        graph.getAttribute('data-gti-linking') === 'true' ? 'Yes' : 'No'
      }`,
    );
    console.log(
      `  HID linking: ${
        graph.getAttribute('data-hid-linking') === 'true' ? 'Yes' : 'No'
      }`,
    );
    console.log(
      `  Spectrum-HID zoom: ${
        graph.getAttribute('data-spectrum-hid-zoom') === 'true' ? 'Yes' : 'No'
      }`,
    );
  });

  console.log('\n--- Current Highlight State ---');
  console.log(`Active: ${highlightState.active}`);
  console.log(`Linking type: ${highlightState.currentLinkingType}`);
  console.log(`Selected GTI: ${highlightState.selectedGTI}`);
  console.log(`Selected range: ${highlightState.selectedRange}`);
  console.log(`Linked plots: ${highlightState.linkedPlots.size}`);

  console.log('\n--- Linking Relationships ---');
  Object.entries(LINKING_RELATIONSHIPS).forEach(([key, relationship]) => {
    console.log(
      `${key}: ${relationship.description} (Level: ${relationship.linkingLevel})`,
    );
  });

  console.log('\n--- End Diagnosis ---');

  return `Diagnosis complete. Found ${graphs.length} Plotly graphs with proper scientific linking per Jack Steiner feedback.`;
}

// Make diagnosePlotlyGraphs available globally for console access
window.diagnosePlotlyGraphs = diagnosePlotlyGraphs;
