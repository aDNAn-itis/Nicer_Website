/* global PLOT_GRAPH_URL PLOT_GTI_URL MathJax quality:writable */

import { columnLayout, dropdowns } from '../utils/utils.js';

let currentObservations = new Set();

function createAddObservationButton() {
  const addButton = document.createElement('button');
  addButton.textContent = 'Add Another Observation';
  addButton.className = 'add-observation-btn';
  addButton.type = 'button';

  const addForm = document.createElement('div');
  addForm.className = 'add-observation-form';
  addForm.style.display = 'none';
  addForm.innerHTML = `
    <div class="row">
      <div class="column">
        <input type="text" class="additional-obs-input dropdown-field" placeholder="Enter Observation ID...">
        <div class="dropdown-content additional-obs-suggestions"></div>
      </div>
      <div class="column">
        <button type="button" class="add-obs-submit">Add</button>
      </div>
    </div>
  `;

  return { addButton, addForm };
}

async function addNewObservation(obsID) {
  if (currentObservations.has(obsID)) {
    alert('This observation is already displayed');
    return;
  }

  const formData = new FormData();
  formData.append('obs_id', obsID);
  formData.append('quality', quality);
  formData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

  try {
    const response = await fetch(PLOT_GRAPH_URL, {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.error) {
      console.error("Error:", data.error);
      return;
    }

    currentObservations.add(obsID);

    const section = document.createElement('div');
    section.className = 'observation-section';
    section.dataset.obsId = obsID;

    const infoDiv = document.createElement('div');
    infoDiv.className = 'obs-info-section';
    infoDiv.appendChild(displayInfo(data.info));
    section.appendChild(infoDiv);

    if (data.plotDivs && data.plotDivs.length > 0) {
      const plotsDiv = document.createElement('div');
      plotsDiv.className = 'plots-section';

      data.plotDivs.forEach((plotDiv, i) => {
        const type = /"title":\{"text":"(.+?)"\}/.exec(plotDiv)[1]
          .toLowerCase()
          .replaceAll(' ', '_');
        const $plotDiv = $(plotDiv).attr('id', `${type}_${obsID}`);
        plotsDiv.appendChild($plotDiv[0]);

        const gtiSelection = GTISelection(data.maxGTI[i], `${type}_${obsID}`);
        plotsDiv.appendChild(gtiSelection[0]);
      });

      section.appendChild(plotsDiv);
    }


    document.getElementById('plots').appendChild(section);
    MathJax.typeset();

  } catch (error) {
    console.error("Error fetching new observation:", error);
  }
}

/**
 * Updates the quality setting when the user activates a quality button.
 * @param {String} buttonQuality Pipeline quality value of the activated
 */
function changeQuality(buttonQuality) {
  quality = buttonQuality.toLowerCase();
  document.querySelector('#quality-select').value = buttonQuality;
}

/**
 * Generates a button for a suggested observation
 * ID that the user can click to autocomplete.
 * @param {String} obsID Observation ID
 */
function addObservation(obsID) {
  const OPTION = document.createElement('button');

  OPTION.setAttribute('type', 'button');
  OPTION.innerHTML = obsID;

  // If button is clicked, set the search field to the
  // observation ID of the clicked button
  OPTION.addEventListener('click', () => {
    document.querySelector('#observation-search').value = obsID;
  });

  document.querySelector('#observation-options').append(OPTION);
}

/**
 * Searches for observation IDs that match the search field.
 *
 * Creates buttons for each observation ID that matches the search field.
 * @param {String} obsID Partial or complete observation ID
 */
function fetchObsOptions(obsID) {
  fetch(`/plots/fetch_observations?obs_id=${obsID}`)
    .then((response) => response.json())
    .then((data) => {
      // Generates buttons for each observation ID that matches the search field
      document.querySelector('#observation-options').innerHTML = '';
      data.dir_suggestions.forEach(addObservation);
    });
}

/**
 * Searches for source names that match the search field.
 *
 * Creates buttons for each source name that matches the search field.
 * @param {String} sourceName Partial or complete source name
 */
function fetchSourceOptions(sourceName) {
  fetch(`/plots/fetch_observations?source=${sourceName}`)
    .then((response) => response.json())
    .then((data) => {
      // Generates buttons for each source name that matches the search field
      document.querySelector('#source-options').innerHTML = '';
      data.dir_suggestions.forEach(addSourceObservation);
    });
}

/**
 * Generates a button for a suggested source name
 * that the user can click to autocomplete.
 * @param {String} sourceName Source name
 */
function addSourceObservation(sourceName) {
  const OPTION = document.createElement('button');

  OPTION.setAttribute('type', 'button');
  OPTION.innerHTML = sourceName;

  // If button is clicked, set the search field to the
  // source name of the clicked button
  OPTION.addEventListener('click', () => {
    document.querySelector('#source-search').value = sourceName;
  });

  document.querySelector('#source-options').append(OPTION);
}


function displayInfo(info) {
  console.log("displayInfo called with:", info);

  // Define parameter sets for ObsID and GTI levels
  const SHARED_INFO = {
    headers: ['Source'],
    keys: ['OBJECT'],
    precision: [null]
  };

  const OBSID_INFO = {
    headers: [
      'ObsID',
      'Total GTIs',
      String.raw`RA \((^\circ)\)`,
      String.raw`DEC \((^\circ)\)`,
    ],
    keys: [
      'OBSID',
      'GTI_COUNT',
      'RA',
      'DEC',
    ],
    precision: [null, 0, 2, 2]
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
    precision: [null, null, 5, 2, 0, 2, 4, 3]
  };

  const $CONTAINER = $('<div class="info-container">');

  let $OBSID_TABLE = $('.obsid-table');
  if ($OBSID_TABLE.length === 0) {
    $OBSID_TABLE = $('<table class="info-table obsid-table">');
    const $OBSID_HEADER = $('<tr>');
    [...OBSID_INFO.headers, ...SHARED_INFO.headers, 'Details'].forEach(header => {
      $OBSID_HEADER.append($(`<th>${header}</th>`));
    });
    $OBSID_TABLE.append($OBSID_HEADER);
    $CONTAINER.append($OBSID_TABLE);
  }

  if (info && info.length > 0) {
    const obsByObsId = info.reduce((acc, row) => {
      const obsId = row.OBSID || '';
      if (!acc[obsId]) {
        acc[obsId] = [];
      }
      acc[obsId].push(row);
      return acc;
    }, {});

    Object.entries(obsByObsId).forEach(([obsId, rows], index) => {
      const mainRow = rows[0];

      const $ROW_GROUP = $('<tbody class="obs-group">');
      const $OBSID_ROW = $('<tr class="obs-row">');
      $OBSID_ROW.attr('data-obs-id', obsId);

      OBSID_INFO.keys.forEach((key, idx) => {
        let value = key === 'GTI_COUNT'
          ? rows.filter(r => r.GTI !== undefined).length
          : mainRow[key];
        if (OBSID_INFO.precision[idx] !== null && value !== undefined) {
          value = Number(value).toFixed(OBSID_INFO.precision[idx]);
        }
        $OBSID_ROW.append($(`<td>${value || '-'}</td>`));
      });

      SHARED_INFO.keys.forEach((key, idx) => {
        let value = mainRow[key];
        if (SHARED_INFO.precision[idx] !== null && value !== undefined) {
          value = Number(value).toFixed(SHARED_INFO.precision[idx]);
        }
        $OBSID_ROW.append($(`<td>${value || '-'}</td>`));
      });

      $OBSID_ROW.append($(`<td><button class="toggle-details">Show GTIs</button></td>`));

      const existingRow = $OBSID_TABLE.find(`tr.obs-row[data-obs-id="${obsId}"]`);
      if (existingRow.length > 0) {
        existingRow.replaceWith($OBSID_ROW);
      } else {
        $ROW_GROUP.append($OBSID_ROW);
        $OBSID_TABLE.append($ROW_GROUP);
      }

      const $DETAILS_ROW = $('<tr class="details-row" style="display: none;">');
      const $DETAILS_CELL = $('<td colspan="' + (OBSID_INFO.headers.length + SHARED_INFO.headers.length + 1) + '">');

      const $GTI_TABLE = $('<table class="gti-table">');
      const $GTI_HEADER = $('<tr>');

      GTI_INFO.headers.forEach(header => {
        $GTI_HEADER.append($(`<th>${header}</th>`));
      });
      $GTI_TABLE.append($GTI_HEADER);

      const $GRAPH_BUTTON_CONTAINER = $('<div class="graph-button-container" style="display: none; margin: 10px 0;">');
      const $GRAPH_BUTTON = $('<button class="graph-selected-gtis" style="display: none;">Graph Selected GTIs</button>');
      $GRAPH_BUTTON_CONTAINER.append($GRAPH_BUTTON);
      $DETAILS_CELL.append($GRAPH_BUTTON_CONTAINER);

      rows.forEach((gti, idx) => {
        if (gti.GTI !== undefined) {
          const $GTI_ROW = $('<tr class="gti-row">');
          $GTI_ROW.attr('data-gti', gti.GTI);

          const $CHECKBOX_CELL = $('<td>');
          const $CHECKBOX = $('<input type="checkbox" class="gti-checkbox">');
          $CHECKBOX_CELL.append($CHECKBOX);
          $GTI_ROW.append($CHECKBOX_CELL);

          GTI_INFO.keys.slice(1).forEach((key, keyIdx) => {
            let value = gti[key];
            if (GTI_INFO.precision[keyIdx + 1] !== null && value !== undefined) {
              value = Number(value).toFixed(GTI_INFO.precision[keyIdx + 1]);
            }
            $GTI_ROW.append($(`<td>${value || '-'}</td>`));
          });

          $GTI_TABLE.append($GTI_ROW);
        }
      });

      $DETAILS_CELL.append($GTI_TABLE);
      $DETAILS_ROW.append($DETAILS_CELL);
      $ROW_GROUP.append($DETAILS_ROW);
      $OBSID_TABLE.append($ROW_GROUP);

      $GTI_TABLE.on('change', '.gti-checkbox', function() {
        const $graphButton = $(this).closest('.details-row').find('.graph-selected-gtis');
        const hasCheckedBoxes = $(this).closest('.gti-table').find('.gti-checkbox:checked').length > 0;
        $graphButton.toggle(hasCheckedBoxes);
        $graphButton.closest('.graph-button-container').toggle(hasCheckedBoxes);
      });

      $GRAPH_BUTTON.on('click', function() {
        const $table = $(this).closest('.details-row').find('.gti-table');
        const selectedGTIs = [];
        $table.find('.gti-checkbox:checked').each(function() {
          selectedGTIs.push($(this).closest('tr').attr('data-gti'));
        });

        if (selectedGTIs.length > 0) {
          const gtiString = selectedGTIs.join(',');
          const $gtiForm = $(this).closest('.observation-container').find('.fetch-gti');
          $gtiForm.find('input[name="gti-search"]').val(gtiString);
          $gtiForm.submit();
        }
      });
    });
  } else {
    $OBSID_TABLE.append($('<tr><td colspan="' + (OBSID_INFO.headers.length + SHARED_INFO.headers.length + 1) + '">No data available.</td></tr>'));
  }

  $CONTAINER.on('click', '.toggle-details', function(e) {
    e.preventDefault();
    const $detailsRow = $(this).closest('tr').next('.details-row');
    const isVisible = $detailsRow.is(':visible');

    $(this).text(isVisible ? 'Show GTIs' : 'Hide GTIs');
    $detailsRow.toggle();
  });

  return $CONTAINER;
}

/**
 * Fetches and plots GTIs from the search field for the given plot type.
 * @param {String} obsID Observation ID
 */
function fetchGTIPlot(obsID) {
  $('.fetch-gti').submit(function (e) {
    // Constants
    const REGEX = /"title":\{"text":"(.+?)"\}/;
    let serializedData = $(this).serialize();

    // Prevents reloading the page
    e.preventDefault();

    serializedData += `&csrfmiddlewaretoken=${$(
      "input[name='csrfmiddlewaretoken']",
    ).val()}`;
    serializedData += `&quality=${quality}`;
    serializedData += `&obs_id=${obsID}`;

    // Sends an asynchronous request to generate a plot with multiple GTIs
    $.ajax({
      type: 'POST',
      url: PLOT_GTI_URL,
      data: serializedData,
      success: function (response) {
        // Gets information on the plot type
        const NAME = REGEX.exec(response.plotDivs[0])[1]
          .toLowerCase()
          .replaceAll(' ', '_');
        const $PLOT_DIV = $(response.plotDivs[0]).attr('id', NAME);

        // Updates the plot with the GTIs
        $(`#${NAME}`).replaceWith($PLOT_DIV);
      },
    });
  });
}

/**
 * Generates a GTI selection field for a specific plot
 * for the user to select which GTIs to plot.
 * @param {number} maxGTI Maximum GTI number for the plot type
 * and observation ID
 * @param {String} plotType Which plot is the GTI selection field being added to
 * @returns {HTMLFormElement} HTML form element containing
 * the GTI selection field and submit button
 */
function GTISelection(maxGTI, plotType) {
  // Constants
  const $FORM = $('<form class="fetch-gti">');
  const $TYPE = $(`<input name="plot_type" type="hidden" value="${plotType}">`);
  const $SEARCH = $(
    '<input name="gti-search" type="text" ' +
      `placeholder="GTI numbers (,) and/or range (-) between 0 and ${
        maxGTI - 1
      }">`,
  );
  const $MIN_SLIDER = $(
    `<input id="${plotType}-min-slider" name="min_value" ` +
      'type="range" min="1" max="200" value="1">',
  );
  const $MIN_VALUE = $(`<p id="${plotType}-min-value">Value: 1 counts</p>`);
  const $SUBMIT = $('<button type="submit">Submit</button>');

  // Adds elements to the form
  $FORM.append($TYPE);
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
 */
function fetchGraphPlots() {
  $('#plot-graph').submit(function(e) {
    // Constants
    let SERIALIZED_DATA = $(this).serialize();
    const TYPE_REGEX = /"title":\{"text":"(.+?)"\}/;

    // Prevents reloading the page
    e.preventDefault();

    // Adds information and security token to the request
    SERIALIZED_DATA += `&csrfmiddlewaretoken=${$(
      "input[name='csrfmiddlewaretoken']",
    ).val()}`;
    SERIALIZED_DATA += `&quality=${quality}`;

    // Sends an asynchronous request to generate a plot with multiple GTIs
    $.ajax({
      type: 'POST',
      url: PLOT_GRAPH_URL,
      data: SERIALIZED_DATA,
      success: function(response) {
        // Clear both obs-info and plots divs at the start
        $('#obs-info').empty();
        $('#plots').empty();

        if (response.error) {
          console.error("Error received:", response.error);
          $('#plots').html(`<p class="error">${response.error}</p>`);
          return;
        }

        if (response.multiple_observations) {
          handleMultipleObservations(response.obs_ids, response.source);
          return;
        }

        if (response.info && response.plotDivs) {
          const obsContainer = $('<div class="observation-container"></div>');

          const infoSection = $('<div class="info-section"></div>');
          infoSection.append(displayInfo(response.info));
          obsContainer.append(infoSection);

          if (response.obs_info) {
            $('#ra').val(response.obs_info.ra);
            $('#dec').val(response.obs_info.dec);
            $('#tstart_tt').val(response.obs_info.tstart_tt);
            $('#tstop_tt').val(response.obs_info.tstop_tt);
            $('#ndets_used').val(response.obs_info.ndets_used);
            $('#ushoot_net_rate').val(response.obs_info.ushoot_net_rate);
            $('#oshoot_net_rate').val(response.obs_info.oshoot_net_rate);
          }

          const plotsSection = $('<div class="plots-section"></div>');

          if (response.plotDivs.length > 0) {
            response.plotDivs.forEach((plotDiv, i) => {
              const TYPE = TYPE_REGEX.exec(plotDiv)[1]
                .toLowerCase()
                .replaceAll(' ', '_');
              const PLOT_DIV = $(plotDiv).attr('id', TYPE);

              plotsSection.append(PLOT_DIV);
              plotsSection.append(GTISelection(response.maxGTI[i], TYPE));
              fetchGTIPlot(response.obsID, TYPE);
            });
          } else {
            plotsSection.html('<p class="error">No plots available for this observation.</p>');
          }

          obsContainer.append(plotsSection);


          $('#plots').append(obsContainer);

          if (!$('.add-observation-section').length) {
            const addSection = $(`
          <div class="add-observation-section">
            <button class="add-observation-btn">Add Another Observation</button>
            <div class="add-observation-form" style="display: none;">
              <div class="input-group">
                <input type="text" class="additional-obs-input" placeholder="Enter Observation ID...">
                <div class="dropdown-content additional-obs-suggestions"></div>
                <button type="button" class="add-obs-submit">Add</button>
              </div>
            </div>
          </div>
        `);

            addSection.find('.add-observation-btn').click(function() {
              addSection.find('.add-observation-form').toggle();
            });

            addSection.find('.additional-obs-input').on('keyup', function() {
              fetchObsOptions($(this).val());
            });

            addSection.find('.add-obs-submit').click(function() {
              const newObsId = addSection.find('.additional-obs-input').val();
              if (newObsId) {
                let newData = new FormData();
                newData.append('obs_id', newObsId);
                newData.append('quality', quality);
                newData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

                $.ajax({
                  type: 'POST',
                  url: PLOT_GRAPH_URL,
                  data: newData,
                  processData: false,
                  contentType: false,
                  success: function(additionalResponse) {
                    if (!additionalResponse.error) {
                      // Process the new observation similarly to the first one
                      const newObsContainer = $('<div class="observation-container"></div>');
                      newObsContainer.append(displayInfo(additionalResponse.info));

                      if (additionalResponse.plotDivs && additionalResponse.plotDivs.length > 0) {
                        additionalResponse.plotDivs.forEach((plotDiv, i) => {
                          const type = TYPE_REGEX.exec(plotDiv)[1].toLowerCase().replaceAll(' ', '_');
                          const plotDivElement = $(plotDiv).attr('id', `${type}_${newObsId}`);
                          newObsContainer.append(plotDivElement);
                          newObsContainer.append(GTISelection(additionalResponse.maxGTI[i], `${type}_${newObsId}`));
                          fetchGTIPlot(newObsId, type);
                        });
                      }



                      $('#plots').append(newObsContainer);
                      addSection.find('.additional-obs-input').val('');
                      addSection.find('.add-observation-form').hide();
                      MathJax.typeset();
                    } else {
                      console.error("Error adding observation:", additionalResponse.error);
                      alert("Error adding observation: " + additionalResponse.error);
                    }
                  }
                });
              }
            });

            $('#plots').append(addSection);
          }

          MathJax.typeset();
        } else {
          console.error("Unexpected response format:", response);
          $('#plots').html('<p class="error">Unexpected response from server.</p>');
        }
      },
      error: function(jqXHR, textStatus, errorThrown) {
        console.error("AJAX error:", textStatus, errorThrown);
        $('#plots').html('<p class="error">An error occurred while fetching data. Please try again.</p>');
      }
    });
  });
}

function handleMultipleObservations(observations, sourceName) {
    console.log("Handling multiple observations:", observations);

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
        'Exposure Time (s)',
        'Undershoot Rate (s⁻¹)',
        'Overshoot Rate (s⁻¹)',
        'Action'
    ].forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        th.style.padding = '8px 12px';
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    const processObservations = async () => {
        for (const obs of observations) {
            const formData = new FormData();
            formData.append('obs_id', obs.obs_id);
            formData.append('quality', quality);
            formData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

            try {
                const response = await fetch(PLOT_GRAPH_URL, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.info && data.info.length > 0) {
                    const firstGTI = data.info[0];
                    const row = document.createElement('tr');
                    row.className = 'obs-row';

                    [
                        [obs.obs_id || 'N/A', null],
                        [firstGTI.TSTART_MJD_UTC, 5],
                        [firstGTI.EXPTIME, 2],
                        [firstGTI.USHOOT_NET_RATE, 4],
                        [firstGTI.OSHOOT_NET_RATE, 4]
                    ].forEach(([value, decimals]) => {
                        const cell = document.createElement('td');
                        cell.style.padding = '8px 12px';
                        cell.style.borderBottom = '1px solid #ddd';
                        if (value && decimals !== null) {
                            const numValue = parseFloat(value);
                            cell.textContent = isNaN(numValue) ? 'N/A' : numValue.toFixed(decimals);
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
                        document.querySelector('#observation-search').value = obs.obs_id;
                        document.querySelector('#plot-graph').dispatchEvent(new Event('submit'));
                        container.remove();
                    });
                    actionCell.appendChild(selectButton);
                    row.appendChild(actionCell);

                    tbody.appendChild(row);
                }
            } catch (error) {
                console.error(`Error fetching details for observation ${obs.obs_id}:`, error);
                const errorRow = document.createElement('tr');
                errorRow.className = 'obs-row';
                errorRow.innerHTML = `
                    <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">${obs.obs_id}</td>
                    <td colspan="4" style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Error loading observation details</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #ddd;">
                        <button class="select-observation-btn" style="padding: 4px 8px; border-radius: 4px; border: 1px solid #ccc; cursor: pointer;">Select</button>
                    </td>
                `;
                tbody.appendChild(errorRow);
            }
        }
    };

    table.appendChild(thead);
    table.appendChild(tbody);
    observationsTable.appendChild(table);
    tablesGrid.appendChild(observationsTable);
    container.appendChild(tablesGrid);

    const plotsContainer = document.querySelector('#plots');
    plotsContainer.innerHTML = '';
    plotsContainer.appendChild(container);

    Promise.all([
        processObservations(),
        fetchSourceSummary(observations).then(summaryElement => {
            sourceSummaryPlaceholder.replaceWith(summaryElement);
        })
    ]).catch(error => {
        console.error("Error processing observations:", error);
    });
}

async function fetchSourceSummary(observations) {
    console.log("Fetching source summary for observations:", observations);

    const $container = $('<div class="source-summary-container">');
    const $table = $('<table class="info-table source-summary-table">');

    const $header = $('<tr>');
    ['Property', 'Value'].forEach(text => {
        const $th = $('<th>');
        $th.text(text);
        $header.append($th);
    });
    $table.append($header);

    try {
        const observationDetails = await Promise.all(observations.map(async (obs) => {
            const formData = new FormData();
            formData.append('obs_id', obs.obs_id);
            formData.append('quality', quality);
            formData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

            const response = await fetch(PLOT_GRAPH_URL, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            return data.info;
        }));

        const processedData = {
            totalObservations: observations.length,
            totalGTIs: 0,
            stats: {
                exposure: [],
                undershoot: [],
                overshoot: [],
                mjd: [],
                corsax: []
            }
        };

        observationDetails.forEach(obsInfo => {
            if (!Array.isArray(obsInfo)) return;

            const gtiCount = obsInfo.filter(record => record.GTI !== undefined).length;
            processedData.totalGTIs += gtiCount;

            const uniqueObsValues = {
                exposure: new Set(),
                undershoot: new Set(),
                overshoot: new Set(),
                mjd: new Set(),
                corsax: new Set()
            };

            obsInfo.forEach(record => {
                if (record.EXPTIME) uniqueObsValues.exposure.add(parseFloat(record.EXPTIME));
                if (record.USHOOT_NET_RATE) uniqueObsValues.undershoot.add(parseFloat(record.USHOOT_NET_RATE));
                if (record.OSHOOT_NET_RATE) uniqueObsValues.overshoot.add(parseFloat(record.OSHOOT_NET_RATE));
                if (record.TSTART_MJD_UTC) uniqueObsValues.mjd.add(parseFloat(record.TSTART_MJD_UTC));
                if (record.COR_SAX) uniqueObsValues.corsax.add(parseFloat(record.COR_SAX));
            });

            Object.entries(uniqueObsValues).forEach(([key, valueSet]) => {
                if (valueSet.size > 0) {
                    const avg = Array.from(valueSet).reduce((a, b) => a + b, 0) / valueSet.size;
                    processedData.stats[key].push(avg);
                }
            });
        });

        const getAverage = arr => arr.length ?
            (arr.reduce((a, b) => a + b, 0) / arr.length) : null;

        const totalExposureTime = processedData.stats.exposure.reduce((a, b) => a + b, 0);

        const summary = {
            'Total Observations': processedData.totalObservations,
            'Total GTIs': processedData.totalGTIs,
            'Average Exposure Time per Observation (s)': getAverage(processedData.stats.exposure)?.toFixed(2) || '-',
            'Total Exposure Time (s)': totalExposureTime?.toFixed(2) || '-',
            'Average MJD': getAverage(processedData.stats.mjd)?.toFixed(5) || '-',
            'Average Undershoot Rate (s⁻¹)': getAverage(processedData.stats.undershoot)?.toFixed(4) || '-',
            'Average Overshoot Rate (s⁻¹)': getAverage(processedData.stats.overshoot)?.toFixed(4) || '-',
            'Average COR_SAX (GeV c⁻¹)': getAverage(processedData.stats.corsax)?.toFixed(3) || '-'
        };

        Object.entries(summary).forEach(([property, value]) => {
            const $row = $('<tr>');
            $row.append($(`<td class="property-cell">${property}</td>`));
            $row.append($(`<td class="value-cell">${value}</td>`));
            $table.append($row);
        });

        $container.append($table);

    } catch (error) {
        console.error("Error fetching source summary data:", error);
        $container.html('<div class="error">Error loading source summary. Please try again.</div>');
    }

    return $container[0];
}

// When the page loads add event listeners for different input fields
document.addEventListener('DOMContentLoaded', () => {
  dropdowns();
  fetchGraphPlots();

  $('#observation-search').keyup(function () {
    fetchObsOptions(this.value);
  });

  $('#source-search').keyup(function () {
    fetchSourceOptions(this.value);
  });

  $('.change-quality').click(function () {
    changeQuality(this.textContent);
  });
});
