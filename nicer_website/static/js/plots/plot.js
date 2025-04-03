import { columnLayout, dropdowns } from './utils/utils.js';
import {
  displayInfo,
  handleMultipleObservations,
} from './components/observationInfo.js';
import {
  showPlotSelectionPopup,
  fetchGraphPlots,
  removePlots,
} from './components/graph.js';
import { fetchGTIPlot, combineAndPlotGTIs } from './components/gtiPlots.js';
import { fetchOptions, addOption } from './components/dropdowns.js';
import { downloadData } from './components/download.js';

document.addEventListener('DOMContentLoaded', () => {
  dropdowns();

  $('#plot-graph').submit(function (event) {
    event.preventDefault();
    fetchGraphPlots(true, event);
  });

  $('#add-obs').submit(function (event) {
    $('#options')
      .find('input:checked')
      .each(function () {
        $('#add-obs').append(
          $('<input>', {
            type: 'hidden',
            name: $(this).attr('name'),
            value: $(this).val(),
          }),
        );
      });

    event.preventDefault();
    fetchGraphPlots(false, event);
  });

  $('#observation-search').keyup(function () {
    fetchOptions(`obs_id=${this.value}`, $('#obs-id-dropdown'));
  });

  $('#additional-observation-search').keyup(function () {
    fetchOptions(`obs_id=${this.value}`, $('#add-obs-dropdown'));
  });

  $('#source-search').keyup(function () {
    fetchOptions(`source=${this.value}`, $('#source-name-dropdown'));
  });

  $('#add-obs-btn').click(function () {
    $('#add-obs-dropdown').toggle();
  });

  $('#search-type').change(function () {
    $('#obs-id-dropdown').toggle();
    $('#source-name-dropdown').toggle();
  });

  $('#advance-search-btn').click(function () {
    $('#advanced-search').toggle();
  });

  $('.change-quality').click(function () {
    $('#quality-select').val(this.textContent);
  });

  $(document).on('submit', '.fetch-gti', function (event) {
    fetchGTIPlot(event);
  });

  $(document).on('submit', '.combine-gtis', function (event) {
    combineAndPlotGTIs(event);
  });

  $(document).on('click', '.popup-close', function () {
    $('#plot-selection-popup').hide();
  });

  $(document).on('click', '.plot-button', function () {
    const obsID = $(this).data('obs-id');
    showPlotSelectionPopup(obsID);
  });

  $(document).on('click', '.download-data', function () {
    const dataType = $(this).data('type');
    const obsId = $(this).data('obs-id');
    const gtiNum = $(this).closest('tr').data('gti')?.replace('GTI', '');
    const quality = $('#quality-select').val();

    if (dataType === 'gti' && gtiNum) {
      downloadData(dataType, obsId, null, [gtiNum], quality);
    } else {
      downloadData(dataType, obsId, null, null, quality);
    }
  });

  $(document).on('change', '.gti-checkbox', function () {
    const $table = $(this).closest('table');
    const hasChecked = $table.find('.gti-checkbox:checked').length > 0;
    $table.siblings('.selected-gti-actions').toggle(hasChecked);
  });

  $(document).on('click', '.download-selected-gtis', function () {
    const $table = $(this).closest('.obs-info-container').find('table');
    const obsId = $table.find('tr:first').data('obs-id');
    const selectedGtis = [];
    const quality = $('#quality-select').val();

    $table.find('.gti-checkbox:checked').each(function () {
      const gtiNum = $(this).closest('tr').data('gti').replace('GTI', '');
      selectedGtis.push(gtiNum);
    });

    if (selectedGtis.length > 0) {
      downloadData('gti', obsId, null, selectedGtis, quality);
    }
  });
});
