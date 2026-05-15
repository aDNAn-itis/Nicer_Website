/**
 * interactiveLinking.js
 * Enables interactive linking between Spectrum and Light Curve plots.
 * * MODIFIED: Aggressively excludes Global HID from linking logic.
 */

// Store state for highlighted points
const highlightState = {
  active: false,
  selectedRange: null,
  originalOpacities: new Map(), // Store original opacities to restore them
};

// Replace the ENERGY_BANDS constant with a continuous correlation function
const ENERGY_TIME_CORRELATION = {
  // Base correlation parameters
  baseSlope: 0.5, // How much energy increases with time
  baseOffset: 0.3, // Minimum energy at t=0
  correlationWidth: 0.2, // Width of the correlation window

  // Calculate the expected energy for a given time
  getExpectedEnergy: function (time, totalTime) {
    const normalizedTime = time / totalTime;
    return this.baseOffset + this.baseSlope * normalizedTime;
  },

  // Calculate the correlation strength between energy and time
  getCorrelationStrength: function (energy, time, totalTime) {
    const expectedEnergy = this.getExpectedEnergy(time, totalTime);
    const energyDiff = Math.abs(energy - expectedEnergy);
    return Math.max(0, 1 - energyDiff / this.correlationWidth);
  },

  // Calculate the expected time for a given energy
  getExpectedTime: function (energy) {
    return (energy - this.baseOffset) / this.baseSlope;
  },

  // Calculate the correlation strength between time and energy
  getCorrelationStrength: function (time, expectedTime, timeWidth) {
    const timeDiff = Math.abs(time - expectedTime);
    return Math.max(0, 1 - timeDiff / (timeWidth * this.correlationWidth));
  },
};

// Function to convert energy value to time window using continuous interpolation
function mapEnergyToTimePercentile(energy) {
  // Handle edge cases
  if (energy <= ENERGY_TIME_CORRELATION.baseOffset) return [0, 0.2];
  if (
    energy >=
    ENERGY_TIME_CORRELATION.baseOffset + ENERGY_TIME_CORRELATION.baseSlope
  )
    return [0.8, 1];

  // Calculate normalized time
  const normalizedTime =
    (energy - ENERGY_TIME_CORRELATION.baseOffset) /
    ENERGY_TIME_CORRELATION.baseSlope;
  const percentileWidth = 0.2; // Width of the percentile range
  return [
    Math.max(0, normalizedTime - percentileWidth / 2),
    Math.min(1, normalizedTime + percentileWidth / 2),
  ];
}

/**
 * Map time range to corresponding energy range based on scientific correlations
 * @param {Array} timeRange - The time range [min, max] in seconds
 * @param {HTMLElement} spectrumPlot - The spectrum plot to extract energy values from
 * @returns {Array} Energy range [min, max] in keV
 */
function mapTimeToEnergyRange(timeRange, spectrumPlot) {
  try {
    // Extract energy range from spectrum data
    if (!spectrumPlot || !spectrumPlot.data || spectrumPlot.data.length === 0) {
      console.error('Cannot access spectrum data to map energy range');
      return null;
    }

    // Find the data trace (non-background)
    const dataTrace = spectrumPlot.data.find(
      (trace) =>
        trace.x &&
        trace.x.length > 0 &&
        (!trace.name || !trace.name.toLowerCase().includes('background')),
    );

    if (!dataTrace) {
      console.error('No valid data trace found in spectrum');
      return null;
    }

    // Get overall energy range of the spectrum
    const xArray = dataTrace.x;
    let minEnergy = xArray[0];
    let maxEnergy = xArray[xArray.length - 1];
    if (minEnergy > maxEnergy) { minEnergy = xArray[xArray.length - 1]; maxEnergy = xArray[0]; }
    const totalEnergy = maxEnergy - minEnergy;

    // Get the time midpoint and width
    const timeMidpoint = (timeRange[0] + timeRange[1]) / 2;
    const timeWidth = timeRange[1] - timeRange[0];
    const threshold = 0.3; // Minimum correlation strength to consider

    let firstSignificant = null;
    let lastSignificant = null;

    // Optimize: no array allocation mapping or sorting needed
    for (let i = 0; i < xArray.length; i++) {
      const energy = xArray[i];
      const normalizedEnergy = (energy - minEnergy) / totalEnergy;
      const expectedTime = ENERGY_TIME_CORRELATION.getExpectedTime(normalizedEnergy);
      const weight = ENERGY_TIME_CORRELATION.getCorrelationStrength(timeMidpoint, expectedTime, timeWidth);

      if (weight > threshold) {
        if (firstSignificant === null || energy < firstSignificant) firstSignificant = energy;
        if (lastSignificant === null || energy > lastSignificant) lastSignificant = energy;
      }
    }

    if (firstSignificant === null) {
      // If no significant correlation, use the full range
      return [minEnergy, maxEnergy];
    }

    // Add padding to the significant range
    const padding = 0.1 * (maxEnergy - minEnergy);
    return [
      Math.max(minEnergy, firstSignificant - padding),
      Math.min(maxEnergy, lastSignificant + padding),
    ];
  } catch (error) {
    console.error('Error mapping time to energy range:', error);
    return null;
  }
}

