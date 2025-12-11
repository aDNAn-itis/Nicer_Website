/**
 * Implements GTI cross-linking between HID and other plot types
 * When a point is clicked in the HID, it highlights the corresponding GTI in other plots
 */

let gtiCrossLinkingEnabled = false;
let gtiHighlightedPoints = new Map(); // Store highlighted points by plot ID

/**
 * Initialize GTI cross-linking for HID plots
 */
export function initGTICrossLinking() {
  console.log(
    '[GTI Cross-Linking] Initializing GTI cross-linking for HID plots',
  );

  const hidPlots = document.querySelectorAll('[id*="hardness-intensity"]');

  if (hidPlots.length === 0) {
    console.log('[GTI Cross-Linking] No HID plots found');
    return;
  }

  hidPlots.forEach((hidPlot) => {
    // Check if already initialized
    if (hidPlot.getAttribute('data-gti-linking') === 'true') {
      console.log('[GTI Cross-Linking] Already initialized for', hidPlot.id);
      return;
    }

    // Extract obs_id from plot ID
    const obsId = hidPlot.id.match(/hardness-intensity-diagram-(\d+)/)?.[1];

    if (!obsId) {
      console.log(
        '[GTI Cross-Linking] Could not extract obs_id from',
        hidPlot.id,
      );
      return;
    }

    console.log(
      '[GTI Cross-Linking] Setting up for HID plot:',
      hidPlot.id,
      'ObsID:',
      obsId,
    );

    // Attach click handler
    hidPlot.on('plotly_click', function (data) {
      handleHIDClick(data, obsId);
    });

    // Mark as initialized
    hidPlot.setAttribute('data-gti-linking', 'true');
  });

  gtiCrossLinkingEnabled = true;
  console.log('[GTI Cross-Linking] Initialization complete');
}

/**
 * Handle clicks on HID plot points
 * @param {Object} data Plotly click event data
 * @param {string} obsId Observation ID
 */
function handleHIDClick(data, obsId) {
  if (!data.points || data.points.length === 0) {
    return;
  }

  const point = data.points[0];

  // Extract GTI number from point customdata or text
  let gtiNumber = null;

  if (point.customdata && point.customdata.gti !== undefined) {
    gtiNumber = point.customdata.gti;
  } else if (point.text) {
    // Try to extract GTI from text like "GTI 0" or "GTI0"
    const gtiMatch = point.text.match(/GTI\s*(\d+)/i);
    if (gtiMatch) {
      gtiNumber = parseInt(gtiMatch[1]);
    }
  }

  if (gtiNumber === null) {
    console.log(
      '[GTI Cross-Linking] Could not determine GTI number from clicked point',
    );
    return;
  }

  console.log(
    `[GTI Cross-Linking] Clicked GTI ${gtiNumber} in HID for obs ${obsId}`,
  );

  // Highlight this GTI in all other plots
  highlightGTIInPlots(gtiNumber, obsId);
}

/**
 * Highlight a specific GTI in all plots for an observation
 * @param {number} gtiNumber GTI number to highlight
 * @param {string} obsId Observation ID
 */
function highlightGTIInPlots(gtiNumber, obsId) {
  console.log(
    `[GTI Cross-Linking] Highlighting GTI ${gtiNumber} for obs ${obsId}`,
  );

  // Find all plots for this observation
  const plotSelectors = [
    `#light-curve-${obsId}`,
    `#spectrum-${obsId}`,
    `#power-density-spectrum-${obsId}`,
  ];

  plotSelectors.forEach((selector) => {
    const plot = document.querySelector(selector);
    if (!plot) return;

    console.log(
      `[GTI Cross-Linking] Highlighting GTI ${gtiNumber} in ${selector}`,
    );

    // Get plot data
    const plotData = plot.data;
    if (!plotData) return;

    // Find traces that match this GTI
    plotData.forEach((trace, traceIndex) => {
      if (!trace.customdata) return;

      // Find points that belong to this GTI
      const pointsToHighlight = [];
      trace.customdata.forEach((data, pointIndex) => {
        if (data && data.gti === gtiNumber) {
          pointsToHighlight.push(pointIndex);
        }
      });

      if (pointsToHighlight.length > 0) {
        // Highlight these points by updating marker properties
        const update = {
          'marker.size': Array(trace.x.length).fill(6),
          'marker.opacity': Array(trace.x.length).fill(0.3),
        };

        // Make selected GTI points larger and more opaque
        pointsToHighlight.forEach((idx) => {
          update['marker.size'][idx] = 12;
          update['marker.opacity'][idx] = 1.0;
        });

        Plotly.restyle(plot, update, traceIndex);

        console.log(
          `[GTI Cross-Linking] Highlighted ${pointsToHighlight.length} points in trace ${traceIndex}`,
        );
      }
    });
  });

  // Also update the GTI info table to highlight this GTI
  highlightGTIInTable(gtiNumber, obsId);
}

/**
 * Highlight a GTI row in the observation info table
 * @param {number} gtiNumber GTI number to highlight
 * @param {string} obsId Observation ID
 */
function highlightGTIInTable(gtiNumber, obsId) {
  // Find the GTI table for this observation
  const gtiRows = document.querySelectorAll(
    `tr[data-gti="GTI${gtiNumber}"][data-obs-id="${obsId}"]`,
  );

  if (gtiRows.length === 0) {
    console.log(
      `[GTI Cross-Linking] GTI row not found for GTI${gtiNumber}, obs ${obsId}`,
    );
    return;
  }

  // Remove previous highlights
  document.querySelectorAll('.gti-row-highlighted').forEach((row) => {
    row.classList.remove('gti-row-highlighted');
  });

  // Highlight the selected GTI row
  gtiRows.forEach((row) => {
    row.classList.add('gti-row-highlighted');
    // Scroll into view
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  console.log(`[GTI Cross-Linking] Highlighted GTI${gtiNumber} in table`);
}

/**
 * Clear all GTI highlighting
 */
export function clearGTIHighlighting() {
  console.log('[GTI Cross-Linking] Clearing all GTI highlighting');

  // Reset all plot markers to default
  const allPlots = document.querySelectorAll('.js-plotly-plot');
  allPlots.forEach((plot) => {
    if (!plot.data) return;

    plot.data.forEach((trace, traceIndex) => {
      const update = {
        'marker.size': 6,
        'marker.opacity': 0.7,
      };

      Plotly.restyle(plot, update, traceIndex);
    });
  });

  // Remove table highlights
  document.querySelectorAll('.gti-row-highlighted').forEach((row) => {
    row.classList.remove('gti-row-highlighted');
  });

  gtiHighlightedPoints.clear();
}

/**
 * Enable/disable GTI cross-linking
 * @param {boolean} enabled Whether to enable cross-linking
 */
export function setGTICrossLinking(enabled) {
  gtiCrossLinkingEnabled = enabled;

  if (!enabled) {
    clearGTIHighlighting();
  }

  console.log(
    `[GTI Cross-Linking] Cross-linking ${enabled ? 'enabled' : 'disabled'}`,
  );
}
