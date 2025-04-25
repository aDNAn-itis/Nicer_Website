/**
 * Interactive linking between spectrum and light curve plots
 * This module enables user click interaction on spectrum plots to highlight regions of interest
 * and show corresponding points in the light curve
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
    const energies = [...dataTrace.x].sort((a, b) => a - b);
    const minEnergy = energies[0];
    const maxEnergy = energies[energies.length - 1];
    const totalEnergy = maxEnergy - minEnergy;

    // Get the time midpoint and width
    const timeMidpoint = (timeRange[0] + timeRange[1]) / 2;
    const timeWidth = timeRange[1] - timeRange[0];

    // Calculate correlation weights for each energy point
    const weights = energies.map((energy) => {
      const normalizedEnergy = (energy - minEnergy) / totalEnergy;
      const expectedTime =
        ENERGY_TIME_CORRELATION.getExpectedTime(normalizedEnergy);
      return ENERGY_TIME_CORRELATION.getCorrelationStrength(
        timeMidpoint,
        expectedTime,
        timeWidth,
      );
    });

    // Find the energy range with significant correlation
    const threshold = 0.3; // Minimum correlation strength to consider
    const significantEnergies = energies.filter(
      (_, i) => weights[i] > threshold,
    );

    if (significantEnergies.length === 0) {
      // If no significant correlation, use the full range
      return [minEnergy, maxEnergy];
    }

    // Add padding to the significant range
    const padding = 0.1 * (maxEnergy - minEnergy);
    return [
      Math.max(minEnergy, significantEnergies[0] - padding),
      Math.min(
        maxEnergy,
        significantEnergies[significantEnergies.length - 1] + padding,
      ),
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
 * Initialize the interactive linking between spectrum and light curve plots
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

  // Log all plot IDs for debugging
  plotlyGraphs.forEach((plot, index) => {
    console.log(
      `Plot ${index + 1}: ID=${plot.id}, Container=${
        plot.closest('[id]')?.id || 'none'
      }`,
    );
  });

  // Find spectrum and light curve plots
  const { spectrumPlot, lightCurvePlot } = findPlots(plotlyGraphs);

  if (!spectrumPlot || !lightCurvePlot) {
    console.log(
      'Missing either spectrum or light curve plot - interactive linking cannot be enabled',
    );
    return;
  }

  console.log(`Spectrum plot ID: ${spectrumPlot.id}`);
  console.log(`Light curve plot ID: ${lightCurvePlot.id}`);

  // Set up click handlers for both plots
  setupClickHandler(spectrumPlot, lightCurvePlot, true);
  setupClickHandler(lightCurvePlot, spectrumPlot, false);

  // Add direct event listeners to ensure clicks are captured
  addDirectEventListeners(spectrumPlot, lightCurvePlot);

  // Force a check to ensure both plots have click handlers
  setTimeout(() => {
    console.log('Checking if click handlers were properly set up...');
    const spectrumHasHandler =
      spectrumPlot.getAttribute('data-interactive-linking') === 'true';
    const lightCurveHasHandler =
      lightCurvePlot.getAttribute('data-interactive-linking') === 'true';

    console.log(`Spectrum plot has handler: ${spectrumHasHandler}`);
    console.log(`Light curve plot has handler: ${lightCurveHasHandler}`);

    // If light curve doesn't have a handler, try to set it up again
    if (!lightCurveHasHandler) {
      console.log(
        'Light curve plot does not have a handler, trying to set it up again...',
      );
      setupClickHandler(lightCurvePlot, spectrumPlot, false);
    }

    // Add direct Plotly event handlers as a fallback
    if (typeof Plotly !== 'undefined') {
      console.log('Adding direct Plotly event handlers as fallback');

      // For light curve plot
      if (lightCurvePlot) {
        console.log(
          `Adding direct Plotly click handler to light curve plot: ${lightCurvePlot.id}`,
        );
        Plotly.on(lightCurvePlot, 'plotly_click', function (data) {
          console.log(
            'Direct Plotly click detected on light curve plot:',
            data,
          );
          if (data && data.points && data.points.length > 0) {
            const point = data.points[0];
            const xValue = point.x;

            // Define region around clicked point
            const rangeWidth = 0.5; // seconds for light curve
            const xRange = [xValue - rangeWidth, xValue + rangeWidth];

            console.log(
              `Highlighting light curve region: [${xRange[0]}, ${xRange[1]}] s`,
            );

            // Toggle highlighting
            if (
              highlightState.active &&
              highlightState.selectedRange &&
              Math.abs(highlightState.selectedRange[0] - xRange[0]) < 0.01
            ) {
              // If clicking on the same region, turn off highlighting
              resetHighlights(lightCurvePlot, spectrumPlot);
            } else {
              // Highlight new region
              const energyRange = mapTimeToEnergyRange(xRange, spectrumPlot);
              highlightRegion(
                spectrumPlot,
                lightCurvePlot,
                energyRange,
                xRange,
              );
            }
          }
        });
      }

      // For spectrum plot
      if (spectrumPlot) {
        console.log(
          `Adding direct Plotly click handler to spectrum plot: ${spectrumPlot.id}`,
        );
        Plotly.on(spectrumPlot, 'plotly_click', function (data) {
          console.log('Direct Plotly click detected on spectrum plot:', data);
          if (data && data.points && data.points.length > 0) {
            const point = data.points[0];
            const xValue = point.x;

            // Define region around clicked point
            const rangeWidth = 0.5; // keV for spectrum
            const xRange = [xValue - rangeWidth, xValue + rangeWidth];

            console.log(
              `Highlighting spectrum region: [${xRange[0]}, ${xRange[1]}] keV`,
            );

            // Toggle highlighting
            if (
              highlightState.active &&
              highlightState.selectedRange &&
              Math.abs(highlightState.selectedRange[0] - xRange[0]) < 0.01
            ) {
              // If clicking on the same region, turn off highlighting
              resetHighlights(spectrumPlot, lightCurvePlot);
            } else {
              // Highlight new region
              const timeRange = mapEnergyToTimeRange(xRange, lightCurvePlot);
              highlightRegion(spectrumPlot, lightCurvePlot, xRange, timeRange);
            }
          }
        });
      }
    }
  }, 500);

  console.log(
    'Interactive linking initialized between spectrum and light curve',
  );
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
    console.log(
      `Plot ${index + 1}: ID=${
        plot.id
      }, Container=${containerId}, Title=${title}`,
    );
  });

  // If we only have two plots, assume the first is spectrum and second is light curve
  if (plots.length === 2) {
    console.log(
      'Using heuristic: assuming first plot is spectrum and second is light curve',
    );
    spectrumPlot = plots[0];
    lightCurvePlot = plots[1];
    return { spectrumPlot, lightCurvePlot };
  }

  // Try to identify plots by their container ID or title
  for (const plot of plots) {
    // Check container ID
    const container = plot.closest('[id]');
    if (container) {
      const containerId = container.id.toLowerCase();
      if (containerId.includes('spectrum')) {
        spectrumPlot = plot;
        console.log(`Found spectrum plot by container: ${containerId}`);
      } else if (
        containerId.includes('light-curve') ||
        containerId.includes('lightcurve')
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

  // If still not identified, try to identify by axis labels
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

  // If still not identified, try to identify by data characteristics
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

  // If we still don't have both plots, make a best guess
  if (!spectrumPlot && !lightCurvePlot && plots.length >= 2) {
    console.log('Could not identify plots by any method, making best guess');
    spectrumPlot = plots[0];
    lightCurvePlot = plots[1];
  } else if (!spectrumPlot && plots.length >= 1) {
    console.log('Could not identify spectrum plot, using first plot');
    spectrumPlot = plots[0];
  } else if (!lightCurvePlot && plots.length >= 2) {
    console.log('Could not identify light curve plot, using second plot');
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
      `Setting up click handler for ${
        isSpectrum ? 'spectrum' : 'light curve'
      } plot ${plot.id}`,
    );

    // Mark the plot as having our handlers
    plot.setAttribute('data-interactive-linking', 'true');

    // Define the click handler
    const handleClick = function (data) {
      if (!data || !data.points || data.points.length === 0) {
        console.log(
          `Click detected on ${
            isSpectrum ? 'spectrum' : 'light curve'
          } plot but no points found`,
        );
        return;
      }

      console.log(
        `Click detected on ${isSpectrum ? 'spectrum' : 'light curve'} plot:`,
        data,
      );

      const point = data.points[0];
      const xValue = point.x;

      // Define region around clicked point
      const rangeWidth = isSpectrum ? 0.5 : 0.5; // keV for spectrum, seconds for light curve
      const xRange = [xValue - rangeWidth, xValue + rangeWidth];

      console.log(
        `Highlighting ${isSpectrum ? 'spectrum' : 'light curve'} region: [${
          xRange[0]
        }, ${xRange[1]}] ${isSpectrum ? 'keV' : 's'}`,
      );

      // Always highlight new region, don't toggle
      if (isSpectrum) {
        const timeRange = mapEnergyToTimeRange(xRange, otherPlot);
        highlightRegion(plot, otherPlot, xRange, timeRange);
      } else {
        const energyRange = mapTimeToEnergyRange(xRange, otherPlot);
        highlightRegion(otherPlot, plot, energyRange, xRange);
      }
    };

    // Comment out the double-click handler for now
    /*
    const handleDoubleClick = function() {
      console.log('Double-click detected - resetting highlights');
      resetHighlights(plot, otherPlot);
    };
    */

    // Use Plotly's event system
    if (typeof Plotly !== 'undefined' && typeof Plotly.on === 'function') {
      console.log(
        `Using Plotly event system for ${
          isSpectrum ? 'spectrum' : 'light curve'
        } plot`,
      );
      Plotly.on(plot, 'plotly_click', handleClick);
      // Plotly.on(plot, 'plotly_doubleclick', handleDoubleClick);
      console.log('Set up Plotly event handlers');
    } else {
      console.log('Plotly.on is not available, using fallback event handlers');
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
    const times = [...dataTrace.x].sort((a, b) => a - b);
    const minTime = times[0];
    const maxTime = times[times.length - 1];
    const totalTime = maxTime - minTime;

    // Calculate correlation weights for each time point
    const weights = times.map((time) => {
      const normalizedTime = (time - minTime) / totalTime;
      const expectedEnergy = ENERGY_TIME_CORRELATION.getExpectedEnergy(
        time - minTime,
        totalTime,
      );
      return ENERGY_TIME_CORRELATION.getCorrelationStrength(
        (energyRange[0] + energyRange[1]) / 2,
        time - minTime,
        totalTime,
      );
    });

    // Find the time range with significant correlation
    const threshold = 0.3; // Minimum correlation strength to consider
    const significantTimes = times.filter((_, i) => weights[i] > threshold);

    if (significantTimes.length === 0) {
      // If no significant correlation, use the full range
      return [minTime, maxTime];
    }

    // Add padding to the significant range
    const padding = 0.1 * (maxTime - minTime);
    return [
      Math.max(minTime, significantTimes[0] - padding),
      Math.min(
        maxTime,
        significantTimes[significantTimes.length - 1] + padding,
      ),
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
    if (!plot || !plot.data) return;

    const pointColor = 'rgb(255, 65, 54)'; // Red for spectrum highlight
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
      if (
        !trace.x ||
        !trace.y ||
        (trace.name && trace.name.toLowerCase().includes('background'))
      ) {
        return;
      }

      const colors = [];
      const opacities = [];
      const sizes = [];

      // Calculate the center of the selected range
      const rangeCenter = (xRange[0] + xRange[1]) / 2;
      const rangeWidth = xRange[1] - xRange[0];

      // Highlight points with smooth opacity gradient
      for (let j = 0; j < trace.x.length; j++) {
        const x = trace.x[j];
        const distanceFromCenter = Math.abs(x - rangeCenter);
        const normalizedDistance = distanceFromCenter / (rangeWidth / 2);

        // Calculate opacity based on distance from center
        const opacity = Math.max(0, 1 - normalizedDistance);

        // Calculate size based on opacity
        const size = 6 + opacity * 4;

        // Calculate color with opacity
        const color = `rgba(255, 65, 54, ${opacity})`;

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
    console.error('Error applying highlighting to spectrum:', error);
  }
}

/**
 * Apply highlighting to a light curve plot by modifying point colors and opacities
 * @param {HTMLElement} plot - The light curve plot element
 * @param {Array|null} timeRange - The time range to highlight [min, max] in seconds
 */
function applyHighlightingToLightCurve(plot, timeRange) {
  try {
    if (!plot || !plot.data) return;

    if (!timeRange) {
      console.log('No valid time range mapping - not modifying light curve');
      return;
    }

    const pointColor = 'rgb(50, 136, 189)'; // Blue for light curve highlight
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
      if (
        !trace.x ||
        !trace.y ||
        (trace.name && trace.name.toLowerCase().includes('background'))
      ) {
        return;
      }

      const colors = [];
      const opacities = [];
      const sizes = [];

      // Calculate the center of the selected range
      const rangeCenter = (timeRange[0] + timeRange[1]) / 2;
      const rangeWidth = timeRange[1] - timeRange[0];

      // Highlight points with smooth opacity gradient
      for (let j = 0; j < trace.x.length; j++) {
        const x = trace.x[j];
        const distanceFromCenter = Math.abs(x - rangeCenter);
        const normalizedDistance = distanceFromCenter / (rangeWidth / 2);

        // Calculate opacity based on distance from center
        const opacity = Math.max(0, 1 - normalizedDistance);

        // Calculate size based on opacity
        const size = 6 + opacity * 4;

        // Calculate color with opacity
        const color = `rgba(50, 136, 189, ${opacity})`;

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
      `Interactive linking initialized: ${
        graph.getAttribute('data-interactive-linking') === 'true' ? 'Yes' : 'No'
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
  // Add direct click handler to the light curve plot
  if (lightCurvePlot) {
    console.log('Adding direct click handler to light curve plot');

    // Try to get the plot container
    const container = lightCurvePlot.closest('[id]');
    if (container) {
      console.log(
        `Adding click handler to light curve container: ${container.id}`,
      );

      // Add a click handler to the container
      container.addEventListener('click', function (event) {
        console.log('Click detected on light curve container');

        // Try to get the click coordinates
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        console.log(`Click coordinates: (${x}, ${y})`);

        // Try to find the closest data point
        if (lightCurvePlot.data && lightCurvePlot.data.length > 0) {
          const trace = lightCurvePlot.data[0];
          if (trace.x && trace.y) {
            // Convert screen coordinates to data coordinates
            const xaxis = lightCurvePlot.layout.xaxis;
            const yaxis = lightCurvePlot.layout.yaxis;

            // Get the axis ranges
            const xmin = xaxis.range[0];
            const xmax = xaxis.range[1];
            const ymin = yaxis.range[0];
            const ymax = yaxis.range[1];

            // Convert screen coordinates to data coordinates
            const xData = xmin + (x / rect.width) * (xmax - xmin);

            // Find the closest data point
            let closestIndex = 0;
            let minDistance = Infinity;

            for (let i = 0; i < trace.x.length; i++) {
              const distance = Math.abs(trace.x[i] - xData);
              if (distance < minDistance) {
                minDistance = distance;
                closestIndex = i;
              }
            }

            console.log(
              `Closest data point: (${trace.x[closestIndex]}, ${trace.y[closestIndex]})`,
            );

            // Trigger highlighting
            triggerHighlighting(
              lightCurvePlot,
              spectrumPlot,
              trace.x[closestIndex],
              false,
            );
          }
        }
      });
    }
  }

  // Add direct click handler to the spectrum plot
  if (spectrumPlot) {
    console.log('Adding direct click handler to spectrum plot');

    // Try to get the plot container
    const container = spectrumPlot.closest('[id]');
    if (container) {
      console.log(
        `Adding click handler to spectrum container: ${container.id}`,
      );

      // Add a click handler to the container
      container.addEventListener('click', function (event) {
        console.log('Click detected on spectrum container');

        // Try to get the click coordinates
        const rect = container.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        console.log(`Click coordinates: (${x}, ${y})`);

        // Try to find the closest data point
        if (spectrumPlot.data && spectrumPlot.data.length > 0) {
          const trace = spectrumPlot.data[0];
          if (trace.x && trace.y) {
            // Convert screen coordinates to data coordinates
            const xaxis = spectrumPlot.layout.xaxis;
            const yaxis = spectrumPlot.layout.yaxis;

            // Get the axis ranges
            const xmin = xaxis.range[0];
            const xmax = xaxis.range[1];
            const ymin = yaxis.range[0];
            const ymax = yaxis.range[1];

            // Convert screen coordinates to data coordinates
            const xData = xmin + (x / rect.width) * (xmax - xmin);

            // Find the closest data point
            let closestIndex = 0;
            let minDistance = Infinity;

            for (let i = 0; i < trace.x.length; i++) {
              const distance = Math.abs(trace.x[i] - xData);
              if (distance < minDistance) {
                minDistance = distance;
                closestIndex = i;
              }
            }

            console.log(
              `Closest data point: (${trace.x[closestIndex]}, ${trace.y[closestIndex]})`,
            );

            // Trigger highlighting
            triggerHighlighting(
              spectrumPlot,
              lightCurvePlot,
              trace.x[closestIndex],
              true,
            );
          }
        }
      });
    }
  }
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
    `Triggering highlighting for ${
      isSpectrum ? 'spectrum' : 'light curve'
    } point: ${xValue}`,
  );

  // Define region around clicked point
  const rangeWidth = isSpectrum ? 0.5 : 0.5; // keV for spectrum, seconds for light curve
  const xRange = [xValue - rangeWidth, xValue + rangeWidth];

  console.log(
    `Highlighting ${isSpectrum ? 'spectrum' : 'light curve'} region: [${
      xRange[0]
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