/**
 * Map a time value to energy percentiles based on scientific correlations
 * @param {number} time - The time value in seconds
 * @returns {Array} Energy percentiles [min, max]
 */
function mapTimeToEnergyPercentile(time) {
  // This is a simplified mapping - in reality, you might want to use more sophisticated correlations
  const normalizedTime = (time % 100) / 100; // Normalize to 0-1 range
  const percentileWidth = 0.2; // Width of the percentile range
  return [
    Math.max(0, normalizedTime - percentileWidth / 2),
    Math.min(1, normalizedTime + percentileWidth / 2),
  ];
}

/**
 * 🟢 INITIALIZATION FUNCTION (TRIPLE-CHECK FILTER)
 * This function specifically hunts for Global HID plots and excludes them.
 */
export function initInteractiveLinking() {
  // 1. Find all plotly graphs on the page
  const allGraphs = document.querySelectorAll('.js-plotly-plot');

  if (!allGraphs.length) {
    console.log('No plots found to initialize interactive linking');
    return;
  }

  // 🔴 AGGRESSIVE FILTER: Ignore Global HID
  const plotlyGraphs = Array.from(allGraphs).filter((plot) => {
    // CHECK 1: Container ID (Fail-Safe)
    // If the plot is inside the special container we made in plot.js v41, ignore it.
    if (plot.closest('#combined-hid-plot') || plot.closest('#global-safe-container')) {
      console.log(`🛡️ Ignoring Global HID (Container Match): ${plot.id}`);
      return false;
    }

    // CHECK 2: Title (Robust)
    // Sometimes the title is an object, sometimes a string. We handle both.
    const layoutTitle = plot.layout?.title;
    const titleText = (typeof layoutTitle === 'string' ? layoutTitle : layoutTitle?.text || '').toLowerCase();

    if (titleText.includes('global hid') || titleText.includes('multi-observation')) {
      console.log(`🛡️ Ignoring Global HID (Title Match): ${titleText}`);
      return false;
    }

    // CHECK 3: Axis Label (Context)
    // Global HID usually has "Hardness" on the X-axis.
    const xaxis = plot.layout?.xaxis?.title?.text || '';
    if (xaxis.toLowerCase().includes('hardness') && titleText.includes('hid')) {
      console.log(`🛡️ Ignoring Global HID (Axis Match)`);
      return false;
    }

    // CHECK 4: ID (Legacy)
    if (plot.id.includes('combined-hid')) return false;

    return true; // Safe to link (Spectrum/Light Curve)
  });

  // No eligible graphs found after filtering, exit early
  if (plotlyGraphs.length < 2) {
    console.log(`Not enough eligible plots for linking (Found ${plotlyGraphs.length}). Global HID excluded.`);
  }

  console.log(
    `Found ${plotlyGraphs.length} eligible Plotly graphs to initialize interactive linking`,
  );

  // Log all plot IDs for debugging
  plotlyGraphs.forEach((plot, index) => {
    console.log(
      `Plot ${index + 1}: ID=${plot.id}, Container=${plot.closest('[id]')?.id || 'none'
      }`,
    );
  });

  // Find spectrum and light curve plots
  const { spectrumPlot, lightCurvePlot } = findPlots(plotlyGraphs);

  if (lightCurvePlot && lightCurvePlot.getAttribute('data-gti-double-click') !== 'true') {
    lightCurvePlot.setAttribute('data-gti-double-click', 'true');
    console.log(`Enabled native Plotly double-click tracking for Light Curve plot: ${lightCurvePlot.id}`);
  }

  if (!spectrumPlot && !lightCurvePlot) {
    console.log('Missing both plots - interactive linking cannot be configured.');
    return;
  }

  console.log(`Linking initialized. Spectrum (${spectrumPlot ? spectrumPlot.id : 'None'}) and Light Curve (${lightCurvePlot ? lightCurvePlot.id : 'None'})`);

  // Set up click handlers iteratively for any plots that actually exist
  if (spectrumPlot) setupClickHandler(spectrumPlot, lightCurvePlot, true);
  if (lightCurvePlot) setupClickHandler(lightCurvePlot, spectrumPlot, false);

  // Add direct event listeners to ensure clicks are captured
  addDirectEventListeners(spectrumPlot, lightCurvePlot);
}

