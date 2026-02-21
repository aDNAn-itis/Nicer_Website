/**
 * Synchronized selection functionality for plotly graphs
 * This module enables synchronized region selection across different plot types
 * (light curve, spectrum, etc.) so when a user selects a region on one graph,
 * the same time region is automatically selected on other graphs.
 * * MODIFIED: Triple-Check Filter to exclude Global HID.
 */

/**
 * Mapping of plot types to their x-axis units
 * This helps with conversion between different unit types when synchronizing selections
 */
const PLOT_UNIT_TYPES = {
  'light-curve': 'time', // x-axis is time (seconds)
  spectrum: 'energy', // x-axis is energy (keV)
  'summed-spectrum': 'energy', // x-axis is energy (keV)
  'power-density-spectrum': 'frequency', // x-axis is frequency (Hz)
  'hardness-intensity-diagram': 'hardness', // x-axis is hardness ratio
};

// Store global state of active selections
const selectionState = {
  activeSelection: null,
  sourceType: null,
  inProgress: false, // Flag to prevent infinite loops
  preserveHighlights: true, // Flag to indicate if highlighting should be preserved during zoom
  selectedGTI: null, // Track the currently selected GTI
};

/**
 * Add CSS styles for synchronized selection
 */
function addSyncSelectionStyles() {
  if (document.getElementById('sync-selection-styles')) return;

  const styles = `
    .sync-selection-active {
      border: 2px solid rgba(65, 135, 245, 0.6);
      position: relative;
    }
    
    .sync-selection-active::before {
      content: "Synchronized Selection Active";
      position: absolute;
      top: 10px;
      right: 10px;
      background-color: rgba(65, 135, 245, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      z-index: 100;
      pointer-events: none;
    }
    
    .sync-selection-source {
      border: 2px solid rgba(65, 245, 135, 0.6);
    }
    
    .sync-selection-source::before {
      content: "Selection Source";
      background-color: rgba(65, 245, 135, 0.8);
    }
  `;

  const styleElement = document.createElement('style');
  styleElement.id = 'sync-selection-styles';
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

/**
 * Initialize synchronized selection for all plotly graphs
 * This should be called after plots are loaded
 */
export function initSynchronizedSelection() {
  // Add CSS styles for visual indicators
  addSyncSelectionStyles();

  // Find all plotly graphs on the page
  const allGraphs = document.querySelectorAll('.js-plotly-plot');

  // 🔴 TRIPLE-CHECK FILTER: Ignore Global HID
  const plotlyGraphs = Array.from(allGraphs).filter((plot) => {
    // 1. Check Title (Most Reliable)
    const layoutTitle = plot.layout?.title;
    const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();
    
    if (titleText.includes('global hid') || titleText.includes('multi-observation')) {
      console.log(`🛡️ SyncSelection: Ignoring Global HID (Title Match)`);
      return false;
    }

    // 2. Check Parent Container ID (Walk up the DOM)
    let parent = plot.parentElement;
    while (parent) {
      if (
        parent.id === 'combined-hid-plot' ||
        parent.id === 'global-safe-container' ||
        parent.id === 'global-hid-section'
      ) {
        console.log(`🛡️ SyncSelection: Ignoring Global HID (Container Match)`);
        return false;
      }
      parent = parent.parentElement;
      if (parent === document.body) break; // Stop at body
    }

    // 3. Check Axis Label (Context)
    const xaxis = plot.layout?.xaxis?.title?.text || '';
    if (xaxis.toLowerCase().includes('hardness')) {
       return false;
    }

    return true; // Safe to link
  });

  // No graphs found, exit early
  if (!plotlyGraphs.length) {
    console.log('No eligible plots found for synchronization (Global HID excluded)');
    return;
  }

  console.log(`Found ${plotlyGraphs.length} eligible Plotly graphs to synchronize`);

  // Check if we have both light curve and spectrum
  let hasLightCurve = false;
  let hasSpectrum = false;

  plotlyGraphs.forEach((graph) => {
    const plotType = getPlotTypeFromId(graph.id);
    if (plotType === 'light-curve') hasLightCurve = true;
    if (plotType === 'spectrum') hasSpectrum = true;
  });

  if (hasLightCurve && hasSpectrum) {
    console.log(
      'Both light curve and spectrum plots found - synchronization will be enabled',
    );
  } else {
    console.log(
      'Missing either light curve or spectrum plot - synchronization may be limited',
    );
  }

  // Set up listeners for all graphs
  plotlyGraphs.forEach((graph) => {
    // First ensure the graph is fully initialized by Plotly
    if (!graph.layout) {
      console.warn(`Graph ${graph.id} is not fully initialized by Plotly yet`);
    }

    // Set up the relayout listener
    setupRelayoutListener(graph);

    // Set up click listener for GTI selection
    //setupGTIClickListener(graph);
  });

  console.log(
    `Initialized synchronized selection for ${plotlyGraphs.length} graphs`,
  );

  // Force a check for any existing selections that need to be applied
  updateAllSelections();
}

/**
 * Set up event listeners for plotly graph relayout events
 * @param {HTMLElement} graphElement - The DOM element containing the plotly graph
 */
function setupRelayoutListener(graphElement) {
  if (!graphElement || !graphElement.id) return;

  try {
    const plotId = graphElement.id;
    const plotType = getPlotTypeFromId(plotId);

    // We need to use the DOM element's data property to access the Plotly instance
    const gd = graphElement;

    console.log(`Setting up relayout listener for ${plotId} (${plotType})`);

    // Remove any existing event handlers to prevent duplicates
    gd.removeAllListeners('plotly_relayout');

    // We'll use Plotly's relayout event which happens after zooming, panning, or selecting
    gd.on('plotly_relayout', function (eventData) {
      // Skip if this event is part of our own propagation to prevent infinite loops
      if (selectionState.inProgress) return;

      console.log(`Relayout event on ${plotId}:`, eventData);

      // We're only interested in xaxis range changes
      if (!eventData) return;

      // Get the range that was selected
      let xRange;

      // Handle different formats of the range data
      if (eventData['xaxis.range']) {
        xRange = eventData['xaxis.range'];
      } else if (
        eventData['xaxis.range[0]'] !== undefined &&
        eventData['xaxis.range[1]'] !== undefined
      ) {
        xRange = [eventData['xaxis.range[0]'], eventData['xaxis.range[1]']];
      } else {
        // Check for autorange (reset zoom)
        if (eventData['xaxis.autorange'] === true) {
          console.log(`Reset zoom on ${plotType}`);
          selectionState.activeSelection = null;
          selectionState.sourceType = null;
          clearAllSelections();
        }
        return; // No range information
      }

      console.log(`Range change on ${plotType}:`, xRange);

      // Store the selection
      selectionState.activeSelection = { x: xRange };
      selectionState.sourceType = plotType;

      // Propagate to other graphs
      propagateSelection(xRange, plotType);
    });

    // Also listen for reset zoom via double-click
    gd.on('plotly_doubleclick', function () {
      if (selectionState.inProgress) return;

      console.log(`Double-click (reset) on ${plotType}`);
      selectionState.activeSelection = null;
      selectionState.sourceType = null;
      clearAllSelections();
    });

    console.log(`Successfully set up relayout listener for ${plotId}`);
  } catch (error) {
    console.error(
      `Error setting up relayout listener for ${graphElement.id}:`,
      error,
    );
  }
}

/**
 * Set up click listener for GTI selection in plotly graphs
 * @param {HTMLElement} graphElement - The DOM element containing the plotly graph
 */
function setupGTIClickListener(graphElement) {
  if (!graphElement || !graphElement.id) return;

  try {
    const plotId = graphElement.id;
    const plotType = getPlotTypeFromId(plotId);
    const gd = graphElement;

    console.log(`Setting up GTI click listener for ${plotId} (${plotType})`);

    // Remove any existing event handlers to prevent duplicates
    gd.removeAllListeners('plotly_click');

    // Listen for clicks on the plot
    gd.on('plotly_click', function (data) {
      if (selectionState.inProgress) return;

      const point = data.points[0];
      if (!point) return;

      // Get the GTI number from the trace name
      const gtiMatch = point.data.name.match(/GTI(\d+)/);
      if (!gtiMatch) return;

      const gtiNumber = parseInt(gtiMatch[1]);
      console.log(`GTI ${gtiNumber} clicked on ${plotType}`);

      // Update selection state
      selectionState.selectedGTI = gtiNumber;
      selectionState.sourceType = plotType;

      // Propagate GTI selection to all graphs
      propagateGTISelection(gtiNumber, plotType);
    });

    console.log(`Successfully set up GTI click listener for ${plotId}`);
  } catch (error) {
    console.error(
      `Error setting up GTI click listener for ${graphElement.id}:`,
      error,
    );
  }
}

/**
 * Extract the plot type from the plot element ID
 * @param {string} plotId - ID of the plot element
 * @returns {string} The plot type (light-curve, spectrum, etc.)
 */
function getPlotTypeFromId(plotId) {
  if (!plotId) return null;
  // Plot IDs are typically like "spectrum-obsid", "light-curve-obsid",
  // or "combined-spectrum-obsid".
  // We want to extract the "spectrum", "light-curve" part.
  for (const type of Object.keys(PLOT_UNIT_TYPES)) {
    if (plotId.startsWith(type)) {
      // e.g., plotId "spectrum-obs1" starts with "spectrum"
      return type;
    }
    if (plotId.startsWith(`combined-${type}`)) {
      // e.g., plotId "combined-spectrum-obs1"
      return type;
    }
  }
  // Fallback for IDs that might not contain a known plot type at the start,
  // or have a different structure.
  // This attempts to grab the first part if it's a simple 'type-id' structure.
  const parts = plotId.split('-');
  if (parts.length > 0 && PLOT_UNIT_TYPES[parts[0]]) {
    return parts[0];
  }
  if (
    parts.length > 1 &&
    parts[0] === 'combined' &&
    PLOT_UNIT_TYPES[parts[1]]
  ) {
    return parts[1];
  }

  console.warn(
    `Could not reliably determine plot type from ID: ${plotId}. Full ID will be used.`,
  );
  // Return the part before the first hyphen if it's a generic name, or the full id.
  return parts[0] || plotId;
}

/**
 * Apply visual indicators to show which graphs have synchronized selection
 * @param {string} sourceType - The plot type that originated the selection
 */
function updateSelectionIndicators(sourceType) {
  // First, remove all existing indicators
  document
    .querySelectorAll('.sync-selection-active, .sync-selection-source')
    .forEach((el) => {
      el.classList.remove('sync-selection-active', 'sync-selection-source');
    });

  // If no active selection, exit early
  if (!selectionState.activeSelection) return;

  // Find all plotly graph containers
  const allGraphs = document.querySelectorAll('.js-plotly-plot');

  // 🔴 TRIPLE-CHECK FILTER: Apply to Indicators
  const plotlyGraphContainers = Array.from(allGraphs).filter((plot) => {
    // 1. Check Title
    const layoutTitle = plot.layout?.title;
    const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();
    if (titleText.includes('global hid') || titleText.includes('multi-observation')) return false;

    // 2. Check Container
    let parent = plot.parentElement;
    while (parent) {
      if (
        parent.id === 'combined-hid-plot' ||
        parent.id === 'global-safe-container' ||
        parent.id === 'global-hid-section'
      ) {
        return false;
      }
      parent = parent.parentElement;
      if (parent === document.body) break; // Stop at body
    }

    return true;
  });

  // Add indicators to all filtered graphs
  plotlyGraphContainers.forEach((graphContainer) => {
    if (!graphContainer) return;

    const plotType = getPlotTypeFromId(graphContainer.id);
    if (!plotType) return;

    // Add source indicator to the source graph
    if (plotType === sourceType) {
      graphContainer.classList.add('sync-selection-source');
    }
    // Add active indicator to all other graphs
    else {
      graphContainer.classList.add('sync-selection-active');
    }
  });
}

/**
 * Propagate a selection from one graph to all other graphs
 * @param {Array} xRange - The x-axis range [min, max]
 * @param {string} sourceType - The plot type that originated the selection
 */
function propagateSelection(xRange, sourceType) {
  // Set flag to prevent infinite loops
  selectionState.inProgress = true;

  try {
    console.log(`Propagating selection from ${sourceType} with range:`, xRange);

    const allGraphs = document.querySelectorAll('.js-plotly-plot');

    // 🔴 TRIPLE-CHECK FILTER: Apply to Propagation
    const plotlyGraphs = Array.from(allGraphs).filter((plot) => {
        const layoutTitle = plot.layout?.title;
        const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();
        if (titleText.includes('global hid') || titleText.includes('multi-observation')) return false;

        let parent = plot.parentElement;
        while (parent) {
          if (parent.id === 'combined-hid-plot' || parent.id === 'global-safe-container' || parent.id === 'global-hid-section') return false;
          parent = parent.parentElement;
          if (parent === document.body) break;
        }
        return true;
    });

    if (plotlyGraphs.length <= 1) {
      console.log('Only one eligible plot found, nothing to propagate to');
      return;
    }

    // Apply to each graph
    plotlyGraphs.forEach((graph) => {
      const targetId = graph.id;
      const targetType = getPlotTypeFromId(targetId);

      // Skip the source graph (which already has the selection)
      if (targetType === sourceType && !targetId.includes('combined-')) {
        console.log(`Skipping source graph ${targetId}`);
        return;
      }

      console.log(`Applying zoom to ${targetId} (${targetType})`);

      // Apply the selection to this graph
      if (sourceType === 'light-curve' && targetType === 'spectrum') {
        // Special handling for light-curve to spectrum sync
        console.log(
          `Light curve to spectrum sync from ${xRange[0]} to ${xRange[1]}`,
        );
        applyZoomToGraph(graph, xRange);
      } else if (sourceType === 'spectrum' && targetType === 'light-curve') {
        // Special handling for spectrum to light-curve sync
        console.log(
          `Spectrum to light curve sync from ${xRange[0]} to ${xRange[1]}`,
        );
        applyZoomToGraph(graph, xRange);
      } else {
        // Default handling for other combinations
        applyZoomToGraph(graph, xRange);
      }
    });

    // Update visual indicators
    updateSelectionIndicators(sourceType);
  } catch (error) {
    console.error('Error during propagateSelection:', error);
  } finally {
    // Reset flag after a short delay
    setTimeout(() => {
      selectionState.inProgress = false;
    }, 100);
  }
}

/**
 * Apply a zoom level to a specific graph
 * @param {HTMLElement} graphElement - The graph element to apply selection to
 * @param {Array} xRange - The x range to apply [min, max]
 */
function applyZoomToGraph(graphElement, xRange) {
  if (!graphElement) {
    console.error('Invalid graph element');
    return;
  }

  try {
    console.log(
      `Applying zoom to graph ${graphElement.id}: [${xRange[0]}, ${xRange[1]}]`,
    );

    // Ensure we have valid numeric values
    const min = parseFloat(xRange[0]);
    const max = parseFloat(xRange[1]);

    if (isNaN(min) || isNaN(max)) {
      console.error('Invalid range values:', xRange);
      return;
    }

    // Check if there are highlighted traces we need to preserve
    const hasHighlightedTraces =
      graphElement.data &&
      graphElement.data.some(
        (trace) => trace.name && trace.name.includes('Highlighted'),
      );

    // Store the current data if we have highlights and want to preserve them
    let currentData = null;
    if (hasHighlightedTraces && selectionState.preserveHighlights) {
      console.log(`Preserving highlights during zoom on ${graphElement.id}`);
      currentData = JSON.parse(JSON.stringify(graphElement.data));
    }

    // Apply the zoom level using direct layout approach
    const update = {
      'xaxis.range': [min, max],
      'xaxis.autorange': false,
    };

    console.log(`Relayout update for ${graphElement.id}:`, update);

    // Apply the zoom
    try {
      // First attempt using relayout
      Plotly.relayout(graphElement, update);

      // Restore highlighted traces if needed
      if (currentData && selectionState.preserveHighlights) {
        // Wait for the relayout to complete
        setTimeout(() => {
          console.log(`Restoring highlights for ${graphElement.id}`);
          Plotly.react(graphElement, currentData, graphElement.layout);
        }, 50);
      }
    } catch (error) {
      console.warn(
        `Initial relayout failed for ${graphElement.id}, trying alternative method:`,
        error,
      );

      try {
        // Alternative method by directly updating the layout
        graphElement.layout.xaxis.range = [min, max];
        graphElement.layout.xaxis.autorange = false;
        Plotly.redraw(graphElement);

        // Restore highlighted traces if needed
        if (currentData && selectionState.preserveHighlights) {
          setTimeout(() => {
            console.log(
              `Restoring highlights for ${graphElement.id} (alt method)`,
            );
            Plotly.react(graphElement, currentData, graphElement.layout);
          }, 50);
        }
      } catch (innerError) {
        console.error(
          `All zoom methods failed for ${graphElement.id}:`,
          innerError,
        );
      }
    }
  } catch (error) {
    console.error(`Error applying zoom to ${graphElement.id}:`, error);
  }
}

/**
 * Propagate GTI selection to all graphs
 * @param {number} gtiNumber - The selected GTI number
 * @param {string} sourceType - The plot type that originated the selection
 */
function propagateGTISelection(gtiNumber, sourceType) {
  if (selectionState.inProgress) return;
  selectionState.inProgress = true;

  try {
    const allGraphs = document.querySelectorAll('.js-plotly-plot');

    // 🔴 TRIPLE-CHECK FILTER: Apply to GTI
    const plotlyGraphs = Array.from(allGraphs).filter((plot) => {
        const layoutTitle = plot.layout?.title;
        const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();
        if (titleText.includes('global hid') || titleText.includes('multi-observation')) return false;

        let parent = plot.parentElement;
        while (parent) {
          if (parent.id === 'combined-hid-plot' || parent.id === 'global-safe-container' || parent.id === 'global-hid-section') return false;
          parent = parent.parentElement;
          if (parent === document.body) break;
        }
        return true;
    });

    const dimmedBaseColor = 'rgb(0,0,0)'; // Black for dimmed GTIs
    const baseDimmedOpacity = 0.2;
    const opacityStepPerGTI = 0.03;
    const minDimmedOpacity = 0.05;

    plotlyGraphs.forEach((graph) => {
      const plotType = getPlotTypeFromId(graph.id);
      if (!plotType) return;

      const gd = graph;
      const update = {
        opacity: [],
        'marker.opacity': [],
        'line.color': [],
        'marker.color': [],
      };

      gd.data.forEach((trace) => {
        const traceGTIMatch = trace.name ? trace.name.match(/GTI(\d+)/) : null;
        const traceGTI = traceGTIMatch ? parseInt(traceGTIMatch[1]) : null;
        const isSelectedGTI = traceGTI === gtiNumber;

        // Store original colors if not already stored
        if (trace.line && !trace._originalLineColor) {
          trace._originalLineColor = trace.line.color;
        }
        if (trace.marker && !trace._originalMarkerColor) {
          trace._originalMarkerColor = trace.marker.color;
        }
        // Store original opacity if not already stored (for BG traces mostly)
        if (
          typeof trace.opacity !== 'undefined' &&
          typeof trace._originalOpacity === 'undefined'
        ) {
          trace._originalOpacity = trace.opacity;
        }
        if (
          trace.marker &&
          typeof trace.marker.opacity !== 'undefined' &&
          typeof trace._originalMarkerOpacity === 'undefined'
        ) {
          trace._originalMarkerOpacity = trace.marker.opacity;
        }

        if (isSelectedGTI) {
          update['opacity'].push(
            trace._originalOpacity !== undefined ? trace._originalOpacity : 1.0,
          );
          update['marker.opacity'].push(
            trace._originalMarkerOpacity !== undefined
              ? trace._originalMarkerOpacity
              : 1.0,
          );
          update['line.color'].push(
            trace._originalLineColor || trace.line?.color,
          );
          update['marker.color'].push(
            trace._originalMarkerColor || trace.marker?.color,
          );
        } else {
          let currentDimmedOpacity = baseDimmedOpacity;
          if (traceGTI !== null) {
            // Apply step-down opacity only if it's a numbered GTI
            currentDimmedOpacity = Math.max(
              minDimmedOpacity,
              baseDimmedOpacity - traceGTI * opacityStepPerGTI,
            );
          }

          update['opacity'].push(currentDimmedOpacity);
          update['marker.opacity'].push(currentDimmedOpacity);
          update['line.color'].push(dimmedBaseColor);
          update['marker.color'].push(dimmedBaseColor); // Marker color also black, opacity controlled by marker.opacity
        }
      });
      Plotly.restyle(gd, update);
    });
    updateSelectionIndicators(sourceType);
  } catch (error) {
    console.error('Error propagating GTI selection:', error);
  } finally {
    selectionState.inProgress = false;
  }
}

/**
 * Clear GTI selection from all graphs
 */
function clearGTISelection() {
  if (selectionState.inProgress) return;
  selectionState.inProgress = true;

  try {
    const allGraphs = document.querySelectorAll('.js-plotly-plot');

    // 🔴 TRIPLE-CHECK FILTER: Apply to Clear GTI
    const plotlyGraphs = Array.from(allGraphs).filter((plot) => {
      const layoutTitle = plot.layout?.title;
      const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();
      if (titleText.includes('global hid') || titleText.includes('multi-observation')) return false;

      let parent = plot.parentElement;
      while (parent) {
        if (parent.id === 'combined-hid-plot' || parent.id === 'global-safe-container' || parent.id === 'global-hid-section') return false;
        parent = parent.parentElement;
        if (parent === document.body) break;
      }
      return true;
    });

    plotlyGraphs.forEach((graph) => {
      const gd = graph;
      const update = {
        opacity: [],
        'marker.opacity': [],
        'line.color': [],
        'marker.color': [],
      };

      gd.data.forEach((trace) => {
        // Restore original opacities if stored, otherwise default
        const originalOpacity =
          trace._originalOpacity !== undefined ? trace._originalOpacity : 1.0;
        const originalMarkerOpacity =
          trace._originalMarkerOpacity !== undefined
            ? trace._originalMarkerOpacity
            : 1.0;

        update['opacity'].push(originalOpacity);
        update['marker.opacity'].push(originalMarkerOpacity);
        update['line.color'].push(
          trace._originalLineColor || trace.line?.color,
        );
        update['marker.color'].push(
          trace._originalMarkerColor || trace.marker?.color,
        );

        // Clean up stored original properties
        delete trace._originalLineColor;
        delete trace._originalMarkerColor;
        delete trace._originalOpacity;
        delete trace._originalMarkerOpacity;
      });
      Plotly.restyle(gd, update);
    });

    selectionState.selectedGTI = null;
    selectionState.sourceType = null;
    document
      .querySelectorAll('.sync-selection-active, .sync-selection-source')
      .forEach((el) => {
        el.classList.remove('sync-selection-active', 'sync-selection-source');
      });
  } catch (error) {
    console.error('Error clearing GTI selection:', error);
  } finally {
    selectionState.inProgress = false;
  }
}

/**
 * Clear all selections from all graphs
 */
function clearAllSelections() {
  clearGTISelection();
  // Set flag to prevent infinite loops
  selectionState.inProgress = true;

  try {
    const allGraphs = document.querySelectorAll('.js-plotly-plot');

    // 🔴 TRIPLE-CHECK FILTER: Apply to Clear All
    const plotlyGraphs = Array.from(allGraphs).filter((plot) => {
      const layoutTitle = plot.layout?.title;
      const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();
      if (titleText.includes('global hid') || titleText.includes('multi-observation')) return false;

      let parent = plot.parentElement;
      while (parent) {
        if (parent.id === 'combined-hid-plot' || parent.id === 'global-safe-container' || parent.id === 'global-hid-section') return false;
        parent = parent.parentElement;
        if (parent === document.body) break;
      }
      return true;
    });

    plotlyGraphs.forEach((graph) => {
      try {
        // Check if there are highlighted traces
        const hasHighlightedTraces =
          graph.data &&
          graph.data.some(
            (trace) => trace.name && trace.name.includes('Highlighted'),
          );

        // We'll only reset zoom, not clear highlighting
        // This allows our interactive linking feature to work independently
        Plotly.relayout(graph, {
          'xaxis.autorange': true,
          'yaxis.autorange': true,
        });
      } catch (error) {
        console.error(`Error clearing selection from ${graph.id}:`, error);
      }
    });

    // Remove all selection indicators
    document
      .querySelectorAll('.sync-selection-active, .sync-selection-source')
      .forEach((el) => {
        el.classList.remove('sync-selection-active', 'sync-selection-source');
      });
  } finally {
    // Reset flag
    setTimeout(() => {
      selectionState.inProgress = false;
    }, 100);
  }
}

/**
 * Update all selections based on the current selection state
 * Call this when new plots are added to the page
 */
export function updateAllSelections() {
  if (selectionState.activeSelection && selectionState.sourceType) {
    propagateSelection(
      selectionState.activeSelection.x,
      selectionState.sourceType,
    );
  }
}