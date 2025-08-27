import { columnLayout } from '../utils/utils.js';
import { startOperation, completeOperation, errorOperation } from './statusBar.js';

/**
 * Generates a GTI selection field for a specific plot
 * for the user to select which GTIs to plot.
 * @param {number} maxGTI Maximum GTI number for the plot type
 * and observation ID
 * @param {number} obsID Observation ID for the plot
 * @param {String} plotType Which plot is the GTI selection field being added to
 * @returns {HTMLFormElement} HTML form element containing
 * the GTI selection field and submit button
 */
export function GTISelection(maxGTI, obsID, plotType) {
  // Constants
  const $FORM = $('<form>', { class: 'fetch-gti' });
  const $TYPE = $('<input>', {
    name: 'plot_type',
    type: 'hidden',
    value: plotType.replace(`-${obsID}`, ''),
  });
  const $OBS_ID = $('<input>', {
    name: 'obs_id',
    type: 'hidden',
    value: obsID,
  });
  const $SEARCH = $('<input>', {
    name: 'gti-search',
    type: 'text',
    placeholder: `GTI numbers (,) and/or range (-) between 0 and ${maxGTI - 1}`,
  });
  const $MIN_SLIDER = $(`<input>`, {
    id: `${plotType}-min-slider`,
    name: 'min_value',
    type: 'range',
    min: 1,
    max: 200,
    value: 1,
  });
  const $MIN_VALUE = $('<p>', {
    id: `${plotType}-min-value`,
    text: 'Value: 1 counts',
  });
  const $SUBMIT = $('<button>', { type: 'submit', text: 'Submit' });

  // Adds elements to the form
  $FORM.append($TYPE);
  $FORM.append($OBS_ID);
  $FORM.append(columnLayout([$SEARCH, $SUBMIT]));
  $FORM.append(columnLayout([$MIN_SLIDER, $MIN_VALUE]));

  // Update slider value on change and trigger form submission
  $MIN_SLIDER.on('input', function () {
    const newValue = $(this).val();
    console.log(
      `[DEBUG gtiComponents.js] Slider input changed for ${plotType}. New value: ${newValue}`,
    );
    $(`#${plotType}-min-value`).html(`Value: ${newValue} counts`);
    
    // Start status tracking for binning change
    const operationId = 'binning-change-' + Date.now();
    startOperation(operationId, 'Updating ' + plotType.replace(/_/g, ' ') + ' plot with binning value ' + newValue + '...');
    
    console.log(
      `[DEBUG gtiComponents.js] About to submit form for slider change`,
    );
    // Automatically submit the form when the slider value changes
    // This will trigger the fetchGTIPlot function
    $FORM.submit();
  });

  $SEARCH.on('change', function () {
    const newGTIs = $(this).val();
    console.log(
      `[DEBUG gtiComponents.js] GTI search input changed for ${plotType}. New value: ${newGTIs}`,
    );
    
    // Start status tracking for GTI change
    const operationId = 'gti-change-' + Date.now();
    const gtiText = newGTIs ? 'GTI ' + newGTIs : 'selected GTIs';
    startOperation(operationId, 'Updating ' + plotType.replace(/_/g, ' ') + ' plot for ' + gtiText + '...');
    
    console.log(
      `[DEBUG gtiComponents.js] About to submit form for GTI search change`,
    );
    // Automatically submit the form when the search input changes
    $FORM.submit();
  });

  return $FORM;
}