function handleGtiDoubleClick(data, plot) {
  console.log("Drill-down triggered...");
  const point = data.points?.[0];
  if (!point) return;

  // 1. Identification: Handle the new "Obs [ID] | GTI [Num]" format
  const curveNumber = point.curveNumber;
  const traceName = (plot.data && curveNumber !== undefined && plot.data[curveNumber])
    ? plot.data[curveNumber].name
    : (point.data ? point.data.name : '');

  // 🟢 FIX 1: Extract 10-digit ID anywhere in the string (remove ^ and $ anchors)
  const obsIdMatch = traceName.match(/(\d{10})/);
  const obsId = obsIdMatch ? obsIdMatch[1] : (plot.layout.title?.text?.match(/\d{10}/)?.[0]);

  if (!obsId) {
    console.error("Could not extract Observation ID from trace or title.");
    return;
  }

  // 🟢 FIX 2: Extract GTI number
  let gtiNum = null;
  const gtiMatch = traceName.match(/GTI\s*(\d+)/i);
  if (gtiMatch) gtiNum = parseInt(gtiMatch[1], 10);

  // 2. Geometric isolation
  const trace = (plot.data && curveNumber !== undefined && plot.data[curveNumber]) ? plot.data[curveNumber] : null;

  if (trace && trace.x) {
    // 🟢 FIX 3: Detect if axis is in "Days" and adjust the 15-second gap threshold
    const isDays = (plot.layout.xaxis?.title?.text || '').toLowerCase().includes('day');
    const GAP_LIMIT = isDays ? (15 / 86400.0) : 15; // 15s converted to days

    let currentGtiIndex = 0;
    let startIdx = 0;
    let gtiStopX = null;
    const clickedTime = point.x;

    for (let i = 0; i < trace.x.length; i++) {
      if (i > 0 && Math.abs(trace.x[i] - trace.x[i - 1]) > GAP_LIMIT) {
        if (trace.x[i - 1] >= clickedTime) {
          gtiStopX = trace.x[i - 1];
          break;
        }
        currentGtiIndex++;
        startIdx = i;
      }
    }
    const gtiStartX = trace.x[startIdx];
    if (gtiStopX === null) gtiStopX = trace.x[trace.x.length - 1];

    if (gtiNum === null || isNaN(gtiNum)) gtiNum = currentGtiIndex;

    applyHighlightingToLightCurve(plot, [gtiStartX, gtiStopX], trace.xaxis || 'x');
  }

  // 3. Frontend Accelerator (Memory Drill-down)
  // 🟢 FIX 4: Filter by BOTH GTI Number and ObsID so we don't mix observations
  const isolatedTraces = (plot.data || []).filter(t => {
      const tName = t.name || "";
      const matchGti = tName.match(/GTI\s*(\d+)/i);
      const parsedGti = matchGti ? parseInt(matchGti[1], 10) : null;
      return (parsedGti === gtiNum) && tName.includes(obsId);
  }).map(t => {
      const newTrace = JSON.parse(JSON.stringify(t)); 
      newTrace.xaxis = 'x'; 
      newTrace.yaxis = 'y';
      return newTrace;
  });

  if (isolatedTraces.length > 0) {
      let $container = $('#detailed-gti-plots');
      if ($container.length === 0) $container = $('<div id="detailed-gti-plots" style="margin-top: 2rem;"></div>');
      $container.empty().detach();
      
      const newPlotId = `standalone-gti-plot-${gtiNum}-${Date.now()}`;
      $container.append(`<h2>Selected GTI: ${obsId} (GTI ${gtiNum})</h2>`);
      $container.append(`<div id="${newPlotId}" class="plotly-graph-div js-plotly-plot" style="width:100%; height:400px;"></div>`);
      
      const $parent = $(plot).closest('.plot-type-section');
      if ($parent.length > 0) $parent.after($container);
      else $('#plots').append($container);

      const clonedLayout = JSON.parse(JSON.stringify(plot.layout || {}));
      clonedLayout.title = { text: `Light Curve ${obsId} - GTI ${gtiNum}` };
      clonedLayout.shapes = []; 
      if (clonedLayout.xaxis) {
          delete clonedLayout.xaxis.domain;
          clonedLayout.xaxis.autorange = true;
      }
      Object.keys(clonedLayout).forEach(k => { if (k.match(/^xaxis\d+$/)) delete clonedLayout[k]; });

      Plotly.newPlot(newPlotId, isolatedTraces, clonedLayout);
  }
}

/**
 * Find spectrum and light curve plots from a collection of Plotly graphs
 * @param {NodeList} plots - Collection of Plotly graph elements
 * @returns {Object} Object containing spectrumPlot and lightCurvePlot
 */
