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
  console.log("handleGtiDoubleClick native redirect triggered with data:", data);
  const point = data.points?.[0];
  if (!point) {
    console.log("Double click did not explicitly occur on a plotted trace. Ignoring.");
    return;
  }

  // The ObsID is in the title of the plot, e.g., "Light Curve 1234567890"
  const obsIdMatch = plot.layout.title?.text?.match(/\d{10}/);
  if (!obsIdMatch) {
    console.error("Could not extract Observation ID from plot title.");
    return;
  }
  const obsId = obsIdMatch[0];

  // Extract the exact GTI number directly from the trace legend string ("GTI0", "GTI 0", etc)
  const curveNumber = point.curveNumber;
  const traceName = (plot.data && curveNumber !== undefined && plot.data[curveNumber])
    ? plot.data[curveNumber].name
    : (point.data ? point.data.name : '');

  let gtiNum = null;
  if (traceName) {
    const match = traceName.match(/GTI\s*(\d+)/i);
    if (match) {
      gtiNum = parseInt(match[1], 10);
    }
  }

  // If we still can't find the GTI number, try matching ALL names in plot.data to see if only one GTI exists
  let gtiStartX = null;
  let gtiStopX = null;

  if (gtiNum === null || isNaN(gtiNum)) {
    console.log(`Could not intuitively extract GTI number from traced name. Name: '${traceName}'`);
  }

  // Always attempt to dynamically calculate the contiguous geometric bounds of the clicked trace
  // This guarantees the blue highlight box perfectly encapsulates the specific GTI and prevents merged-trace bleeding
  const trace = (plot.data && curveNumber !== undefined && plot.data[curveNumber])
    ? plot.data[curveNumber]
    : (plot.data ? plot.data.find(t => t.x && t.x.length > 0 && !(t.name || '').toLowerCase().includes('background')) : null);

  if (trace && trace.x) {
    let currentGtiIndex = 0;
    let startIdx = 0;
    const clickedTime = point.x;

    for (let i = 0; i < trace.x.length; i++) {
      // A time separation > 15 seconds marks reaching the next distinct GTI block orbit
      if (i > 0 && Math.abs(trace.x[i] - trace.x[i - 1]) > 15) {
        if (trace.x[i - 1] >= clickedTime) {
          // The previous chunk contained the click timeline!
          gtiStopX = trace.x[i - 1];
          break;
        }
        currentGtiIndex++;
        startIdx = i; // Next chunk starts right here
      }
    }

    if (gtiStopX === null) {
      // If we never crossed into a next chunk, it was the final chunk
      gtiStopX = trace.x[trace.x.length - 1];
    }
    gtiStartX = trace.x[startIdx];

    // If we didn't have a GTI number earlier, adopt our structurally deduced one
    if (gtiNum === null || isNaN(gtiNum)) {
      gtiNum = currentGtiIndex;
      console.log(`Chronologically counted data gaps. Deduced GTI index from plot structure: ${gtiNum}`);
    }

    console.log(`GTI Boundaries isolated: [${gtiStartX}, ${gtiStopX}]`);

    // Extract the strict native Plotly axis sub-identifier (e.g., 'x2', 'x3') for this specific GTI chunk
    // Discontinuous light curves map separated chunks to completely different physical HTML layout axes!
    const targetXref = trace.xaxis || 'x';

    // Draw the magnificent blue rectangle EXACTLY over exclusively this GTI structure and axis pane!
    applyHighlightingToLightCurve(plot, [gtiStartX, gtiStopX], targetXref);

  } else {
    if (gtiNum === null || isNaN(gtiNum)) {
      alert(`Could not extract GTI label and no raw timeline numeric data is available for calculation.`);
      return;
    }
  }

  let traceColor = null;
  if (point.fullData) {
    traceColor = point.fullData.marker?.color || point.fullData.line?.color;
  }
  if (Array.isArray(traceColor)) traceColor = traceColor[0];

  console.log(`Prepared to dynamically fetch natively-rendered identical plot for ObsID: ${obsId}, GTI: ${gtiNum}. Custom Color: ${traceColor}`);

  // (Removed redundant opacity reverters as they silently cancel active asynchronous Plotly object repaints and strand visual shapes)

  // ====================================================
  // FRONTEND ACCELERATOR: INSTANT GRAPH RE-INJECTION
  // ====================================================
  // The Python Django backend routinely takes 10 to 20 seconds to construct massive Plotly HTML payloads mechanically.
  // Since the user natively imported the full GTI trace arrays to render the main plot, we can instantaneously 
  // deep-clone the specific array from memory, nullify its multi-axis projection coordinates, and render it under 50ms!
  const isolatedTraces = (plot.data || []).filter(t => {
      const matchGti = (t.name || '').match(/GTI\s*(\d+)/i);
      const parsed = matchGti ? parseInt(matchGti[1], 10) : null;
      return parsed === gtiNum;
  }).map((t, idx) => {
      const newTrace = JSON.parse(JSON.stringify(t)); 
      newTrace.xaxis = 'x'; // Mathematically destroy previous discontinuous Cartesian routing
      newTrace.yaxis = 'y';
      // Force consistent vivid trace coloring instead of fallback gray matching
      if (newTrace.marker) newTrace.marker.color = traceColor;
      if (newTrace.line) newTrace.line.color = traceColor;
      return newTrace;
  });

  if (isolatedTraces.length > 0) {
      console.log(`Frontend Accelerator: Found ${isolatedTraces.length} memory traces for GTI ${gtiNum}. Automatically Bypassing 20-second backend latency!`);

      let $detailedPlotsContainer = $('#detailed-gti-plots');
      if ($detailedPlotsContainer.length === 0) {
        $detailedPlotsContainer = $('<div id="detailed-gti-plots" style="margin-top: 2rem;"></div>');
      } else {
        $detailedPlotsContainer.empty().detach();
      }
      
      const newPlotId = `standalone-gti-plot-${gtiNum}-${Date.now()}`;
      $detailedPlotsContainer.append('<h2>Selected GTI Plot</h2>');
      $detailedPlotsContainer.append(`<div id="${newPlotId}" class="plotly-graph-div js-plotly-plot" style="width:100%; height:400px;"></div>`);
      
      // Inject strictly below the native plot wrapper logic
      const $parentSection = $(plot).closest('.plot-type-section');
      if ($parentSection.length > 0) {
         $parentSection.after($detailedPlotsContainer);
      } else {
         $('#plots').append($detailedPlotsContainer);
      }

      const clonedLayout = JSON.parse(JSON.stringify(plot.layout || {}));
      clonedLayout.title = { text: `Light Curve ${obsId} - GTI ${gtiNum}` };
      clonedLayout.shapes = []; // Clear the restrictive blue highlighter shapes

      // Destroy all multiple discontinuous grid boundaries natively so the plot organically explodes to fill 100% width
      if (clonedLayout.xaxis) {
          delete clonedLayout.xaxis.domain;
          delete clonedLayout.xaxis.range;
          clonedLayout.xaxis.autorange = true;
      }
      Object.keys(clonedLayout).forEach(key => {
         if (key.match(/^xaxis\d+$/)) delete clonedLayout[key]; 
      });

      // Synchronously deploy UI logic mapping
      Plotly.newPlot(newPlotId, isolatedTraces, clonedLayout).then(() => {
          console.log(`Instantaneous Frontend Re-rendering completed flawlessly!`);
      }).catch(err => {
          console.error("Frontend Accelerator Error:", err);
      });

      return; // Fully circumvent the 20-second Ajax fallback and return control to the user immediately!
  }

  // ====================================================
  // BACKEND FALLBACK (for anonymous structural GTIs)
  // ====================================================
  console.warn("Frontend Accelerator bypassed. Proceeding with 20-second classical backend AJAX generation fallback...");

  // Fallback box rendering if the gap-analysis algorithm skipped (e.g. data was empty)
  if (typeof gtiStartX === 'undefined' && plot && plot.data && curveNumber !== undefined && plot.data[curveNumber]) {
    const fallbackTrace = plot.data[curveNumber];
    const xData = fallbackTrace.x || [];
    if (xData.length > 0) {
      let minX = xData[0], maxX = xData[0];
      for (let i = 1; i < xData.length; i++) {
        if (xData[i] < minX) minX = xData[i];
        if (xData[i] > maxX) maxX = xData[i];
      }
      const targetXref = fallbackTrace.xaxis || 'x';
      applyHighlightingToLightCurve(plot, [minX, maxX], targetXref);
    }
  }

  // Formulate the EXACT SAME payload that the sidebar sends to the backend 
  const formData = new FormData();
  formData.append('obs_id', obsId);
  formData.append('quality', $('#quality-select').val() || 'goddard');
  formData.append('search_type', 'obs_id');
  formData.append('gti-search', `${obsId}-${gtiNum}`);
  formData.append('light_curve', 'on');
  formData.append('plot_types', 'light_curve');
  formData.append('csrfmiddlewaretoken', $('input[name="csrfmiddlewaretoken"]').val());
  console.log("FormData exactly cloned for native graph request:", Object.fromEntries(formData.entries()));

  // Submit to the primary PLOT_GRAPH_URL to get the identical layout
  $.ajax({
    type: 'POST',
    url: PLOT_GRAPH_URL,
    data: formData,
    processData: false,
    contentType: false,
    success: function (response) {
      if (response.error) {
        alert('Error generating single GTI plot: ' + response.error);
        return;
      }

      // Plot_data endpoint returns an array of plotDiv html strings
      if (!response.plotDivs || response.plotDivs.length === 0) {
        console.error("No plotted HTML structure was returned from the natively driven server route");
        alert("Backend processing returned no plot structures.");
        return;
      }

      let $detailedPlotsContainer = $('#detailed-gti-plots');
      if ($detailedPlotsContainer.length === 0) {
        $detailedPlotsContainer = $('<div id="detailed-gti-plots" style="margin-top: 2rem;"></div>');
      } else {
        // Clear previous selected GTI plots when a new one is clicked and detach to dynamically relocate it
        $detailedPlotsContainer.empty();
        $detailedPlotsContainer.detach();
      }
      
      $detailedPlotsContainer.append('<h2>Selected GTI Plot</h2>');
      
      // Navigate up exactly to the structural wrapper of the clicked graph so we can insert the new plot purely right below it
      const $parentSection = $(plot).closest('.plot-type-section');
      if ($parentSection.length > 0) {
         $parentSection.after($detailedPlotsContainer);
      } else {
         $('#plots').append($detailedPlotsContainer);
      }

      // Appending cleanly, just like how graph.js behaves natively
      const plotHtml = response.plotDivs[0];
      $detailedPlotsContainer.append(plotHtml);

      // Cherry on top: Recolor the new standalone plot to match the specific GTI color from the main plot!
      const newPlotNode = $detailedPlotsContainer.find('.js-plotly-plot')[0];
      if (newPlotNode && traceColor) {
        setTimeout(() => {
          if (newPlotNode.data) {
            Plotly.restyle(newPlotNode, {
              'marker.color': traceColor,
              'line.color': traceColor
            });
            console.log(`Restyled detailed plot to match original GTI trace color: ${traceColor}`);
          }
        }, 100); // Tiny delay ensures the injected <script> Plotly.newPlot() has finished executing
      }

      // Optionally re-run MathJax
      if (typeof MathJax !== 'undefined' && MathJax.typeset) {
        MathJax.typeset([$detailedPlotsContainer[0]]);
      }
      console.log("Detailed GTI natively styled plot beautifully cloned and rendered below. Done.");
    },
    error: function (jqXHR, textStatus, errorThrown) {
      console.error("AJAX error internally fetching backend clone:", textStatus, errorThrown);
      alert('Failed to clone backend GTI parameters.');
    }
  });
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