/* global PLOT_GRAPH_URL PLOT_GTI_URL CSRF_TOKEN MathJax */

import { columnLayout, dropdowns } from '../utils/utils.js';

/**
 * Generates a button for a suggested observation ID or source name that the
 * user can click to autocomplete.
 * @param {String} value Observation ID or source name
 * @param {JQuery<HTMLElement>} $container Dropdown container with search field
 * and container for options
 */
function addOption(value, $container) {
  const $OPTION = $('<button>', { type: 'button', text: value });

  $OPTION.on('click', () => {
    $container.find('.dropdown-field').val(value);
  });

  $container.find('.dropdown-content').append($OPTION);
}

/**
 * Searches for observation IDs and  that match the search field.
 *
 * Creates buttons for each observation ID or source name that matches the
 * search field.
 * @param {String} request Partial or complete observation ID or source name
 * request
 * @param {JQuery<HTMLElement>} $container Dropdown container with search field
 * and container for options
 */
function fetchOptions(request, $container) {
  fetch(`/plots/fetch_observations?${request}`)
    .then((response) => response.json())
    .then((data) => {
      // Generates buttons for each observation ID that matches the search field
      $container.find('.dropdown-content').html('');
      data.dir_suggestions.forEach((value) => addOption(value, $container));
    });
}