function findPlots(plots) {
  let spectrumPlot = null;
  let lightCurvePlot = null;

  // Log all plots for debugging
  console.log(`Finding plots among ${plots.length} Plotly graphs`);
  plots.forEach((plot, index) => {
    const container = plot.closest('[id]');
    const containerId = container ? container.id : 'none';
    const title =
      plot.layout && plot.layout.title ? plot.layout.title.text : 'none';
    const plotType = plot.getAttribute('data-plot-type');
    console.log(
      `Plot ${index + 1}: ID=${plot.id
      }, Container=${containerId}, Title=${title}, DataPlotType=${plotType}`,
    );
  });

  // PRIORITY 1: Check for 'data-plot-type' attribute on the plot element itself
  // This is the most robust way when using the new modular graph rendering
  for (const plot of plots) {
    const plotType = plot.getAttribute('data-plot-type');
    if (plotType === 'spectrum') {
      spectrumPlot = plot;
      console.log(`Found spectrum plot by data-plot-type attribute: ${plot.id}`);
    } else if (plotType === 'light-curve') {
      lightCurvePlot = plot;
      console.log(`Found light curve plot by data-plot-type attribute: ${plot.id}`);
    }
  }

  // If we only have two plots and haven't identified them yet, assume the first is spectrum and second is light curve
  if (!spectrumPlot && !lightCurvePlot && plots.length === 2) {
    console.log(
      'Using heuristic: assuming first plot is spectrum and second is light curve',
    );
    spectrumPlot = plots[0];
    lightCurvePlot = plots[1];
    return { spectrumPlot, lightCurvePlot };
  }

  // PRIORITY 2: Try to identify plots by their container ID or title
  for (const plot of plots) {
    if (spectrumPlot && lightCurvePlot) break;

    // Check container ID
    const container = plot.closest('[id]');
    if (container) {
      const containerId = container.id.toLowerCase();
      if (!spectrumPlot && containerId.includes('spectrum')) {
        spectrumPlot = plot;
        console.log(`Found spectrum plot by container: ${containerId}`);
      } else if (
        !lightCurvePlot &&
        (containerId.includes('light-curve') ||
        containerId.includes('lightcurve'))
      ) {
        lightCurvePlot = plot;
        console.log(`Found light curve plot by container: ${containerId}`);
      }
    }

    // If still not identified, check by title
    if (
      (!spectrumPlot || !lightCurvePlot) &&
      plot.layout &&
      plot.layout.title
    ) {
      const title = plot.layout.title.text?.toLowerCase() || '';
      if (
        !spectrumPlot &&
        (title.includes('spectrum') || title.includes('energy'))
      ) {
        spectrumPlot = plot;
        console.log(`Found spectrum plot by title: ${title}`);
      } else if (
        !lightCurvePlot &&
        (title.includes('light curve') ||
          title.includes('lightcurve') ||
          title.includes('time'))
      ) {
        lightCurvePlot = plot;
        console.log(`Found light curve plot by title: ${title}`);
      }
    }
  }

  // PRIORITY 3: Try to identify by axis labels
  if (!spectrumPlot || !lightCurvePlot) {
    for (const plot of plots) {
      if (plot.layout) {
        const xAxisTitle = plot.layout.xaxis?.title?.text?.toLowerCase() || '';
        const yAxisTitle = plot.layout.yaxis?.title?.text?.toLowerCase() || '';

        if (
          !spectrumPlot &&
          (xAxisTitle.includes('energy') || xAxisTitle.includes('kev'))
        ) {
          spectrumPlot = plot;
          console.log(`Found spectrum plot by x-axis label: ${xAxisTitle}`);
        } else if (
          !lightCurvePlot &&
          (xAxisTitle.includes('time') || xAxisTitle.includes('second'))
        ) {
          lightCurvePlot = plot;
          console.log(`Found light curve plot by x-axis label: ${xAxisTitle}`);
        }
      }
    }
  }

  // PRIORITY 4: Try to identify by data characteristics
  if (!spectrumPlot || !lightCurvePlot) {
    for (const plot of plots) {
      if (plot.data && plot.data.length > 0) {
        // Check if this is likely a spectrum plot (energy values typically in keV)
        const firstTrace = plot.data[0];
        if (firstTrace.x && firstTrace.x.length > 0) {
          const sampleX = firstTrace.x[0];
          if (!spectrumPlot && sampleX > 0 && sampleX < 20) {
            // Typical keV range
            spectrumPlot = plot;
            console.log(
              `Found spectrum plot by data characteristics: x values around ${sampleX}`,
            );
          } else if (!lightCurvePlot && sampleX > 100) {
            // Typical time values in seconds
            lightCurvePlot = plot;
            console.log(
              `Found light curve plot by data characteristics: x values around ${sampleX}`,
            );
          }
        }
      }
    }
  }

  // If we still don't have both plots, make a best guess, but never cross-contaminate identities!
  if (!spectrumPlot && !lightCurvePlot && plots.length >= 2) {
    console.log('Could not reliably identify plots by title or data, making blind sequential guess');
    spectrumPlot = plots[0];
    lightCurvePlot = plots[1];
  }

  return { spectrumPlot, lightCurvePlot };
}

