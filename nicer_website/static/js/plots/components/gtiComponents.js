import { columnLayout } from '../utils/utils.js';

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

    // Update slider value on change
    $MIN_SLIDER.on('input', function () {
        $(`#${plotType}-min-value`).html(
            `Value: ${$(`#${plotType}-min-slider`).val()} counts`,
        );
    });

    return $FORM;
}