// TODO: Split up into smaller functions & add docstring
function displayInfo(info) {
  console.log('displayInfo called with:', info);

  // Define parameter sets for ObsID and GTI levels
  const SHARED_INFO = {
    headers: ['Source'],
    keys: ['OBJECT'],
    precision: [null],
  };

  const OBS_ID_INFO = {
    headers: [
      'ObsID',
      'Total GTIs',
      String.raw`RA \((^\circ)\)`,
      String.raw`DEC \((^\circ)\)`,
    ],
    keys: ['OBSID', 'GTI_COUNT', 'RA', 'DEC'],
    precision: [null, 0, 2, 2],
  };

  const GTI_INFO = {
    headers: [
      'Select',
      'GTI',
      'MJD',
      String.raw`Exposure Time \((s)\)`,
      'Detectors',
      String.raw`Undershoot Rate \((s^{-1})\)`,
      String.raw`Overshoot Rate \((s^{-1})\)`,
      String.raw`COR SAX \((GeV\ c^{-1})\)`,
    ],
    keys: [
      null,
      'GTI',
      'TSTART_MJD_UTC',
      'EXPTIME',
      'NDETS_USED',
      'USHOOT_NET_RATE',
      'OSHOOT_NET_RATE',
      'COR_SAX',
    ],
    precision: [null, null, 5, 2, 0, 2, 4, 3],
  };

  const $CONTAINER = $('#obs-info');
  const $OBS_ID_TABLE = $('#obs-info-table');
  $CONTAINER.show();

  if ($OBS_ID_TABLE.find('th').length == 0) {
    const $OBS_ID_HEADER = $('<tr>');
    [...OBS_ID_INFO.headers, ...SHARED_INFO.headers, 'Details'].forEach(
      (header) => {
        $OBS_ID_HEADER.append($(`<th>${header}</th>`));
      },
    );
    $OBS_ID_TABLE.append($OBS_ID_HEADER);
  }

  if (info && info.length > 0) {
    const OBS_BY_OBS_ID = info.reduce((acc, row) => {
      const OBS_ID = row.OBSID || '';
      if (!acc[OBS_ID]) {
        acc[OBS_ID] = [];
      }
      acc[OBS_ID].push(row);
      return acc;
    }, {});

    Object.entries(OBS_BY_OBS_ID).forEach(([obsID, rows]) => {
      const MAIN_ROW = rows[0];
      const $OBS_ID_ROW = $('<tr class="obs-row">');
      $OBS_ID_ROW.attr('data-obs-id', obsID);

      OBS_ID_INFO.keys.forEach((key, idx) => {
        let value =
          key === 'GTI_COUNT'
            ? rows.filter((r) => r.GTI !== undefined).length
            : MAIN_ROW[key];
        if (OBS_ID_INFO.precision[idx] !== null && value !== undefined) {
          value = Number(value).toFixed(OBS_ID_INFO.precision[idx]);
        }
        $OBS_ID_ROW.append($(`<td>${value || '-'}</td>`));
      });

      SHARED_INFO.keys.forEach((key, idx) => {
        let value = MAIN_ROW[key];
        if (SHARED_INFO.precision[idx] !== null && value !== undefined) {
          value = Number(value).toFixed(SHARED_INFO.precision[idx]);
        }
        $OBS_ID_ROW.append($(`<td>${value || '-'}</td>`));
      });

      const $SHOW_GTI_BUTTON = $('<button>', {
        class: 'toggle-details',
        'data-obs-id': obsID,
        text: 'Show GTIs',
      });
      $OBS_ID_ROW.append($('<td>').append($SHOW_GTI_BUTTON));

      const EXISTING_ROW = $OBS_ID_TABLE.find(
        `tr.obs-row[data-obs-id="${obsID}"]`,
      );
      if (EXISTING_ROW.length > 0) {
        EXISTING_ROW.replaceWith($OBS_ID_ROW);
      } else {
        $OBS_ID_TABLE.append($OBS_ID_ROW);
      }

      const $DETAILS_ROW = $('<tr>', {
        class: 'details-row',
        style: 'display: none',
        'data-obs-id': obsID,
      });
      const $DETAILS_CELL = $('<td>', {
        colspan: OBS_ID_INFO.headers.length + SHARED_INFO.headers.length + 1,
      });

      const $GTI_TABLE = $('<table>', {
        class: 'gti-table',
        'data-obs-id': obsID,
      });
      const $GTI_HEADER = $('<tr>');
      GTI_INFO.headers.forEach((header) => {
        $GTI_HEADER.append($('<th>', { text: header }));
      });
      $GTI_TABLE.append($GTI_HEADER);

      rows.forEach((gti) => {
        if (gti.GTI !== undefined) {
          const $GTI_ROW = $('<tr class="gti-row">');
          $GTI_ROW.attr('data-gti', gti.GTI);

          const $CHECKBOX_CELL = $('<td>');
          const $CHECKBOX = $('<input type="checkbox" class="gti-checkbox">');
          $CHECKBOX_CELL.append($CHECKBOX);
          $GTI_ROW.append($CHECKBOX_CELL);

          GTI_INFO.keys.slice(1).forEach((key, keyIdx) => {
            let value = gti[key];
            if (
              GTI_INFO.precision[keyIdx + 1] !== null &&
              value !== undefined
            ) {
              value = Number(value).toFixed(GTI_INFO.precision[keyIdx + 1]);
            }
            $GTI_ROW.append($(`<td>${value || '-'}</td>`));
          });

          $GTI_TABLE.append($GTI_ROW);
        }
      });

      const $SELECT_ALL = $('<input>', { type: 'checkbox' });
      $GTI_HEADER.find('th:first').append($SELECT_ALL);
      $GTI_HEADER
        .find('th:first')
        .contents()
        .wrapAll($('<label>', { class: 'checkboxes' }));

      const $GTI_FORM = $('<form>', {
        id: `info-fetch-gti-${obsID}`,
        class: 'fetch-gti',
      });

      $GTI_FORM.append(
        $('<input>', {
          name: 'gti-search',
          type: 'hidden',
          value: '',
        }),
      );

      $GTI_FORM.append(
        $('<input>', {
          name: 'plot_type',
          type: 'hidden',
          value: 'spectrum',
        }),
      );

      $GTI_FORM.append(
        $('<input>', {
          name: 'obs_id',
          type: 'hidden',
          value: obsID,
        }),
      );

      const $GRAPH_BUTTON = $('<button>', {
        class: 'graph-selected-gtis hide',
        text: 'Graph Selected GTIs',
        type: 'submit',
      });

      $SELECT_ALL.on('change', function () {
        const IS_CHECKED = $(this).is(':checked');
        $GTI_TABLE
          .find('.gti-checkbox')
          .prop('checked', IS_CHECKED)
          .trigger('change');
      });

      $GTI_TABLE.on('change', '.gti-checkbox', function () {
        const $form = $(this).closest('.details-row').find('.fetch-gti');
        const $graphButton = $form.find('.graph-selected-gtis');

        let selectedGTIs = [];
        $(this)
          .closest('.gti-table')
          .find('.gti-checkbox:checked')
          .each(function () {
            selectedGTIs.push($(this).closest('tr').attr('data-gti'));
          });

        $form.find('input[name="gti-search"]').val(selectedGTIs.join(','));
        $graphButton.toggle(selectedGTIs.length > 0);
      });

      $GTI_FORM.on('submit', function (event) {
        event.preventDefault();

        let formData = $(this).serialize();
        formData += `&csrfmiddlewaretoken=${$(
          "input[name='csrfmiddlewaretoken']",
        ).val()}`;
        formData += `&quality=${$('#quality-select').val().toLowerCase()}`;

        const $loadingIndicator = $('<div>', {
          class: 'loading-indicator',
          text: 'Generating plot...',
        });
        $(this).append($loadingIndicator);

        $.ajax({
          type: 'POST',
          url: PLOT_GTI_URL,
          data: formData,
          success: (response) => {
            if (response.error) {
              console.error('Server error:', response.error);
              alert(response.error);
              return;
            }

            if (response.plotDivs && response.plotDivs.length > 0) {
              const plotType = $(this).find('input[name="plot_type"]').val();
              const obsID = $(this).find('input[name="obs_id"]').val();

              $(`#${plotType}-${obsID}`)
                .find('.js-plotly-plot')
                .replaceWith(response.plotDivs[0]);

              MathJax.typeset();
            }
          },
          error: (xhr, status, error) => {
            console.error('Error fetching GTI plot:', error);
            console.error('Server response:', xhr.responseText);
            alert('Error fetching GTI plot. Please try again.');
          },
          complete: () => {
            $loadingIndicator.remove();
          },
        });
      });

      $SHOW_GTI_BUTTON.on('click', function (e) {
        e.preventDefault();
        const $detailsRow = $(this).closest('tr').next('.details-row');
        const isVisible = $detailsRow.is(':visible');
        $(this).text(isVisible ? 'Show GTIs' : 'Hide GTIs');
        $detailsRow.toggle();
      });

      $DETAILS_CELL.append($GTI_TABLE);
      $GTI_FORM.append($GRAPH_BUTTON);
      $DETAILS_CELL.append($GTI_FORM);
      $DETAILS_ROW.append($DETAILS_CELL);
      $OBS_ID_TABLE.append($DETAILS_ROW);
    });
  } else {
    $OBS_ID_TABLE.append(
      $(
        '<tr><td colspan="' +
          (OBS_ID_INFO.headers.length + SHARED_INFO.headers.length + 1) +
          '">No data available.</td></tr>',
      ),
    );
  }

  return $CONTAINER;
}