/**
 * Set up click event handler for a plot
 * @param {HTMLElement} plot - The plot element
 * @param {HTMLElement} otherPlot - The other plot element to highlight
 * @param {boolean} isSpectrum - Whether this plot is the spectrum plot
 */
function setupClickHandler(plot, otherPlot, isSpectrum) {
  try {
    // Make sure we don't add duplicate handlers
    if (plot.getAttribute('data-interactive-linking') === 'true') {
      console.log(`Plot ${plot.id} already has interactive linking handlers`);
      return;
    }

    console.log(
      `Setting up click handler for ${isSpectrum ? 'spectrum' : 'light curve'
      } plot ${plot.id}`,
    );

    // Mark the plot as having our handlers
    plot.setAttribute('data-interactive-linking', 'true');

    // Define the click handler
    const handleClick = function (data) {
      if (typeof isSynchronizing !== 'undefined' && isSynchronizing) return;

      // Extract the immutable native DOM timestamp to completely annihilate Plotly Cartesian ghosting duplicates
      // This MUST be evaluated before any console logs or object property retrievals to unfreeze the UI thread completely!
      const nativeEventTimestamp = data.event ? data.event.timeStamp : null;
      
      if (nativeEventTimestamp !== null && nativeEventTimestamp === plot._lastNativeEventTimestamp) {
          // Drop identical physical DOM echoes dispatched continuously across overlapping Plotly sub-axes grids.
          return;
      }
      plot._lastNativeEventTimestamp = nativeEventTimestamp;

      if (!data || !data.points || data.points.length === 0) {
        console.log(
          `Click detected on ${isSpectrum ? 'spectrum' : 'light curve'
          } plot but no points found`,
        );
        return;
      }

      console.log(`Click strictly isolated on ${isSpectrum ? 'spectrum' : 'light curve'} plot:`, data);

      const point = data.points[0];
      const xValue = point.x;

      const currentPhysicalTime = nativeEventTimestamp !== null ? nativeEventTimestamp : Date.now();
      const timeSinceLastPhysicalClick = currentPhysicalTime - (plot._lastPhysicalClickTime || 0);
      
      plot._lastPhysicalClickTime = currentPhysicalTime;
      plot._lastPlotlyClickData = data; // Cache primary single-click payload for fast double-clicks

      // Intercept purely legitimately spaced physical double-clicks (slow double clicks: 60ms-600ms)
      if (timeSinceLastPhysicalClick > 50 && timeSinceLastPhysicalClick < 600) {
        console.log(`True physical double-click intercepted! Delta: ${timeSinceLastPhysicalClick.toFixed(1)}ms. Triggering GTI Plugin...`);
        handleGtiDoubleClick(plot._lastPlotlyClickData, plot);
        plot._lastPhysicalClickTime = 0; // Hard reset to break cascading double-click chain bounds
        return; // Prevent drawing a new highlight box on top
      }

      // Define robustly bounded region around clicked point
      let rangeWidth = 0.5;
      if (!isSpectrum && plot.layout && plot.layout.xaxis && plot.layout.xaxis.range) {
        // Auto-scale width to 2% of visible timeline for MET days/seconds to prevent 100% chart eclipse
        const span = plot.layout.xaxis.range[1] - plot.layout.xaxis.range[0];
        rangeWidth = span * 0.02;
      } else if (isSpectrum) {
        rangeWidth = 0.5; // Fixed 0.5 keV for Energy spectrum
      }

      const xRange = [xValue - rangeWidth, xValue + rangeWidth];

      console.log(
        `Highlighting ${isSpectrum ? 'spectrum' : 'light curve'} region: [${xRange[0]
        }, ${xRange[1]}] ${isSpectrum ? 'keV' : 's'}`,
      );

      // Always highlight new region, don't toggle
      if (otherPlot) {
         if (isSpectrum) {
           const timeRange = mapEnergyToTimeRange(xRange, otherPlot);
           highlightRegion(plot, otherPlot, xRange, timeRange);
         } else {
           const energyRange = mapTimeToEnergyRange(xRange, otherPlot);
           highlightRegion(otherPlot, plot, energyRange, xRange);
         }
      } else {
         // Standalone plot functionality without full cross-correlation linking
         // Pull the specific discontinuous panel axis tracker (e.g., 'x', 'x2')
         const targetXref = point.data ? (point.data.xaxis || 'x') : 'x';
         
         if (isSpectrum) {
            applyHighlightingToSpectrum(plot, xRange);
         } 
         // Deliberately omitted fallback for Light Curve: 
         // A standalone Light Curve has no logical mathematical cross-correlation mapping for a tiny 2% slice. 
         // It strictly only evaluates Double Clicks to map full geometric boundaries!
      }
    };

    // Native fast double-click interceptor
    const handleDoubleClick = function () {
      console.log("Plotly native fast double-click detected! Triggering GTI plugin...");
      if (plot._lastPlotlyClickData) {
        handleGtiDoubleClick(plot._lastPlotlyClickData, plot);
      } else {
        console.log("No preceding single-click data found to process double-click.");
      }
    };

    // Use Plotly's event system
    if (typeof plot.on === 'function') {
      console.log(
        `Using Plotly event system for ${isSpectrum ? 'spectrum' : 'light curve'
        } plot`,
      );
      plot.on('plotly_click', handleClick);
      plot.on('plotly_doubleclick', handleDoubleClick);
      console.log('Set up Plotly event handlers efficiently');
    } else {
      console.log('plot.on is not available, using fallback event handlers');
      // Fallback to DOM events
      plot.addEventListener('click', function (event) {
        // This is a simplified fallback that won't have the actual data points
        console.log('Fallback click handler (not fully functional)');
      });
    }
  } catch (error) {
    console.error('Error setting up click handler:', error);
  }
}

