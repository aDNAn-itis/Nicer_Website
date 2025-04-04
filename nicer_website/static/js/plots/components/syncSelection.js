/**
 * Synchronized selection functionality for plotly graphs
 * This module enables synchronized region selection across different plot types
 * (light curve, spectrum, etc.) so when a user selects a region on one graph,
 * the same time region is automatically selected on other graphs
 */

/**
 * Mapping of plot types to their x-axis units
 * This helps with conversion between different unit types when synchronizing selections
 */
const PLOT_UNIT_TYPES = {
  'light-curve': 'time', // x-axis is time (seconds)
  spectrum: 'energy', // x-axis is energy (keV)
  'power-density-spectrum': 'frequency', // x-axis is frequency (Hz)
  'hardness-intensity-diagram': 'hardness', // x-axis is hardness ratio
};

// Store global state of active selections
const selectionState = {
  activeSelection: null,
  sourceType: null,
  inProgress: false, // Flag to prevent infinite loops
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
  const plotlyGraphs = document.querySelectorAll('.js-plotly-plot');

  // No graphs found, exit early
  if (!plotlyGraphs.length) {
    console.log('No plots found to initialize');
    return;
  }

  console.log(`Found ${plotlyGraphs.length} Plotly graphs to initialize`);

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
 * Extract the plot type from the plot element ID
 * @param {string} plotId - ID of the plot element
 * @returns {string} The plot type (light-curve, spectrum, etc.)
 */
function getPlotTypeFromId(plotId) {
  // Handle different ID formats (regular plots and combined plots)
  const match = plotId.match(/^(?:combined-)?([\w-]+)(?:-\d+)?$/);
  return match ? match[1] : null;
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
  const plotlyGraphContainers = document.querySelectorAll('.js-plotly-plot');

  // Add indicators to all graphs
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

    // Find all plotly graphs
    const plotlyGraphs = document.querySelectorAll('.js-plotly-plot');

    if (plotlyGraphs.length <= 1) {
      console.log('Only one plot found, nothing to propagate to');
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

    // Apply the zoom level using direct layout approach
    const update = {
      'xaxis.range': [min, max],
      'xaxis.autorange': false,
    };

    console.log(`Relayout update for ${graphElement.id}:`, update);

    // Try multiple approaches to ensure it works
    try {
      // First attempt using relayout
      Plotly.relayout(graphElement, update);
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
 * Clear selections from all graphs
 */
function clearAllSelections() {
  // Set flag to prevent infinite loops
  selectionState.inProgress = true;

  try {
    const plotlyGraphs = document.querySelectorAll('.js-plotly-plot');

    plotlyGraphs.forEach((graph) => {
      try {
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