/**
 * Fetches and plots GTIs from the search field for the given plot type.
 * @param {Event} event Event generated by form submit
 */
function fetchGTIPlot(event) {
  event.preventDefault();
  const $form = $(event.target);

  let selectedGTIs = [];
  $form
    .closest('.details-row')
    .find('.gti-table .gti-checkbox:checked')
    .each(function () {
      selectedGTIs.push($(this).closest('tr').attr('data-gti'));
    });
  $form.find('input[name="gti-search"]').val(selectedGTIs.join(','));

  let formData = $form.serialize();
  formData += `&csrfmiddlewaretoken=${$(
    "input[name='csrfmiddlewaretoken']",
  ).val()}`;
  formData += `&quality=${$('#quality-select').val().toLowerCase()}`;

  const $loadingIndicator = $('<div>', {
    class: 'loading-indicator',
    text: 'Generating plot...',
  });
  $form.append($loadingIndicator);

  $.ajax({
    type: 'POST',
    url: PLOT_GTI_URL,
    data: formData,
    success: function (response) {
      if (response.error) {
        console.error('Server error:', response.error);
        alert(response.error);
        return;
      }
      if (response.plotDivs && response.plotDivs.length > 0) {
        const plotType = $form.find('input[name="plot_type"]').val();
        const obsID = $form.find('input[name="obs_id"]').val();

        $(`#${plotType}-${obsID}`)
          .find('.js-plotly-plot')
          .replaceWith(response.plotDivs[0]);

        MathJax.typeset();
      }
    },
    error: function (xhr, status, error) {
      console.error('Error fetching GTI plot:', error);
      console.error('Server response:', xhr.responseText);
      alert('Error fetching GTI plot. Please try again.');
    },
    complete: function () {
      $loadingIndicator.remove();
    },
  });
}

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
function GTISelection(maxGTI, obsID, plotType) {
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

/**
 * Fetches and displays the plots for the given observation ID,
 * pipeline quality, and plot types.
 *
 * @param {boolean} refresh If the page content should be refreshed
 * @param {Event} event Event generated by form submit
 */
function fetchGraphPlots(refresh, event) {
  const REGEX = /"title":\{"text":"(.+?)"\}/;
  let serializedData = $(event.target).serialize();

  // Prevents reloading the page
  event.preventDefault();

  // Adds information and security token to the request
  serializedData += `&csrfmiddlewaretoken=${$(
    "input[name='csrfmiddlewaretoken']",
  ).val()}`;
  serializedData += `&quality=${$('#quality-select').val().toLowerCase()}`;

  // Sends an asynchronous request to generate a plot with multiple GTIs
  $.ajax({
    type: 'POST',
    url: PLOT_GRAPH_URL,
    data: serializedData,
    success: function (response) {
      // Clear both obs-info and plots divs at the start
      if (refresh) {
        $('#add-obs').show();
        $('#plots').empty();
        $('#obs-info-table').empty();
        $('#remove-obs').empty();
      }

      if (response.error) {
        console.error('Error received:', response.error);
        alert(`<p class="error">${response.error}</p>`);
        return;
      }

      if (response.multiple_observations) {
        handleMultipleObservations(response.obs_ids, response.source);
        return;
      }

      if (!response.info || !response.plotDivs) {
        console.error('Unexpected response format:', response);
        alert('<p class="error">Unexpected response from server.</p>');
        return;
      }

      // Update info section
      displayInfo(response.info);

      // Update form values if observation info is provided
      if (response.obs_info) {
        Object.entries(response.obs_info).forEach(([key, value]) => {
          $(`#${key}`).val(value);
        });
      }

      // Process plots
      if (response.plotDivs.length > 0) {
        response.plotDivs.forEach((plotDiv, i) => {
          const PLOT_ID = REGEX.exec(plotDiv)[1]
            .toLowerCase()
            .replaceAll(' ', '-');
          const TYPE = PLOT_ID.replace(`-${response.obsID}`, '');

          // Create plot section if it doesn't exist
          if (!$(`#${TYPE}-section`).length) {
            const $PLOT_SECTION = $('<div>', {
              id: `${TYPE}-section`,
              class: 'plot-type-section',
            });
            $PLOT_SECTION.append(
              $('<h3>', {
                text: TYPE.replace('-', ' ').toUpperCase(),
              }),
            );

            const $COMBINE_FORM = $('<form>', { class: 'combine-gtis hide' });
            $COMBINE_FORM.append(
              $('<input>', { type: 'hidden', name: 'plot_type', value: TYPE }),
            );
            $COMBINE_FORM.append(
              $('<input>', {
                type: 'hidden',
                name: 'quality',
                value: $('#quality-select').val().toLowerCase(),
              }),
            );
            const $COMBINE_BUTTON = $('<button>', {
              type: 'submit',
              text: 'Combine GTIs from All Observations',
            });

            $COMBINE_FORM.append($COMBINE_BUTTON);
            $PLOT_SECTION.append($COMBINE_FORM);
            $('#plots').append($PLOT_SECTION);
          }

          // Add new observation to plot if not already present
          if ($(`#${PLOT_ID}`).length === 0) {
            // Create plot div with unique ID
            const $PLOT_DIV = $(plotDiv).attr('id', PLOT_ID);

            // Add GTI selection form
            const GTI_FORM = GTISelection(
              response.maxGTI[i],
              response.obsID,
              TYPE,
            );
            $PLOT_DIV.append(GTI_FORM);
            $(`#${TYPE}-section`).append($PLOT_DIV);
          }
          updateCombineButtonVisibility(TYPE);
        });
      } else {
        if (!$('#plots').children().length) {
          alert(
            '<p class="error">No plots available for this observation.</p>',
          );
        }
      }

      // Typeset any math expressions
      MathJax.typeset();

      // Add observation removal functionality
      if (!$(`#remove-${response.obsID}`).length) {
        const REMOVE_BUTTON = $('<button>', {
          id: `remove-${response.obsID}`,
          class: 'remove-observation-btn',
          text: `Remove Observation ${response.obsID}`,
        });

        REMOVE_BUTTON.click(function () {
          removePlots(response, REMOVE_BUTTON);
        });

        $('#remove-obs').append(REMOVE_BUTTON);
      }
    },
    error: function (_, textStatus, errorThrown) {
      console.error('AJAX error:', textStatus, errorThrown);
      alert(
        '<p class="error">An error occurred while fetching data. Please try again.</p>',
      );
    },
  });
}

function removePlots(response, removeButton) {
  // Remove plots for this observation
  $('.plot-type-section').each(function () {
    const TYPE = this.id.replace('-section', '');
    $(this).find(`#${TYPE}-${response.obsID}`).remove();

    if ($(this).children('div').length == 0) {
      $(this).remove();
    }

    updateCombineButtonVisibility(TYPE);
  });

  // Remove the info section for this observation
  $(`[data-obs-id="${response.obsID}"]`).remove();

  // Hide the table and add observation button
  if ($('#obs-info-table').find('tr').length <= 1) {
    $('#obs-info').hide();
    $('#add-obs').hide();
  }

  // Remove the remove button itself
  $(removeButton).remove();
}

function updateCombineButtonVisibility(plotType) {
  let obsIDs = new Set();
  // $('#obs-info-table')
  // .find('.obs-row')
  // .each(function () {
  //   activeObservations.add($(this).attr('data-obs-id'));
  // });
  $(`#${plotType}-section`)
    .children('div')
    .each(function () {
      obsIDs.add(this.id.replace(`${plotType}-`, ''));
    });

  $(`.combine-gtis:has(input[name="plot_type"][value="${plotType}"])`).toggle(
    obsIDs.size >= 2,
  );
}

function combineAndPlotGTIs(event) {
  // Create form data with the correct parameters
  const TYPE = $(event.target).children('input[name="plot_type"]').val();
  let obsIDs = new Set();
  let serializedData = $(event.target).serialize();

  event.preventDefault();

  $(`#${TYPE}-section`)
    .children('div')
    .each(function () {
      obsIDs.add(this.id.replace(`${TYPE}-`, ''));
    });

  // Adds information and security token to the request
  serializedData += `&csrfmiddlewaretoken=${$(
    "input[name='csrfmiddlewaretoken']",
  ).val()}`;
  serializedData += `&quality=${$('#quality-select').val().toLowerCase()}`;
  serializedData += `&combined_obs_ids=${Array.from(obsIDs).join(',')}`;

  // Show loading state
  const LOADING = $('<div>', {
    class: 'loading-message',
    text: 'Combining GTIs...',
  });
  $(`#${TYPE}-section`).prepend(LOADING);

  // Make the AJAX request
  $.ajax({
    type: 'POST',
    url: PLOT_GTI_URL,
    data: serializedData,
    success: function (data) {
      if (data.error) {
        console.error('Error:', data.error);
        alert('Error combining GTIs: ' + data.error);
        return;
      }

      // Create or update combined plot container
      const PLOT_ID = `${TYPE}-combined`;
      let combinedContainer = $(`#${PLOT_ID}-container`);

      if (!combinedContainer.length) {
        combinedContainer = $('<div>', {
          id: `${PLOT_ID}-container`,
          class: 'combined-plot-container',
        });
        combinedContainer.append('<h4>', { text: 'Combined GTIs Plot' });

        // Add remove button for combined plot
        const $REMOVE_BUTTON = $('<button>', {
          class: 'remove-combined-plot-btn',
          text: 'Remove Combined Plot',
        }).click(function () {
          combinedContainer.remove();
        });

        combinedContainer.append($REMOVE_BUTTON);
        $(`#${TYPE}-section`).append(combinedContainer);
      }

      // Update plot
      if (data.plotDivs && data.plotDivs.length > 0) {
        const $PLOT_DIV = $(data.plotDivs[0]).attr('id', PLOT_ID);
        combinedContainer.find('.plot-div').remove();
        combinedContainer.append($PLOT_DIV);
        MathJax.typeset();
      }
    },
    error: function (xhr, _, error) {
      console.error('Error combining GTIs:', error);
      console.error('Server response:', xhr.responseText);
      alert(
        'Error combining GTIs: ' +
          (xhr.responseJSON?.error || 'Please try again.'),
      );
    },
    complete: function () {
      LOADING.remove();
    },
  });
}

function handleMultipleObservations(observations, sourceName) {
  console.log('Handling multiple observations:', observations);

  const container = document.createElement('div');
  container.className = 'multiple-observations-container';

  const sourceHeader = document.createElement('h2');
  sourceHeader.className = 'source-name-header';
  sourceHeader.textContent = `Source: ${sourceName}`;
  container.appendChild(sourceHeader);

  const tablesGrid = document.createElement('div');
  tablesGrid.className = 'tables-grid';
  tablesGrid.style.display = 'flex';
  tablesGrid.style.flexDirection = 'column';
  tablesGrid.style.gap = '20px';
  tablesGrid.style.margin = '20px 0';

  const sourceSummaryPlaceholder = document.createElement('div');
  sourceSummaryPlaceholder.className = 'source-summary-placeholder';
  sourceSummaryPlaceholder.textContent = 'Loading source summary...';
  tablesGrid.appendChild(sourceSummaryPlaceholder);

  const observationsTablePlaceholder = document.createElement('div');
  observationsTablePlaceholder.className = 'observations-table-placeholder';
  observationsTablePlaceholder.textContent = 'Loading observations...';
  tablesGrid.appendChild(observationsTablePlaceholder);

  container.appendChild(tablesGrid);

  const plotsContainer = document.querySelector('#plots');
  plotsContainer.innerHTML = '';
  plotsContainer.appendChild(container);

  // Create the observations table structure in advance
  const observationsTable = document.createElement('div');
  observationsTable.className = 'info-table multiple-observations-table';

  const table = document.createElement('table');
  table.className = 'info-table';
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const headerRow = document.createElement('tr');
  [
    'Observation ID',
    'MJD (UTC)',
    'Date (UTC)',
    'Exposure Time (s)',
    'Undershoot Rate (s⁻¹)',
    'Overshoot Rate (s⁻¹)',
    '52-FPM Rate [0.5-12 keV] (s⁻¹)',
    'Action',
  ].forEach((headerText) => {
    const th = document.createElement('th');
    th.textContent = headerText;
    th.style.padding = '8px 12px';
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  table.appendChild(thead);
  table.appendChild(tbody);
  observationsTable.appendChild(table);

  const processObservations = async () => {
    for (const obs of observations) {
      const formData = new FormData();
      formData.append('obs_id', obs.obs_id);
      formData.append('quality', $('#quality-select').val().toLowerCase());
      formData.append(
        'csrfmiddlewaretoken',
        $("input[name='csrfmiddlewaretoken']").val(),
      );

      try {
        const response = await fetch(PLOT_GRAPH_URL, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();

        if (data.info && data.info.length > 0) {
          const firstGTI = data.info[0];
          const row = document.createElement('tr');
          row.className = 'obs-row';

          const mjdValue = parseFloat(firstGTI.TSTART_MJD_UTC);
          const dateInfo = mjdToDate(mjdValue);

          [
            [obs.obs_id || 'N/A', null],
            [firstGTI.TSTART_MJD_UTC, 5],
            [dateInfo.formattedWithoutSeconds, null],
            [firstGTI.EXPTIME, 2],
            [firstGTI.USHOOT_NET_RATE, 4],
            [firstGTI.OSHOOT_NET_RATE, 4],
            [firstGTI.GOODX_5_12_RATE, 4],
          ].forEach(([value, decimals]) => {
            const cell = document.createElement('td');
            cell.style.padding = '8px 12px';
            cell.style.borderBottom = '1px solid #ddd';
            if (value && decimals !== null) {
              const numValue = parseFloat(value);
              cell.textContent = isNaN(numValue)
                ? 'N/A'
                : numValue.toFixed(decimals);
            } else {
              cell.textContent = value || 'N/A';
            }
            row.appendChild(cell);
          });

          const actionCell = document.createElement('td');
          actionCell.style.padding = '8px 12px';
          actionCell.style.borderBottom = '1px solid #ddd';
          const selectButton = document.createElement('button');
          selectButton.textContent = 'Select';
          selectButton.className = 'select-observation-btn';
          selectButton.style.padding = '4px 8px';
          selectButton.style.borderRadius = '4px';
          selectButton.style.border = '1px solid #ccc';
          selectButton.style.cursor = 'pointer';
          selectButton.addEventListener('click', () => {
            $('#obs-id-dropdown').show();
            $('#source-name-dropdown').hide();
            $('#observation-search').val(obs.obs_id);
            $('#search-type').val('obs_id').change();
            container.remove();
          });
          actionCell.appendChild(selectButton);
          row.appendChild(actionCell);

          tbody.appendChild(row);
        }
      } catch (error) {
        console.error(
          `Error fetching details for observation ${obs.obs_id}:`,
          error,
        );
        const errorRow = document.createElement('tr');
        errorRow.className = 'obs-row';
        errorRow.innerHTML = `
          <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">${obs.obs_id}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">N/A</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">N/A</td>
          <td colspan="4" style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Error loading observation details</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">
            <button class="select-observation-btn" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer;">Select</button>
          </td>
        `;
        tbody.appendChild(errorRow);
      }
    }
  };

  fetchSourceSummary(observations)
    .then((summaryElement) => {
      sourceSummaryPlaceholder.replaceWith(summaryElement);

      return processObservations();
    })
    .then(() => {
      observationsTablePlaceholder.replaceWith(observationsTable);
    })
    .catch((error) => {
      console.error('Error processing observations:', error);
      observationsTablePlaceholder.textContent = 'Error loading observations.';
    });

  return container;
}

async function fetchSourceSummary(observations) {
  console.log('Fetching source summary for observations:', observations);

  const $container = $('<div class="source-summary-container">');
  const $table = $('<table class="info-table source-summary-table">');

  const $header = $('<tr>');
  ['Property', 'Value'].forEach((text) => {
    const $th = $('<th>');
    $th.text(text);
    $header.append($th);
  });
  $table.append($header);

  try {
    const observationDetails = await Promise.all(
      observations.map(async (obs) => {
        const formData = new FormData();
        formData.append('obs_id', obs.obs_id);
        formData.append('quality', $('#quality-select').val().toLowerCase());
        formData.append(
          'csrfmiddlewaretoken',
          $("input[name='csrfmiddlewaretoken']").val(),
        );

        const response = await fetch(PLOT_GRAPH_URL, {
          method: 'POST',
          body: formData,
        });
        const data = await response.json();
        return data.info;
      }),
    );

    const processedData = {
      totalObservations: observations.length,
      totalGTIs: 0,
      stats: {
        exposure: { values: [], min: null, max: null },
        undershoot: { values: [], min: null, max: null },
        overshoot: { values: [], min: null, max: null },
        mjd: { values: [], min: null, max: null },
        dates: { values: [] },
        corsax: { values: [], min: null, max: null },
        goodx_5_12_rate: { values: [], min: null, max: null },
      },
    };

    observationDetails.forEach((obsInfo) => {
      if (!Array.isArray(obsInfo)) return;

      const gtiCount = obsInfo.filter(
        (record) => record.GTI !== undefined,
      ).length;
      processedData.totalGTIs += gtiCount;

      const statsToProcess = [
        { key: 'exposure', prop: 'EXPTIME' },
        { key: 'undershoot', prop: 'USHOOT_NET_RATE' },
        { key: 'overshoot', prop: 'OSHOOT_NET_RATE' },
        { key: 'mjd', prop: 'TSTART_MJD_UTC' },
        { key: 'corsax', prop: 'COR_SAX' },
        { key: 'goodx_5_12_rate', prop: 'GOODX_5_12_RATE' },
      ];

      statsToProcess.forEach(({ key, prop }) => {
        const values = obsInfo
          .map((record) => parseFloat(record[prop]))
          .filter((val) => !isNaN(val));

        if (values.length > 0) {
          processedData.stats[key].values.push(...values);
          print(values);
        }
      });

      processedData.stats.dates.values.push(
        ...obsInfo
          .map((record) => parseFloat(record.TSTART_MJD_UTC))
          .filter((val) => !isNaN(val))
          .map((mjd) => mjdToDate(mjd).formattedWithoutSeconds),
      );
    });

    Object.values(processedData.stats).forEach((stat) => {
      if (stat.values && stat.values.length > 0) {
        stat.min = Math.min(...stat.values);
        stat.max = Math.max(...stat.values);
      }
    });

    const getAverage = (arr) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const formatMinMax = (min, max) =>
      min !== null && max !== null
        ? `${min.toFixed(5)}-${max.toFixed(5)}`
        : '-';

    const formatDateMinMax = (dates) =>
      dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : '-';

    const totalExposureTime = processedData.stats.exposure.values.reduce(
      (a, b) => a + b,
      0,
    );

    const summary = {
      'Total Observations': processedData.totalObservations,
      'Total GTIs': processedData.totalGTIs,
      'Date Range (UTC)': formatDateMinMax(processedData.stats.dates.values),
      'Average Exposure Time per Observation (s)':
        getAverage(processedData.stats.exposure.values)?.toFixed(2) || '-',
      'Exposure Time Range (s)': formatMinMax(
        processedData.stats.exposure.min,
        processedData.stats.exposure.max,
      ),
      'Total Exposure Time (s)': totalExposureTime?.toFixed(2) || '-',
      'Average MJD':
        getAverage(processedData.stats.mjd.values)?.toFixed(5) || '-',
      'MJD Range': formatMinMax(
        processedData.stats.mjd.min,
        processedData.stats.mjd.max,
      ),
      'Average Undershoot Rate (s⁻¹)':
        getAverage(processedData.stats.undershoot.values)?.toFixed(4) || '-',
      'Undershoot Rate Range (s⁻¹)': formatMinMax(
        processedData.stats.undershoot.min,
        processedData.stats.undershoot.max,
      ),
      'Average Overshoot Rate (s⁻¹)':
        getAverage(processedData.stats.overshoot.values)?.toFixed(4) || '-',
      'Overshoot Rate Range (s⁻¹)': formatMinMax(
        processedData.stats.overshoot.min,
        processedData.stats.overshoot.max,
      ),
      'Average COR_SAX (GeV c⁻¹)':
        getAverage(processedData.stats.corsax.values)?.toFixed(3) || '-',
      'COR_SAX Range (GeV c⁻¹)': formatMinMax(
        processedData.stats.corsax.min,
        processedData.stats.corsax.max,
      ),
      'Average 52-FPM Rate [0.5-12 keV] (s⁻¹)':
        getAverage(processedData.stats.goodx_5_12_rate.values)?.toFixed(4) ||
        '-',
      '52-FPM Rate [0.5-12 keV] Range (s⁻¹)': formatMinMax(
        processedData.stats.goodx_5_12_rate.min,
        processedData.stats.goodx_5_12_rate.max,
      ),
    };

    Object.entries(summary).forEach(([property, value]) => {
      const $row = $('<tr>');
      $row.append($(`<td class="property-cell">${property}</td>`));
      $row.append($(`<td class="value-cell">${value}</td>`));
      $table.append($row);
    });

    $container.append($table);
  } catch (error) {
    console.error('Error fetching source summary data:', error);
    $container.html(
      '<div class="error">Error loading source summary. Please try again.</div>',
    );
  }

  return $container[0];
}

function mjdToDate(mjd) {
  const JD = mjd + 2400000.5;

  const unixEpoch = JD - 2440587.5;

  const milliseconds = unixEpoch * 86400000;

  const date = new Date(milliseconds);

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  const monthName = months[date.getUTCMonth()];

  const day = date.getUTCDate();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();

  return {
    year: year,
    month: monthName,
    day: day,
    hours: hours,
    minutes: minutes,
    seconds: seconds,
    formatted: `${month.toString().padStart(2, '0')}/${day
      .toString()
      .padStart(2, '0')}/${year}`,
    fullFormatted: `${year}-${month.toString().padStart(2, '0')}-${day
      .toString()
      .padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${seconds.toString().padStart(2, '0')} UTC`,
    formattedWithoutSeconds: `${monthName} ${day}, ${year}`,
  };
}

// When the page loads add event listeners for different input fields
document.addEventListener('DOMContentLoaded', () => {
  dropdowns();

  $('#plot-graph').submit(function (event) {
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
});