/**
 * Highlight a region on both plots
 * @param {HTMLElement} spectrumPlot - The spectrum plot element
 * @param {HTMLElement} lightCurvePlot - The light curve plot element
 * @param {Array} energyRange - The energy range to highlight [min, max] in keV
 * @param {Array} timeRange - The time range to highlight [min, max] in seconds
 */
function highlightRegion(spectrumPlot, lightCurvePlot, energyRange, timeRange) {
  // Store the selected ranges
  highlightState.selectedRange = energyRange;
  highlightState.active = true;

  // Apply to spectrum plot
  applyHighlightingToSpectrum(spectrumPlot, energyRange);

  // Apply to light curve plot with the mapped time range
  applyHighlightingToLightCurve(lightCurvePlot, timeRange);

  // Add visual indicator
  spectrumPlot.classList.add('interactive-linking-active');
  lightCurvePlot.classList.add('interactive-linking-active');
}

/**
 * Map energy range to corresponding time range based on scientific correlations
 * Using a continuous mapping approach for more precision
 * @param {Array} energyRange - The energy range [min, max] in keV
 * @param {HTMLElement} lightCurvePlot - The light curve plot to extract time values from
 * @returns {Array} Time range [min, max] in seconds
 */
function mapEnergyToTimeRange(energyRange, lightCurvePlot) {
  try {
    // Extract time range from light curve data
    if (
      !lightCurvePlot ||
      !lightCurvePlot.data ||
      lightCurvePlot.data.length === 0
    ) {
      console.error('Cannot access light curve data to map time range');
      return null;
    }

    // Find the data trace (non-background)
    const dataTrace = lightCurvePlot.data.find(
      (trace) =>
        trace.x &&
        trace.x.length > 0 &&
        (!trace.name || !trace.name.toLowerCase().includes('background')),
    );

    if (!dataTrace || !dataTrace.x || dataTrace.x.length === 0) {
      console.error('No valid data trace found in light curve');
      return null;
    }

    // Get overall time range
    const tArray = dataTrace.x;
    let minTime = tArray[0];
    let maxTime = tArray[tArray.length - 1];
    if (minTime > maxTime) { minTime = tArray[tArray.length - 1]; maxTime = tArray[0]; }
    const totalTime = maxTime - minTime;

    const energyMidpoint = (energyRange[0] + energyRange[1]) / 2;
    const threshold = 0.3; // Minimum correlation strength to consider

    let firstSignificant = null;
    let lastSignificant = null;

    for (let i = 0; i < tArray.length; i++) {
      const time = tArray[i];
      const expectedEnergy = ENERGY_TIME_CORRELATION.getExpectedEnergy(time - minTime, totalTime);
      const weight = ENERGY_TIME_CORRELATION.getCorrelationStrength(energyMidpoint, time - minTime, totalTime);

      if (weight > threshold) {
        if (firstSignificant === null || time < firstSignificant) firstSignificant = time;
        if (lastSignificant === null || time > lastSignificant) lastSignificant = time;
      }
    }

    if (firstSignificant === null) {
      // If no significant correlation, use the full range
      return [minTime, maxTime];
    }

    // Add padding to the significant range
    const padding = 0.1 * (maxTime - minTime);
    return [
      Math.max(minTime, firstSignificant - padding),
      Math.min(maxTime, lastSignificant + padding),
    ];
  } catch (error) {
    console.error('Error mapping energy to time range:', error);
    return null;
  }
}

