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

      const $SELECT_ALL_CONTAINER = $('<div class="select-all-container" style="margin: 5px 0;">');
      const $SELECT_ALL_LABEL = $('<label><input type="checkbox" class="select-all-gtis"> Select All</label>');
      $SELECT_ALL_CONTAINER.append($SELECT_ALL_LABEL);
      $DETAILS_CELL.prepend($SELECT_ALL_CONTAINER);

      // Handle "Select All" toggle
      $SELECT_ALL_LABEL.on('change', '.select-all-gtis', function () {
        const isChecked = $(this).is(':checked');
        $GTI_TABLE.find('.gti-checkbox').prop('checked', isChecked).trigger('change');
      });


      $DETAILS_CELL.append($GTI_TABLE);
      $DETAILS_ROW.append($DETAILS_CELL);
      $ROW_GROUP.append($DETAILS_ROW);
      $OBSID_TABLE.append($ROW_GROUP);

      $GTI_TABLE.on('change', '.gti-checkbox', function () {
        const $graphButton = $(this).closest('.details-row').find('.graph-selected-gtis');
        const hasCheckedBoxes = $(this).closest('.gti-table').find('.gti-checkbox:checked').length > 0;
        $graphButton.toggle(hasCheckedBoxes);
        $graphButton.closest('.graph-button-container').toggle(hasCheckedBoxes);
      });

      $GRAPH_BUTTON.on('click', function () {
        const $table = $(this).closest('.details-row').find('.gti-table');
        const selectedGTIs = [];
        $table.find('.gti-checkbox:checked').each(function () {
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

  $CONTAINER.on('click', '.toggle-details', function (e) {
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
// function fetchGTIPlot(obsID) {
//   $('.fetch-gti').submit(function (e) {
//     // Constants
//     const REGEX = /"title":\{"text":"(.+?)"\}/;
//     let serializedData = $(this).serialize();

//     // Prevents reloading the page
//     e.preventDefault();

//     serializedData += `&csrfmiddlewaretoken=${$(
//       "input[name='csrfmiddlewaretoken']",
//     ).val()}`;
//     serializedData += `&quality=${quality}`;
//     serializedData += `&obs_id=${obsID}`;

//     // Sends an asynchronous request to generate a plot with multiple GTIs
//     $.ajax({
//       type: 'POST',
//       url: PLOT_GTI_URL,
//       data: serializedData,
//       success: function (response) {
//         // Gets information on the plot type
//         const NAME = REGEX.exec(response.plotDivs[0])[1]
//           .toLowerCase()
//           .replaceAll(' ', '_');
//         const $PLOT_DIV = $(response.plotDivs[0]).attr('id', NAME);

//         // Updates the plot with the GTIs
//         $(`#${NAME}`).replaceWith($PLOT_DIV);
//       },
//     });
//   });
// }

function fetchGTIPlot(obsID) {
  $('.gti-form').submit(function (e) {
    e.preventDefault();
    const form = $(this);
    const plotId = form.data('plot-id');
    // Get plot type from the container's data attribute
    const plotType = form.closest('.plot-container').data('plot-type');

    const data = {
      'gti-search': form.find('input[name="gti-search"]').val(),
      'obs_id': obsID,
      'quality': quality,
      'plot_type': plotType,
      'csrfmiddlewaretoken': $("input[name='csrfmiddlewaretoken']").val()
    };

    // Add logging to debug
    console.log('Sending GTI plot request with data:', data);

    $.ajax({
      type: 'POST',
      url: PLOT_GTI_URL,
      data: data,
      success: function (response) {
        if (response.error) {
          console.error('Server error:', response.error);
          alert(response.error);
          return;
        }
        if (response.plotDivs && response.plotDivs.length > 0) {
          $(`#${plotId}`).replaceWith(response.plotDivs[0]);
          MathJax.typeset();
        }
      },
      error: function (xhr, status, error) {
        console.error("Error fetching GTI plot:", error);
        console.error("Server response:", xhr.responseText);
        alert("Error fetching GTI plot. Please try again.");
      }
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
    `placeholder="GTI numbers (,) and/or range (-) between 0 and ${maxGTI - 1
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
// function fetchGraphPlots() {
//   $('#plot-graph').submit(function (e) {
//     // Constants
//     let SERIALIZED_DATA = $(this).serialize();
//     const TYPE_REGEX = /"title":\{"text":"(.+?)"\}/;

//     // Prevents reloading the page
//     e.preventDefault();

//     // Adds information and security token to the request
//     SERIALIZED_DATA += `&csrfmiddlewaretoken=${$(
//       "input[name='csrfmiddlewaretoken']",
//     ).val()}`;
//     SERIALIZED_DATA += `&quality=${quality}`;

//     // Sends an asynchronous request to generate a plot with multiple GTIs
//     $.ajax({
//       type: 'POST',
//       url: PLOT_GRAPH_URL,
//       data: SERIALIZED_DATA,
//       success: function (response) {
//         // Clear both obs-info and plots divs at the start
//         $('#obs-info').empty();
//         $('#plots').empty();

//         if (response.error) {
//           console.error("Error received:", response.error);
//           $('#plots').html(`<p class="error">${response.error}</p>`);
//           return;
//         }

//         if (response.multiple_observations) {
//           handleMultipleObservations(response.obs_ids, response.source);
//           return;
//         }

//         if (response.info && response.plotDivs) {
//           const obsContainer = $('<div class="observation-container"></div>');

//           const infoSection = $('<div class="info-section"></div>');
//           infoSection.append(displayInfo(response.info));
//           obsContainer.append(infoSection);



//           if (response.obs_info) {
//             $('#ra').val(response.obs_info.ra);
//             $('#dec').val(response.obs_info.dec);
//             $('#tstart_tt').val(response.obs_info.tstart_tt);
//             $('#tstop_tt').val(response.obs_info.tstop_tt);
//             $('#ndets_used').val(response.obs_info.ndets_used);
//             $('#ushoot_net_rate').val(response.obs_info.ushoot_net_rate);
//             $('#oshoot_net_rate').val(response.obs_info.oshoot_net_rate);
//           }

//           const plotsSection = $('<div class="plots-section"></div>');

//           if (response.plotDivs.length > 0) {
//             response.plotDivs.forEach((plotDiv, i) => {
//               const TYPE = TYPE_REGEX.exec(plotDiv)[1]
//                 .toLowerCase()
//                 .replaceAll(' ', '_');
//               const PLOT_DIV = $(plotDiv).attr('id', TYPE);

//               plotsSection.append(PLOT_DIV);
//               plotsSection.append(GTISelection(response.maxGTI[i], TYPE));
//               fetchGTIPlot(response.obsID, TYPE);
//             });
//           } else {
//             plotsSection.html('<p class="error">No plots available for this observation.</p>');
//           }

//           obsContainer.append(plotsSection);


//           $('#plots').append(obsContainer);

//           if (!$('.add-observation-section').length) {
//             const addSection = $(`
//           <div class="add-observation-section">
//             <button class="add-observation-btn">Add Another Observation</button>
//             <div class="add-observation-form" style="display: none;">
//               <div class="input-group">
//                 <input type="text" class="additional-obs-input" placeholder="Enter Observation ID...">
//                 <div class="dropdown-content additional-obs-suggestions"></div>
//                 <button type="button" class="add-obs-submit">Add</button>
//               </div>
//             </div>
//           </div>
//         `);

//             addSection.find('.add-observation-btn').click(function () {
//               addSection.find('.add-observation-form').toggle();
//             });

//             addSection.find('.additional-obs-input').on('keyup', function () {
//               fetchObsOptions($(this).val());
//             });

//             addSection.find('.add-obs-submit').click(function () {
//               const newObsId = addSection.find('.additional-obs-input').val();
//               if (newObsId) {
//                 let newData = new FormData();
//                 newData.append('obs_id', newObsId);
//                 newData.append('quality', quality);
//                 newData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

//                 $.ajax({
//                   type: 'POST',
//                   url: PLOT_GRAPH_URL,
//                   data: newData,
//                   processData: false,
//                   contentType: false,
//                   success: function (additionalResponse) {
//                     if (!additionalResponse.error) {
//                       // Process the new observation similarly to the first one
//                       const newObsContainer = $('<div class="observation-container"></div>');
//                       newObsContainer.append(displayInfo(additionalResponse.info));

//                       if (additionalResponse.plotDivs && additionalResponse.plotDivs.length > 0) {
//                         additionalResponse.plotDivs.forEach((plotDiv, i) => {
//                           const type = TYPE_REGEX.exec(plotDiv)[1].toLowerCase().replaceAll(' ', '_');
//                           const plotDivElement = $(plotDiv).attr('id', `${type}_${newObsId}`);
//                           newObsContainer.append(plotDivElement);
//                           newObsContainer.append(GTISelection(additionalResponse.maxGTI[i], `${type}_${newObsId}`));
//                           // fetchGTIPlot(newObsId, type);
//                           fetchGTIPlot(newObsId);
//                           addNewObservation(newObsId);
//                           console.log("werwerwe" + newObsId);
//                         });
//                       }



//                       $('#plots').append(newObsContainer);
//                       addSection.find('.additional-obs-input').val('');
//                       addSection.find('.add-observation-form').hide();
//                       MathJax.typeset();
//                     } else {
//                       console.error("Error adding observation:", additionalResponse.error);
//                       alert("Error adding observation: " + additionalResponse.error);
//                     }
//                   }
//                 });
//               }
//             });

//             $('#plots').append(addSection);
//           }

//           MathJax.typeset();
//         } else {
//           console.error("Unexpected response format:", response);
//           $('#plots').html('<p class="error">Unexpected response from server.</p>');
//         }
//       },
//       error: function (jqXHR, textStatus, errorThrown) {
//         console.error("AJAX error:", textStatus, errorThrown);
//         $('#plots').html('<p class="error">An error occurred while fetching data. Please try again.</p>');
//       }
//     });
//   });
// }




function fetchGraphPlots() {
  // Keep track of current plots and their data
  let plotsData = {};
  let activeObservations = new Set();


  $('#plot-graph').submit(function (e) {
    // Prevent default form submission
    e.preventDefault();

    // Prepare request data
    let serializedData = $(this).serialize();
    const typeRegex = /"title":\{"text":"(.+?)"\}/;

    serializedData += `&csrfmiddlewaretoken=${$("input[name='csrfmiddlewaretoken']").val()}`;
    serializedData += `&quality=${quality}`;

    // Make AJAX request
    $.ajax({
      type: 'POST',
      url: PLOT_GRAPH_URL,
      data: serializedData,
      success: function (response) {
        if (response.error) {
          console.error("Error received:", response.error);
          $('#plots').html(`<p class="error">${response.error}</p>`);
          return;
        }

        if (response.multiple_observations) {
          handleMultipleObservations(response.obs_ids, response.source);
          return;
        }

        if (!response.info || !response.plotDivs) {
          console.error("Unexpected response format:", response);
          $('#plots').html('<p class="error">Unexpected response from server.</p>');
          return;
        }

        const obsID = $('#observation-search').val();
        activeObservations.add(obsID);

        // Check if this is the first observation being added
        const isFirstObservation = !Object.keys(plotsData).length;

        // Update info section
        const infoSection = $('#obs-info');
        if (!infoSection.length) {
          $('<div id="obs-info"></div>').insertBefore('#plots');
        }
        $('#obs-info').append(displayInfo(response.info));

        // Update form values if observation info is provided
        if (response.obs_info) {
          Object.entries(response.obs_info).forEach(([key, value]) => {
            $(`#${key}`).val(value);
          });
        }

        // Process plots
        if (response.plotDivs.length > 0) {
          response.plotDivs.forEach((plotDiv, i) => {
            const plotType = typeRegex.exec(plotDiv)[1].toLowerCase().replaceAll(' ', '_');
            const plotId = `${plotType}_${obsID}`;

            // Initialize plot container if it doesn't exist
            if (!plotsData[plotType]) {
              plotsData[plotType] = {
                observations: new Set(),
                container: $('<div>', {
                  class: 'plot-container',
                  'data-plot-type': plotType
                })
              };

              // Create plot section if it doesn't exist
              if (!$(`#${plotType}-section`).length) {
                const plotSection = $('<div>', {
                  id: `${plotType}-section`,
                  class: 'plot-type-section'
                });
                plotSection.append(`<h3>${plotType.replace(/_/g, ' ').toUpperCase()}</h3>`);
                const combineButton = $('<button>', {
                  class: 'combine-gtis-btn',
                  text: 'Combine GTIs from All Observations',
                  style: 'display: none; margin: 10px 0;'
                });

                plotSection.append(combineButton);
                plotSection.append(plotsData[plotType].container);
                $('#plots').append(plotSection);

                // Add click handler for combine button
                combineButton.click(function () {
                  combineAndPlotGTIs(plotType, Array.from(activeObservations));
                });
              }
            }

            updateCombineButtonVisibility();


            // Add new observation to plot if not already present
            if (!plotsData[plotType].observations.has(obsID)) {
              plotsData[plotType].observations.add(obsID);

              // Create plot div with unique ID
              const $plotDiv = $(plotDiv).attr('id', plotId);
              plotsData[plotType].container.append($plotDiv);

              // Add GTI selection form
              const gtiForm = GTISelection(response.maxGTI[i], plotId);
              plotsData[plotType].container.append(gtiForm);

              // Set up GTI plot updating
              fetchGTIPlot(obsID);
            }
          });

          // Add the "Add Another Observation" section if this is the first observation
          if (isFirstObservation) {
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

            // Set up event handlers for the add observation section
            addSection.find('.add-observation-btn').click(function () {
              addSection.find('.add-observation-form').toggle();
            });

            addSection.find('.additional-obs-input').on('keyup', function () {
              fetchObsOptions($(this).val());
            });

            addSection.find('.add-obs-submit').click(function () {
              const newObsId = addSection.find('.additional-obs-input').val();
              if (newObsId) {
                $('#observation-search').val(newObsId);
                $('#plot-graph').submit();
                addSection.find('.additional-obs-input').val('');
                addSection.find('.add-observation-form').hide();
              }
            });

            $('#plots').append(addSection);
          }

          // Typeset any math expressions
          MathJax.typeset();
        } else {
          if (!$('#plots').children().length) {
            $('#plots').html('<p class="error">No plots available for this observation.</p>');
          }
        }

        // Add observation removal functionality
        if (!$(`#remove-${obsID}`).length) {
          const removeButton = $(`
            <button id="remove-${obsID}" class="remove-observation-btn">
              Remove Observation ${obsID}
            </button>
          `);

          removeButton.click(function () {
            // Remove plots for this observation
            activeObservations.delete(obsID);
            Object.keys(plotsData).forEach(plotType => {
              plotsData[plotType].observations.delete(obsID);
              $(`#${plotType}_${obsID}`).remove();
              // Remove the plot section if no observations remain
              if (plotsData[plotType].observations.size === 0) {
                $(`#${plotType}-section`).remove();
                delete plotsData[plotType];
              }
              updateCombineButtonVisibility();
            });


            // Remove the remove button itself
            $(this).remove();


            // Remove the info section for this observation
            $(`[data-obs-id="${obsID}"]`).remove();
          });


          $('#plots').append(removeButton);
        }
      },
      error: function (jqXHR, textStatus, errorThrown) {
        console.error("AJAX error:", textStatus, errorThrown);
        $('#plots').html('<p class="error">An error occurred while fetching data. Please try again.</p>');
      }
    });
  });
  function updateCombineButtonVisibility() {
    const shouldShow = activeObservations.size >= 2;
    $('.combine-gtis-btn').toggle(shouldShow);
  }

  // Function to combine and plot GTIs from multiple observations
  // function combineAndPlotGTIs(plotType, obsIDs) {
  //   const formData = new FormData();
  //   formData.append('plot_type', plotType);
  //   formData.append('combined_obs_ids', obsIDs.join(','));
  //   formData.append('quality', quality);
  //   formData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

  //   // Show loading state
  //   const loadingDiv = $('<div class="loading-message">Combining GTIs...</div>');
  //   $(`#${plotType}-section`).prepend(loadingDiv);

  //   fetch(PLOT_GTI_URL, {
  //     method: 'POST',
  //     body: formData
  //   })
  //     .then(response => response.json())
  //     .then(data => {
  //       if (data.error) {
  //         throw new Error(data.error);
  //       }

  //       // Create or update combined plot container
  //       const combinedPlotId = `${plotType}_combined`;
  //       let combinedContainer = $(`#${combinedPlotId}-container`);

  //       if (!combinedContainer.length) {
  //         combinedContainer = $('<div>', {
  //           id: `${combinedPlotId}-container`,
  //           class: 'combined-plot-container'
  //         });
  //         combinedContainer.append('<h4>Combined GTIs Plot</h4>');
  //         $(`#${plotType}-section`).append(combinedContainer);
  //       }

  //       // Update plot
  //       if (data.plotDivs && data.plotDivs.length > 0) {
  //         const $plotDiv = $(data.plotDivs[0]).attr('id', combinedPlotId);
  //         combinedContainer.find('.plot-div').remove();
  //         combinedContainer.append($plotDiv);
  //       }
  //     })
  //     .catch(error => {
  //       console.error('Error combining GTIs:', error);
  //       alert('Error combining GTIs: ' + error.message);
  //     })
  //     .finally(() => {
  //       loadingDiv.remove();
  //     });
  // }
  function combineAndPlotGTIs(plotType, obsIDs) {
    const formData = new FormData();
    formData.append('plot_type', plotType);
    formData.append('combined_obs_ids', obsIDs.join(','));
    formData.append('quality', quality);
    formData.append('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());

    // Show loading state
    const loadingDiv = $('<div class="loading-message">Combining GTIs...</div>');
    $(`#${plotType}-section`).prepend(loadingDiv);

    $.ajax({
      type: 'POST',
      url: PLOT_GTI_URL,
      data: formData,
      processData: false,
      contentType: false,
      success: function (data) {
        if (data.error) {
          console.error('Error:', data.error);
          alert('Error combining GTIs: ' + data.error);
          return;
        }

        // Create or update combined plot container
        const combinedPlotId = `${plotType}_combined`;
        let combinedContainer = $(`#${combinedPlotId}-container`);

        if (!combinedContainer.length) {
          combinedContainer = $('<div>', {
            id: `${combinedPlotId}-container`,
            class: 'combined-plot-container'
          });
          combinedContainer.append('<h4>Combined GTIs Plot</h4>');
          $(`#${plotType}-section`).append(combinedContainer);
        }

        // Update plot
        if (data.plotDivs && data.plotDivs.length > 0) {
          const $plotDiv = $(data.plotDivs[0]).attr('id', combinedPlotId);
          combinedContainer.find('.plot-div').remove();
          combinedContainer.append($plotDiv);
          MathJax.typeset();
        }
      },
      error: function (xhr, status, error) {
        console.error('Error combining GTIs:', error);
        console.error('Server response:', xhr.responseText);
        alert('Error combining GTIs. Please try again.');
      },
      complete: function () {
        loadingDiv.remove();
      }
    });
  }
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
    "52-FPM Rate [0.5-12 keV] (s⁻¹)",
    'Action'
  ].forEach(headerText => {
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

          const mjdValue = parseFloat(firstGTI.TSTART_MJD_UTC);
          const dateInfo = mjdToDate(mjdValue);

          [
            [obs.obs_id || 'N/A', null],
            [firstGTI.TSTART_MJD_UTC, 5],
            [dateInfo.formattedWithoutSeconds, null],
            [firstGTI.EXPTIME, 2],
            [firstGTI.USHOOT_NET_RATE, 4],
            [firstGTI.OSHOOT_NET_RATE, 4],
            [firstGTI.GOODX_5_12_RATE, 4]
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
    .then(summaryElement => {
      sourceSummaryPlaceholder.replaceWith(summaryElement);

      return processObservations();
    })
    .then(() => {
      observationsTablePlaceholder.replaceWith(observationsTable);
    })
    .catch(error => {
      console.error("Error processing observations:", error);
      observationsTablePlaceholder.textContent = 'Error loading observations.';
    });

  return container;
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
        exposure: { values: [], min: null, max: null },
        undershoot: { values: [], min: null, max: null },
        overshoot: { values: [], min: null, max: null },
        mjd: { values: [], min: null, max: null },
        dates: { values: [] },
        corsax: { values: [], min: null, max: null },
        goodx_5_12_rate: { values: [], min: null, max: null }
      }
    };

    observationDetails.forEach(obsInfo => {
      if (!Array.isArray(obsInfo)) return;

      const gtiCount = obsInfo.filter(record => record.GTI !== undefined).length;
      processedData.totalGTIs += gtiCount;

      const statsToProcess = [
        { key: 'exposure', prop: 'EXPTIME' },
        { key: 'undershoot', prop: 'USHOOT_NET_RATE' },
        { key: 'overshoot', prop: 'OSHOOT_NET_RATE' },
        { key: 'mjd', prop: 'TSTART_MJD_UTC' },
        { key: 'corsax', prop: 'COR_SAX' },
        { key: 'goodx_5_12_rate', prop: 'GOODX_5_12_RATE' }
      ];

      statsToProcess.forEach(({ key, prop }) => {
        const values = obsInfo
          .map(record => parseFloat(record[prop]))
          .filter(val => !isNaN(val));

        if (values.length > 0) {
          processedData.stats[key].values.push(...values);
          print(values)
        }
      });

      processedData.stats.dates.values.push(
        ...obsInfo
          .map(record => parseFloat(record.TSTART_MJD_UTC))
          .filter(val => !isNaN(val))
          .map(mjd => mjdToDate(mjd).formattedWithoutSeconds)
      );
    });

    Object.values(processedData.stats).forEach(stat => {
      if (stat.values && stat.values.length > 0) {
        stat.min = Math.min(...stat.values);
        stat.max = Math.max(...stat.values);
      }
    });

    const getAverage = arr => arr.length ?
      (arr.reduce((a, b) => a + b, 0) / arr.length) : null;

    const formatMinMax = (min, max) =>
      min !== null && max !== null ? `${min.toFixed(5)}-${max.toFixed(5)}` : '-';

    const formatDateMinMax = (dates) =>
      dates.length ? `${dates[0]} to ${dates[dates.length - 1]}` : '-';

    const totalExposureTime = processedData.stats.exposure.values.reduce((a, b) => a + b, 0);

    const summary = {
      'Total Observations': processedData.totalObservations,
      'Total GTIs': processedData.totalGTIs,
      'Date Range (UTC)': formatDateMinMax(processedData.stats.dates.values),
      'Average Exposure Time per Observation (s)': getAverage(processedData.stats.exposure.values)?.toFixed(2) || '-',
      'Exposure Time Range (s)': formatMinMax(processedData.stats.exposure.min, processedData.stats.exposure.max),
      'Total Exposure Time (s)': totalExposureTime?.toFixed(2) || '-',
      'Average MJD': getAverage(processedData.stats.mjd.values)?.toFixed(5) || '-',
      'MJD Range': formatMinMax(processedData.stats.mjd.min, processedData.stats.mjd.max),
      'Average Undershoot Rate (s⁻¹)': getAverage(processedData.stats.undershoot.values)?.toFixed(4) || '-',
      'Undershoot Rate Range (s⁻¹)': formatMinMax(processedData.stats.undershoot.min, processedData.stats.undershoot.max),
      'Average Overshoot Rate (s⁻¹)': getAverage(processedData.stats.overshoot.values)?.toFixed(4) || '-',
      'Overshoot Rate Range (s⁻¹)': formatMinMax(processedData.stats.overshoot.min, processedData.stats.overshoot.max),
      'Average COR_SAX (GeV c⁻¹)': getAverage(processedData.stats.corsax.values)?.toFixed(3) || '-',
      'COR_SAX Range (GeV c⁻¹)': formatMinMax(processedData.stats.corsax.min, processedData.stats.corsax.max),
      'Average 52-FPM Rate [0.5-12 keV] (s⁻¹)': getAverage(processedData.stats.goodx_5_12_rate.values)?.toFixed(4) || '-',
      '52-FPM Rate [0.5-12 keV] Range (s⁻¹)': formatMinMax(processedData.stats.goodx_5_12_rate.min, processedData.stats.goodx_5_12_rate.max)
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

function mjdToDate(mjd) {
  const JD = mjd + 2400000.5;

  const unixEpoch = JD - 2440587.5;

  const milliseconds = unixEpoch * 86400000;

  const date = new Date(milliseconds);

  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
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
    formatted: `${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}/${year}`,
    fullFormatted: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')} ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} UTC`,
    formattedWithoutSeconds: `${monthName} ${day}, ${year}`
  };
}


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