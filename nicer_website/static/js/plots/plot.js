/* global PLOT_GRAPH_URL PLOT_GTI_URL MathJax quality:writable */

import { columnLayout, dropdowns } from '../utils/utils.js';

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

/**
 * Displays information for each GTI in a dropdown table.
 * @param {Array.<Object>} info List of information for all GTI
 * @returns {HTMLDivElement}
 * Container containing the expandable table of GTIs
 */
function displayInfo(info) {
  console.log("displayInfo called with:", info); // Log the input for debugging

  // Information types to display in the table
  const TABLE_INFO = {
    headers: [
      'GTI',
      'Source',
      'MJD',
      String.raw`RA \((^\circ)\)`,
      String.raw`DEC \((^\circ)\)`,
      String.raw`Exposure Time \((s)\)`,
      'Detectors',
      String.raw`Undershoot Rate \((s^{-1})\)`,
      String.raw`Overshoot Rate \((s^{-1})\)`,
      String.raw`COR SAX \((GeV\ c^{-1})\)`,
    ],
    keys: [
      'GTI',
      'OBJECT',
      'TSTART_MJD_UTC',
      'RA',
      'DEC',
      'EXPTIME',
      'NDETS_USED',
      'USHOOT_NET_RATE',
      'OSHOOT_NET_RATE',
      'COR_SAX',
    ],
    precision: [null, null, 5, 2, 2, 2, 0, 2, 4, 3],
  };

  // Constants
  const $CONTAINER = $('<div>');
  const $TABLE = $('<table>');
  const $HEADER_ROW = $('<tr>');
  const $BUTTON = $('<button type="button">&#x2304</button>');

  // Add headers to the table
  for (const HEADER of TABLE_INFO.headers) {
    $HEADER_ROW.append($(`<th>${HEADER}</th>`));
  }

  $TABLE.append($HEADER_ROW);

  // Check if the info parameter is defined and not empty
  if (info && info.length > 0) {
    console.log("Info is valid, creating table rows");
    // Add each row of data to the table
    for (const [J, GTI] of info.entries()) {
      const $DATA_ROW = $('<tr>');

      // Add each table cell to the row
      for (let i = 0; i < TABLE_INFO.headers.length; i++) {
        let data = GTI[TABLE_INFO.keys[i]];
        if (data === undefined) {
          console.warn(`Missing data for key: ${TABLE_INFO.keys[i]}`);
          data = 'N/A';
        } else {
          data = data.replace('_', ' ');
          if (TABLE_INFO.precision[i] != null) {
            data = (+data).toFixed(TABLE_INFO.precision[i]);
          }
        }

        $DATA_ROW.append($(`<td>${data}</td>`));
      }

      // Hide all but the first row
      if (J !== 0) {
        $DATA_ROW.addClass('hide');
      }

      $TABLE.append($DATA_ROW);
    }
  } else {
    console.log("Info is undefined or empty, displaying message");
    // If the info parameter is undefined or empty, display a message
    $TABLE.append($(
      '<tr><td colspan="10">No observation data available.</td></tr>',
    ));
  }

  $CONTAINER.append($TABLE);
  $CONTAINER.append($BUTTON);

  // Add button to expand the table
  $BUTTON.click(() => {
    $TABLE.children().slice(2).toggleClass('hide');
    $BUTTON.html(/\u2304/.test($BUTTON.html()) ? '&#x2303' : '&#x2304');
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

    // Adds information and security token to the request
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
  $('#plot-graph').submit(function (e) {
    // Constants
    let SERIALIZED_DATA = $(this).serialize();
    const TYPE_REGEX = /"title":\{"text":"(.+?)"\}/;

    // Prevents reloading the page
    e.preventDefault();

    console.log("Submitting data:", SERIALIZED_DATA);

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
      success: function (response) {
        // Clear both obs-info and plots divs at the start
        $('#obs-info').empty();
        $('#plots').empty();

        if (response.error) {
          console.error("Error received:", response.error);
          $('#plots').html(`<p class="error">${response.error}</p>`);
        } else if (response.multiple_observations) {
          handleMultipleObservations(response.obs_ids, response.source);
        } else if (response.info && response.plotDivs) {
          // Display info table for single observation
          $('#obs-info').append(displayInfo(response.info));
          MathJax.typeset();

          // Display plots
          if (response.plotDivs.length > 0) {
            for (let i = 0; i < response.plotDivs.length; i++) {
              const TYPE = TYPE_REGEX.exec(response.plotDivs[i])[1]
                .toLowerCase()
                .replaceAll(' ', '_');
              const PLOT_DIV = $(response.plotDivs[i]).attr('id', TYPE);

              $('#plots').append(PLOT_DIV);
              $('#plots').append(GTISelection(response.maxGTI[i], TYPE));
              fetchGTIPlot(response.obsID, TYPE);
            }
          } else {
            console.log("Error")
            $('#plots').html('<p class="error">No plots available for this observation.</p>');
          }
        } else {
          console.error("Unexpected response format:", response);
          $('#plots').html('<p class="error">Unexpected response from server.</p>');
        }
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error("AJAX error:", textStatus, errorThrown);
        $('#plots').html('<p class="error">An error occurred while fetching data. Please try again.</p>');
      }
    });
  });
}

function handleMultipleObservations(observations, sourceName) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'multiple-observations-table';

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const tbody = document.createElement('tbody');

    const headerRow = document.createElement('tr');
    ['Observation ID', 'Source', 'Action'].forEach(headerText => {
        const th = document.createElement('th');
        th.textContent = headerText;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    observations.forEach(obs => {
        const row = document.createElement('tr');

        const obsIdCell = document.createElement('td');
        obsIdCell.textContent = obs.obs_id;
        row.appendChild(obsIdCell);

        const sourceCell = document.createElement('td');
        sourceCell.textContent = obs.source;
        row.appendChild(sourceCell);

        const actionCell = document.createElement('td');
        const selectButton = document.createElement('button');
        selectButton.textContent = 'Select';
        selectButton.addEventListener('click', () => {
            document.querySelector('#observation-search').value = obs.obs_id;
            tableContainer.remove();
            fetchGraphPlots();
        });
        actionCell.appendChild(selectButton);
        row.appendChild(actionCell);

        tbody.appendChild(row);
    });

    table.appendChild(thead);
    table.appendChild(tbody);
    tableContainer.appendChild(table);

    const plotsContainer = document.querySelector('#plots');
    plotsContainer.innerHTML = '';
    plotsContainer.appendChild(tableContainer);

    const sourceMessage = document.createElement('p');
    sourceMessage.textContent = `Multiple observations found for source: ${sourceName}`;
    plotsContainer.insertBefore(sourceMessage, tableContainer);
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