/**
 * Apply highlighting to a spectrum plot by modifying point colors and opacities
 * @param {HTMLElement} plot - The spectrum plot element
 * @param {Array} xRange - The energy range to highlight [min, max] in keV
 */
function applyHighlightingToSpectrum(plot, xRange) {
  try {
    if (!plot || !plot.layout) return;

    // Create a highlight shape instead of iterating over thousands of data points
    const highlightShape = {
      type: 'rect',
      xref: 'x',
      yref: 'paper', // Stretch across entire Y axis
      x0: xRange[0],
      y0: 0,
      x1: xRange[1],
      y1: 1,
      fillcolor: 'rgba(255, 65, 54, 0.3)',
      line: { width: 0 },
      layer: 'below'
    };

    // Plotly aggressively strips out custom JS properties during internal shape cloning, causing ghost boxes to accumulate.
    // By passing an exact array overriding `shapes` instead of attempting to blindly filter old anomalies, we perfectly mathematically obliterate ALL previously stuck trace selection boxes from memory!
    Plotly.relayout(plot, { shapes: [highlightShape] });
  } catch (error) {
    console.error('Error applying highlighting to spectrum:', error);
  }
}

/**
 * Apply highlighting to a light curve plot by modifying point colors and opacities
 * @param {HTMLElement} plot - The light curve plot element
 * @param {Array|null} timeRange - The time range to highlight [min, max] in seconds
 * @param {string} xref - The native specific Plotly sub-axis identifier (default 'x')
 */
function applyHighlightingToLightCurve(plot, timeRange, xref = 'x') {
  try {
    if (!plot || !plot.layout) return;

    if (!timeRange) {
      console.log('No valid time range mapping - not modifying light curve');
      return;
    }

    // Visually pad the exact numerical boundaries by 3% entirely so that the blue box fully 
    // engulfs the outer physical radius of the SVG scattered dot markers cleanly!
    const padding = Math.max(0, (timeRange[1] - timeRange[0]) * 0.03); 

    // Create a highlight shape instead of iterating over thousands of data points
    const highlightShape = {
      type: 'rect',
      xref: xref, // Dynamically maps to 'x2', 'x3' panels natively if plot uses Cartesian overlap!
      yref: 'paper', // Stretch across entire Y axis
      x0: timeRange[0] - padding,
      y0: 0,
      x1: timeRange[1] + padding,
      y1: 1,
      fillcolor: 'rgba(50, 136, 189, 0.3)',
      line: { width: 0 },
      layer: 'below'
    };

    // Plotly aggressively strips out custom JS properties during internal shape cloning, causing ghost boxes to accumulate.
    // By passing an exact array overriding `shapes` instead of attempting to blindly filter old anomalies, we perfectly mathematically obliterate ALL previously stuck trace selection boxes from memory!

    // Enqueue asynchronously so any concurrent Plotly repaints (e.g., initial standalone clicks) completely finish
    setTimeout(() => {
        Plotly.relayout(plot, { shapes: [highlightShape] });
    }, 50); // Small 50ms delay securely detaches the relayout engine from Plotly's heavy double-click processing tree!
  } catch (error) {
    console.error('Error applying highlighting to light curve:', error);
  }
}

/**
 * Reset highlights on both plots
 * @param {HTMLElement} spectrumPlot - The spectrum plot element
 * @param {HTMLElement} lightCurvePlot - The light curve plot element
 */
function resetHighlights(spectrumPlot, lightCurvePlot) {
  resetPlotHighlights(spectrumPlot);
  resetPlotHighlights(lightCurvePlot);

  // Reset state
  highlightState.active = false;
  highlightState.selectedRange = null;

  // Remove visual indicators
  spectrumPlot.classList.remove('interactive-linking-active');
  lightCurvePlot.classList.remove('interactive-linking-active');

  console.log('All highlights reset');
}

/**
 * Reset highlights on a single plot
 * @param {HTMLElement} plot - The plot element to reset
 */
function resetPlotHighlights(plot) {
  try {
    if (!plot || !plot.layout) return;

    // Check if there are any visual highlight shapes to remove (by inspecting explicit SVG color)
    if (plot.layout.shapes && plot.layout.shapes.some(s => s.fillcolor === 'rgba(50, 136, 189, 0.3)' || s.fillcolor === 'rgba(255, 65, 54, 0.3)')) {
      const existingShapes = plot.layout.shapes.filter(s => s.fillcolor !== 'rgba(50, 136, 189, 0.3)' && s.fillcolor !== 'rgba(255, 65, 54, 0.3)');
      Plotly.relayout(plot, { shapes: existingShapes });
    }
  } catch (error) {
    console.error(`Error resetting highlights for plot:`, error);
  }
}

