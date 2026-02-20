import { columnLayout } from '../utils/utils.js';
import { startOperation, completeOperation, errorOperation, updateOperationMessage, clearOperationsByPattern, completeOperationsByPattern } from './statusBar.js';

/**
 * Generates a GTI selection field for a specific plot
 * for the user to select which GTIs to plot.
 * @param {number} maxGTI Maximum GTI number for the plot type
 * and observation ID
 * @param {number} obsID Observation ID for the plot
 * @param {String} plotType Which plot is the GTI selection field being added to
 * @returns {JQuery<HTMLFormElement>} HTML form element containing
 * the GTI selection field and submit button
 */
export function GTISelection(maxGTI, obsID, plotType) {
  // Constants
  const $FORM = $('<form>', { class: 'fetch-gti' });
  const cleanPlotType = plotType.replace(`-${obsID}`, '');
  const $TYPE = $('<input>', {
    name: 'plot_type',
    type: 'hidden',
    value: cleanPlotType,
  });
  const $OBS_ID = $('<input>', {
    name: 'obs_id',
    type: 'hidden',
    value: obsID,
  });
  const $SEARCH = $('<input>', {
    name: 'gti-search',
    type: 'text',
    placeholder: `GTI numbers (,) and/or range (-) between 0 and ${maxGTI}`,
  });
  const $MIN_SLIDER = $(`<input>`, {
    id: `${cleanPlotType}-min-slider`,
    name: 'min_value',
    type: 'range',
    min: 1,
    max: 200,
    value: 1,
  });
  const $MIN_VALUE = $('<p>', {
    id: `${cleanPlotType}-min-value`,
    text: 'Binning: 1 counts',
  });
  const $SUBMIT = $('<button>', { type: 'submit', text: 'Submit' });

  // Adds elements to the form
  $FORM.append($TYPE);
  $FORM.append($OBS_ID);
  $FORM.append(columnLayout([$SEARCH, $SUBMIT]));
  $FORM.append(columnLayout([$MIN_SLIDER, $MIN_VALUE]));

  // Update slider value on change and trigger form submission
  let sliderTimeout;
  let currentBinningOperationId = null;
  let lastSliderValue = 1;

  $MIN_SLIDER.on('input', function () {
    const newValue = $(this).val();
    console.log(
      `[DEBUG gtiComponents.js] Slider input changed for ${cleanPlotType}. New value: ${newValue}`,
    );
    $(`#${cleanPlotType}-min-value`).html(`Binning: ${newValue} counts`);
    lastSliderValue = newValue;

    // Clear previous timeout
    if (sliderTimeout) {
      clearTimeout(sliderTimeout);
    }

    // Debounce the form submission
    sliderTimeout = setTimeout(() => {
      // Complete any existing binning operations for this plot type before creating a new one
      const binningPattern = 'gti-change-' + cleanPlotType + '-' + obsID;
      completeOperationsByPattern(binningPattern);

      // Start a new operation
      currentBinningOperationId = 'gti-change-' + cleanPlotType + '-' + obsID;
      startOperation(currentBinningOperationId, 'Updating ' + cleanPlotType.replace(/_/g, ' ') + ' plot...');

      console.log(
        `[DEBUG gtiComponents.js] About to submit form for slider change`,
      );
      // Automatically submit the form when the slider value changes
      // This will trigger the fetchGTIPlot function
      $FORM.submit();
    }, 300); // 300ms debounce
  });

  let gtiTimeout;
  let currentGtiOperationId = null;
  let lastGtiValue = '';

  $SEARCH.on('input', function () {
    const newGTIs = $(this).val();
    console.log(
      `[DEBUG gtiComponents.js] GTI search input changed for ${cleanPlotType}. New value: ${newGTIs}`,
    );
    lastGtiValue = newGTIs;

    // Clear previous timeout
    if (gtiTimeout) {
      clearTimeout(gtiTimeout);
    }

    // Debounce the form submission
    gtiTimeout = setTimeout(() => {
      // Complete any existing GTI operations for this plot type before creating a new one
      const gtiPattern = 'gti-change-' + cleanPlotType + '-' + obsID;
      completeOperationsByPattern(gtiPattern);

      // Start a new operation
      currentGtiOperationId = 'gti-change-' + cleanPlotType + '-' + obsID;
      const gtiText = lastGtiValue ? 'GTI ' + lastGtiValue : 'selected GTIs';
      startOperation(currentGtiOperationId, 'Updating ' + cleanPlotType.replace(/_/g, ' ') + ' plot...');

      console.log(
        `[DEBUG gtiComponents.js] About to submit form for GTI search change`,
      );
      // Automatically submit the form when the search input changes
      $FORM.submit();
    }, 500); // 500ms debounce for text input
  });

  return $FORM;
}