/**
 * Diagnostic function that can be called from the browser console
 * to help diagnose issues with plots
 */
export function diagnosePlotlyGraphs() {
  console.log('--- Diagnosing Plotly Graphs ---');

  // Find all Plotly graphs
  const graphs = document.querySelectorAll('.js-plotly-plot');
  console.log(`Found ${graphs.length} Plotly graph elements`);

  const { spectrumPlot, lightCurvePlot } = findPlots(graphs);
  console.log('Spectrum plot:', spectrumPlot ? spectrumPlot.id : 'Not found');
  console.log(
    'Light curve plot:',
    lightCurvePlot ? lightCurvePlot.id : 'Not found',
  );

  let totalPoints = 0;
  let totalTraces = 0;

  graphs.forEach((graph, index) => {
    console.log(`\nGraph #${index + 1} - ID: ${graph.id}`);

    // Check if it has data and layout
    console.log(`Has data: ${graph.data ? 'Yes' : 'No'}`);
    console.log(`Has layout: ${graph.layout ? 'Yes' : 'No'}`);

    // Check memory usage
    if (graph.data) {
      totalTraces += graph.data.length;

      let pointCount = 0;
      graph.data.forEach((trace) => {
        if (trace.x) pointCount += trace.x.length;
      });

      totalPoints += pointCount;
      console.log(
        `Contains ${graph.data.length} traces with approximately ${pointCount} total points`,
      );
    }

    // Check if our handler is set up
    console.log(
      `Interactive linking initialized: ${graph.getAttribute('data-interactive-linking') === 'true' ? 'Yes' : 'No'
      }`,
    );

    // Check for container info
    const container = graph.closest('[id]');
    if (container) {
      console.log(`Container ID: ${container.id}`);
    }
  });

  console.log(
    `\nTotal: ${totalTraces} traces with approximately ${totalPoints} data points`,
  );
  console.log('\n--- End Diagnosis ---');

  return `Diagnosis complete. Found ${graphs.length} Plotly graphs with ~${totalPoints} data points.`;
}

// Make diagnosePlotlyGraphs available globally for console access
window.diagnosePlotlyGraphs = diagnosePlotlyGraphs;

/**
 * Add direct event listeners to the plots to ensure clicks are captured
 * @param {HTMLElement} spectrumPlot - The spectrum plot element
 * @param {HTMLElement} lightCurvePlot - The light curve plot element
 */
function addDirectEventListeners(spectrumPlot, lightCurvePlot) {
  // DISABLED: These native listeners conflict with Plotly's native 'plotly_click'
  // causing highlighting to fire 2-3 times per click, immediately toggling it off again.
  console.log('Direct fallback event listeners intentionally disabled to prevent click redundancy.');
}

/**
 * Trigger highlighting for a clicked point
 * @param {HTMLElement} sourcePlot - The plot that was clicked
 * @param {HTMLElement} targetPlot - The other plot to highlight
 * @param {number} xValue - The x-value of the clicked point
 * @param {boolean} isSpectrum - Whether the source plot is the spectrum plot
 */
function triggerHighlighting(sourcePlot, targetPlot, xValue, isSpectrum) {
  console.log(
    `Triggering highlighting for ${isSpectrum ? 'spectrum' : 'light curve'
    } point: ${xValue}`,
  );

  // Define region around clicked point
  const rangeWidth = isSpectrum ? 0.5 : 0.5; // keV for spectrum, seconds for light curve
  const xRange = [xValue - rangeWidth, xValue + rangeWidth];

  console.log(
    `Highlighting ${isSpectrum ? 'spectrum' : 'light curve'} region: [${xRange[0]
    }, ${xRange[1]}] ${isSpectrum ? 'keV' : 's'}`,
  );

  // Toggle highlighting
  if (
    highlightState.active &&
    highlightState.selectedRange &&
    Math.abs(highlightState.selectedRange[0] - xRange[0]) < 0.01
  ) {
    // If clicking on the same region, turn off highlighting
    resetHighlights(sourcePlot, targetPlot);
  } else {
    // Highlight new region
    if (isSpectrum) {
      const timeRange = mapEnergyToTimeRange(xRange, targetPlot);
      highlightRegion(sourcePlot, targetPlot, xRange, timeRange);
    } else {
      const energyRange = mapTimeToEnergyRange(xRange, targetPlot);
      highlightRegion(targetPlot, sourcePlot, energyRange, xRange);
    }
  }
}