/*
import { mjdToDate } from '../utils/dateUtils.js';
import { GTISelection } from './gtiComponents.js';
import {
  updateCombineButtonVisibility,
  showPlotSelectionPopup,
} from './graph.js';
import { startOperation, completeOperation, errorOperation } from './statusBar.js';

export function displayInfo(info) {
  console.log('displayInfo called with:', info);

  // *** This is the table for the modal ***
  const GTI_INFO = {
    headers: [
      'Select', 'GTI', 'MJD', String.raw`Exposure Time \((s)\)`, 'Detectors',
      String.raw`Undershoot Rate \((s^{-1})\)`, String.raw`Overshoot Rate \((s^{-1})\)`,
      String.raw`COR SAX \((GeV\ c^{-1})\)`, 'Actions',
    ],
    keys: [
      null, 'GTI', 'TSTART_MJD_UTC', 'EXPTIME', 'NDETS_USED',
      'USHOOT_NET_RATE', 'OSHOOT_NET_RATE', 'COR_SAX', null,
    ],
    precision: [null, null, 5, 2, 0, 2, 4, 3, null],
  };

  // *** Get the new results container ***
  const $CONTAINER = $('#observation-details');

  if (info && info.length > 0) {
    // Group all data by ObsID
    const OBS_BY_OBS_ID = info.reduce((acc, row) => {
      const OBS_ID = row.OBSID || '';
      if (!acc[OBS_ID]) {
        acc[OBS_ID] = [];
      }
      acc[OBS_ID].push(row);
      return acc;
    }, {});

    // For this layout, we only care about the first ObsID found
    const obsID = Object.keys(OBS_BY_OBS_ID)[0];
    const rows = OBS_BY_OBS_ID[obsID];
    const MAIN_ROW = rows[0];
    const gtiCount = rows.filter((r) => r.GTI !== undefined).length;

    // --- 1. Populate General Info Box ---
    const $infoBox = $('#general-info-box');
    $infoBox.empty(); // Clear old info
    $infoBox.append($('<ul>')
      .append($('<li><strong>source</strong> <span>' + (MAIN_ROW.OBJECT || '-') + '</span></li>'))
      .append($('<li><strong>OBSID</strong> <span>' + (MAIN_ROW.OBSID || '-') + '</span></li>'))
      .append($('<li><strong>Total no. of GTI\'s</strong> <span>' + gtiCount + '</span></li>'))
      .append($('<li><strong>RA(°)</strong> <span>' + (Number(MAIN_ROW.RA).toFixed(2) || '-') + '</span></li>'))
      .append($('<li><strong>DEC(°)</strong> <span>' + (Number(MAIN_ROW.DEC).toFixed(2) || '-') + '</span></li>'))
    );

    // --- 2. Update Plot Selection Title ---
    $('#plot-selection-title').text('Select Plot Types for Observation ID: ' + obsID);

    // --- 3. Configure Buttons ---
    $('#download-obs-btn')
      .attr('data-obs-id', obsID)
      .attr('data-type', 'obs');
      
    // --- 4. Configure the new Plot Form ---
    const $plotForm = $('#plot-selection-form');
    
    // Clear any old hidden inputs
    $plotForm.find('input[type="hidden"]').remove();
    
    // Add necessary hidden inputs for submission
    $plotForm.append(
      $('<input>', {
        type: 'hidden',
        name: 'csrfmiddlewaretoken',
        value: $("form#plot-graph input[name='csrfmiddlewaretoken']").val() // Get token from main form
      })
    );
    $plotForm.append(
      $('<input>', { type: 'hidden', name: 'obs_id', value: obsID })
    );
    $plotForm.append(
      $('<input>', { 
        type: 'hidden', 
        name: 'quality', 
        value: $('#quality-select').val().toLowerCase() 
      })
    );
    // Clear checkboxes from previous search
    $plotForm.find('input[type="checkbox"]').prop('checked', false);


    // --- 5. Wire up the "Show GTI's" button ---
    $('#show-gti-btn').off('click').on('click', function (e) {
      e.preventDefault();
      
      const $modalBody = $('#gti-modal-body');
      
      // 1. Clear the modal
      $modalBody.empty();
      startOperation('gti-build', 'Building GTI table...');

      // 2. Build the GTI table *now*
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

          GTI_INFO.keys.slice(1, -1).forEach((key, keyIdx) => {
            let value = gti[key];
            if (
              GTI_INFO.precision[keyIdx + 1] !== null &&
              value !== undefined
            ) {
              value = Number(value).toFixed(GTI_INFO.precision[keyIdx + 1]);
            }
            $GTI_ROW.append($(`<td>${value || '-'}</td>`));
          });

          const $actionCell = $('<td>');
          const $buttonContainer = $('<div class="actions-container">');
          
          const $plotBtn = $('<button>')
            .addClass('btn btn-primary plot-gti')
            .attr('data-obs-id', obsID)
            .attr('data-gti', gti.GTI)
            .html('<i class="fas fa-chart-line"></i> Plot');
            
          // === 🎨 THIS IS THE FIX YOU ADDED 🎨 ===
          // This handler makes the button in the modal work
          $plotBtn.on('click', function(e) {
              e.preventDefault();
              // This calls the popup function from graph.js
              showPlotSelectionPopup(obsID, gti.GTI); 
          });
          // === 🎨 END OF FIX 🎨 ===

          const $downloadGtiBtn = $('<button>')
            .addClass('btn btn-secondary download-data')
            .attr('data-type', 'gti')
            .attr('data-obs-id', obsID)
            .attr('data-gti', gti.GTI)
            .html('<i class="fas fa-download"></i> Download');
            
          $buttonContainer.append($plotBtn, $downloadGtiBtn);
          $actionCell.append($buttonContainer);
          $GTI_ROW.append($actionCell);

          $GTI_TABLE.append($GTI_ROW);
        }
      });

      const $SELECT_ALL = $('<input>', { type: 'checkbox' });
      $GTI_HEADER.find('th:first').append($SELECT_ALL);
      $GTI_HEADER
        .find('th:first')
        .contents()
        .wrapAll($('<label>', { class: 'checkboxes' }));

      // 3. Build the GTI form (for plotting selected GTIs from modal)
      const $GTI_FORM = $('<form>', {
        id: `info-fetch-gti-${obsID}`,
        class: 'fetch-gti',
      });
      $GTI_FORM.append(
        $('<input>', { name: 'gti-search', type: 'hidden', value: '' }),
        $('<input>', { name: 'plot_type', type: 'hidden', value: 'spectrum' }),
        $('<input>', { name: 'obs_id', type: 'hidden', value: obsID })
      );
      const $GRAPH_BUTTON = $('<button>', {
        class: 'graph-selected-gtis hide',
        text: 'Graph Selected GTIs',
        type: 'submit',
      });

      // 4. Attach event handlers for modal
      $SELECT_ALL.on('change', function () {
        const IS_CHECKED = $(this).is(':checked');
        $GTI_TABLE
          .find('.gti-checkbox')
          .prop('checked', IS_CHECKED)
          .trigger('change');
      });

      $GTI_TABLE.on('change', '.gti-checkbox', function () {
        const $form = $modalBody.find('.fetch-gti');
        const $graphButton = $form.find('.graph-selected-gtis');
        let selectedGTIs = [];
        $GTI_TABLE
          .find('.gti-checkbox:checked')
          .each(function () {
            selectedGTIs.push($(this).closest('tr').attr('data-gti'));
          });
        $form.find('input[name="gti-search"]').val(selectedGTIs.join(','));
        $graphButton.toggle(selectedGTIs.length > 0);
      });

      // This is the AJAX for plotting *from the modal*
      $GTI_FORM.on('submit', function (event) {
        event.preventDefault();
        let formData = $(this).serialize();
        formData += `&csrfmiddlewaretoken=${$("input[name='csrfmiddlewaretoken']").val()}`;
        formData += `&quality=${$('#quality-select').val().toLowerCase()}`;
        const operationId = 'single-plot-' + Date.now();
        const plotTypeText = formData.match(/plot_type=([^&]+)/)?.[1] || 'plot';
        startOperation(operationId, 'Generating ' + plotTypeText.replace(/_/g, ' ') + '...');
        
        $.ajax({
          type: 'POST',
          url: PLOT_GTI_URL,
          data: formData,
          success: (response) => {
            if (response.error) {
              console.error('Server error:', response.error);
              errorOperation(operationId, `Error: ${response.error}`);
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
              completeOperation(operationId, plotType.replace(/_/g, ' ') + ' plot updated successfully');
            } else {
              completeOperation(operationId, 'Plot data processed');
            }
          },
          error: (xhr, status, error) => {
            console.error('Error fetching GTI plot:', error);
            errorOperation(operationId, 'Error fetching GTI plot');
            alert('Error fetching GTI plot. Please try again.');
          },
        });
      });

      // 5. Append to modal and show
      $modalBody.append($GTI_TABLE);
      $GTI_FORM.append($GRAPH_BUTTON);
      $modalBody.append($GTI_FORM);

      $('#gti-modal-title').text(`GTI Details for ObsID: ${obsID}`);
      $('#gti-modal').show();
      completeOperation('gti-build', `GTI table for ${obsID} loaded.`);
    });
    
    // --- 6. Show the main results container ---
    $CONTAINER.removeClass('hide'); // Use removeClass to show it

  } else {
    // No info found
    $CONTAINER.addClass('hide'); // Use addClass to hide it
    alert("No observation data found for this ID.");
  }

  MathJax.typeset();
}


// ***************************************************
// THIS FUNCTION IS UNCHANGED
// ***************************************************
export function handleMultipleObservations(observations, sourceName) {
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

          const dataCells = [
            [obs.obs_id || 'N/A', null],
            [firstGTI.TSTART_MJD_UTC, 5],
            [dateInfo.formattedWithoutSeconds, null],
            [firstGTI.EXPTIME, 2],
            [firstGTI.USHOOT_NET_RATE, 4],
            [firstGTI.OSHOOT_NET_RATE, 4],
            [firstGTI.GOODX_5_12_RATE, 4],
          ];

          dataCells.forEach(([value, decimals], index) => {
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

            if (index === 0) {
              cell.style.cursor = 'pointer';
              cell.style.color = 'var(--primary-color, #007bff)';
              cell.style.fontWeight = 'bold';
              cell.title = `Select observation ${obs.obs_id}`;

              cell.addEventListener('click', () => {
                $('#obs-id-dropdown').show();
                $('#source-name-dropdown').hide();
                $('#observation-search').val(obs.obs_id);
                $('#search-type').val('obs_id').change();
                $('#plot-graph').submit();
                container.remove();
              });
            }

            row.appendChild(cell);
          });

          tbody.appendChild(row);
        }
      } catch (error) {
        console.error(
          `Error fetching details for observation ${obs.obs_id}:`,
          error,
        );
        
        const errorRow = document.createElement('tr');
        errorRow.className = 'obs-row';

        const errorObsIdCell = document.createElement('td');
        errorObsIdCell.style.padding = '8px 12px';
        errorObsIdCell.style.borderBottom = '1px solid #ddd';
        errorObsIdCell.textContent = obs.obs_id;
        errorObsIdCell.style.cursor = 'pointer';
        errorObsIdCell.style.color = 'var(--primary-color, #007bff)';
        errorObsIdCell.style.fontWeight = 'bold';
        errorObsIdCell.title = `Select observation ${obs.obs_id}`;
        errorObsIdCell.addEventListener('click', () => {
          $('#obs-id-dropdown').show();
          $('#source-name-dropdown').hide();
          $('#observation-search').val(obs.obs_id);
          $('#search-type').val('obs_id').change();
          $('#plot-graph').submit();
          container.remove();
        });
        errorRow.appendChild(errorObsIdCell);

        const errorMessageCell = document.createElement('td');
        errorMessageCell.style.padding = '8px 12px';
        errorMessageCell.style.borderBottom = '1px solid #ddd';
        errorMessageCell.colSpan = 6;
        errorMessageCell.textContent = 'Error loading observation details';
        errorRow.appendChild(errorMessageCell);
        
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


// ***************************************************
// THIS FUNCTION IS UNCHANGED
// ***************************************************
async function fetchSourceSummary(observations) {
  console.log('Fetching source summary for observations:', observations);

  const operationId = 'source-summary-' + Date.now();
  startOperation(operationId, 'Loading source summary for ' + observations.length + ' observation(s)...');

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
      'Overshoot Rate Range (s⁻N¹)': formatMinMax(
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
    completeOperation(operationId, 'Source summary loaded successfully');
  } catch (error) {
    console.error('Error fetching source summary data:', error);
    errorOperation(operationId, 'Error loading source summary');
    $container.html(
      '<div class="error">Error loading source summary. Please try again.</div>',
    );
  }

  return $container[0];
}

// *** 🎨 NEW AJAX HANDLERS + MODAL LOGIC 🎨 ***
$(function() {
  
  // --- 1. FIX: AJAX handler for the MAIN search form ---
  // This stops the page from reloading
  $('#plot-graph').on('submit', function(event) {
      event.preventDefault();
      console.log('Main search form submitted (AJAX)');
      
      // We must manually add the quality value if it's not in the form
      let formData = $(this).serialize();
      if (formData.indexOf('quality=') === -1) {
          formData += `&quality=${$('#quality-select').val().toLowerCase()}`;
      }
      
      startOperation('main-search', 'Searching...');
      
      $.ajax({
          type: 'POST',
          url: PLOT_GRAPH_URL, // This is /plots/plot_data
          data: formData,
          success: (response) => {
              if (response.error) {
                  errorOperation('main-search', response.error);
                  alert(response.error);
                  $('#observation-details').addClass('hide'); // Hide results on error
                  return;
              }
              if (response.info && response.info.length > 0) {
                  displayInfo(response.info); // This populates the new layout
                  completeOperation('main-search', 'Search complete.');
                  $('#plots').empty(); // Clear old plots
              } else {
                  $('#observation-details').addClass('hide'); // Hide results
                  alert('No observation data found for this ID.');
                  completeOperation('main-search', 'No info found.');
              }
          },
          error: (xhr) => {
              errorOperation('main-search', 'Server error');
              alert('Error searching. Check console.');
              $('#observation-details').addClass('hide');
          }
      });
  });

  // --- 2. NEW: AJAX handler for the PLOT SELECTION form ---
  // This makes your new "plot" button work
  $('#plot-selection-form').on('submit', function(event) {
      event.preventDefault();
      console.log('Plot selection form submitted (AJAX)');
      
      let formData = $(this).serialize();
      
      // Check if any plot types are selected
      if (formData.indexOf('plot_types=') === -1) {
          alert('Please select at least one plot type.');
          return;
      }

      const operationId = 'plot-gen-' + Date.now();
      startOperation(operationId, 'Generating plots...');
      $('#plots').html(''); // Clear old plots and show loading

      $.ajax({
          type: 'POST',
          url: PLOT_GRAPH_URL, // This also goes to plot_data
          data: formData,
          success: (response) => {
              if (response.error) {
                  errorOperation(operationId, response.error);
                  alert(response.error);
                  return;
              }
              
              if (response.plotDivs && response.plotDivs.length > 0) {
                  $('#plots').empty(); // Clear loading
                  response.plotDivs.forEach(plotDiv => {
                      $('#plots').append(plotDiv);
                  });
                  MathJax.typeset();
                  completeOperation(operationId, 'Plots generated successfully.');
              } else {
                  completeOperation(operationId, 'No plot data returned.');
                  $('#plots').html('<p>No plot data returned for selection.</p>');
              }
          },
          error: (xhr) => {
              errorOperation(operationId, 'Plot generation failed.');
              alert('Error generating plots. Check console.');
              $('#plots').html('<p>Error generating plots.</p>');
          }
      });
  });


  // --- 3. MODAL LOGIC (Unchanged from your file) ---
  console.log('Modal script: Document ready.');
  const $modal = $('#gti-modal');

  if ($modal.length === 0) {
    console.error('Modal script: Could not find modal #gti-modal!');
    return;
  }
  if ($modal.data('handler-attached')) {
    console.warn('Modal script: Handlers already attached.');
    return;
  }
  
  console.log('Modal script: Found modal. Attaching handlers...');
  const $closeBtn = $modal.find('.modal-close-btn');

  if ($closeBtn.length === 0) {
    console.error('Modal script: Could not find .modal-close-btn inside modal!');
  }

  // Define the new *simplified* close function
  const closeModal = () => {
    console.log('Modal script: closeModal() CALLED.');
    try {
      const $modalBody = $('#gti-modal-body');
      
      console.log('Modal script: Emptying modal body.');
      $modalBody.empty(); // This destroys the table and prevents memory leaks
      $modalBody.removeData('original-container');

      console.log('Modal script: Attempting to hide modal:');
      $modal.hide();
      console.log('Modal script: Modal hidden.');
    } catch (e) {
      console.error('Modal script: ERROR inside closeModal()!', e);
    }
  };

  // Attach handlers
  $closeBtn.off('click').on('click', closeModal);
  console.log('Modal script: Attached click handler to .modal-close-btn.');

  $modal.off('click').on('click', function (event) {
    if ($(event.target).is($modal)) {
      console.log('Modal script: Click outside modal detected.');
      closeModal();
    }
  });
  console.log('Modal script: Attached click-outside handler to #gti-modal.');

  $(document)
    .off('keydown.gDtiModal')
    .on('keydown.gDtiModal', function (event) {
      if (event.key === 'Escape' && $modal.is(':visible')) {
        console.log('Modal script: Escape key pressed.');
        closeModal();
      }
    });
  console.log('Modal script: Attached Escape key handler.');

  $modal.data('handler-attached', true);
  console.log('Modal script: Set handler-attached flag to true.');
});

*/
// --- observationInfo.js (v15 - Vanilla JS Fix) ---
console.log("observationInfo.js (v15) loaded.");

import { showPlotSelectionPopup } from './graph.js';
import { startOperation, completeOperation } from './statusBar.js';

// --- GLOBAL STATE ---
let currentGTIData = null;
let currentObsID = null;

// --- GLOBAL EVENT LISTENERS (Vanilla JS) ---
// This runs immediately and attaches a listener to the entire document.
// It cannot be overwritten by jQuery conflicts.
document.addEventListener('click', function(event) {
    const target = event.target;
    
    // 🔍 DEBUG LOG: Uncomment this if you want to see EVERY click
    // console.log("Click detected on:", target);

    // 1. Handle "Show GTI" Button
    if (target && (target.id === 'show-gti-btn' || target.closest('#show-gti-btn'))) {
        event.preventDefault();
        console.log("👇 Show GTI button clicked (Vanilla JS detected)");

        if (!currentGTIData || !currentObsID) {
            console.warn("⚠️ Data not ready.");
            // Check if button is visually disabled
            if (!document.getElementById('show-gti-btn').disabled) {
                alert("Please wait, GTI data is loading...");
            }
            return;
        }
        openGTIModal(currentObsID, currentGTIData);
    }

    // 2. Handle "Close (X)" Button
    // We check if the target HAS the class, or is INSIDE the class
    if (target && (target.classList.contains('modal-close-btn') || target.closest('.modal-close-btn'))) {
        event.preventDefault();
        console.log("❌ Close button clicked (Vanilla JS detected)");
        document.getElementById('gti-modal').style.display = 'none';
    }

    // 3. Handle Background Click
    if (target && target.id === 'gti-modal') {
        console.log("🌑 Background clicked (Vanilla JS detected)");
        document.getElementById('gti-modal').style.display = 'none';
    }
});

// Handle Escape Key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('gti-modal');
        if (modal && modal.style.display !== 'none') {
            console.log("⌨️ Escape pressed");
            modal.style.display = 'none';
        }
    }
});


/**
 * Called by plot.js when data arrives.
 */
export function displayInfo(info) {
  console.log('📥 displayInfo called with data.');

  if (info && info.length > 0) {
    const OBS_BY_OBS_ID = info.reduce((acc, row) => {
      const OBS_ID = row.OBSID || '';
      if (!acc[OBS_ID]) acc[OBS_ID] = [];
      acc[OBS_ID].push(row);
      return acc;
    }, {});

    const obsID = Object.keys(OBS_BY_OBS_ID)[0];
    
    // Update Global State
    currentObsID = obsID;
    currentGTIData = OBS_BY_OBS_ID[obsID];
    
    console.log(`💾 Saved ${currentGTIData.length} rows for ObsID ${obsID}. Enabling button.`);

    // Enable button using jQuery for convenience (visuals only)
    $('#show-gti-btn').prop('disabled', false).text("Show GTI's");
    $('#observation-details').removeClass('hide').show();

  } else {
    console.warn("⚠️ No info data received.");
    $('#show-gti-btn').prop('disabled', true).text("Show GTI's (No Data)");
  }
}

/**
 * Builds the table HTML and puts it in the modal.
 */
function openGTIModal(obsID, rows) {
    const $modalBody = $('#gti-modal-body');
    $modalBody.empty();
    
    startOperation('gti-build', 'Building table...');

    const GTI_INFO = {
        headers: ['Select', 'GTI', 'MJD', 'Exposure (s)', 'Detectors', 'Undershoot', 'Overshoot', 'COR SAX', 'Actions'],
        keys: [null, 'GTI', 'TSTART_MJD_UTC', 'EXPTIME', 'NDETS_USED', 'USHOOT_NET_RATE', 'OSHOOT_NET_RATE', 'COR_SAX', null],
        precision: [null, null, 5, 2, 0, 2, 4, 3, null]
    };

    const $GTI_TABLE = $('<table>', { class: 'gti-table', 'data-obs-id': obsID });
    const $GTI_HEADER = $('<tr>');
    GTI_INFO.headers.forEach((header) => $GTI_HEADER.append($('<th>', { text: header })));
    $GTI_TABLE.append($GTI_HEADER);

    rows.forEach((gti) => {
        if (gti.GTI !== undefined) {
            const $GTI_ROW = $('<tr class="gti-row">');
            $GTI_ROW.attr('data-gti', gti.GTI);

            const $CHECKBOX_CELL = $('<td>').append($('<input type="checkbox" class="gti-checkbox">'));
            $GTI_ROW.append($CHECKBOX_CELL);

            GTI_INFO.keys.slice(1, -1).forEach((key, keyIdx) => {
                let value = gti[key];
                if (GTI_INFO.precision[keyIdx + 1] !== null && value !== undefined) {
                    value = Number(value).toFixed(GTI_INFO.precision[keyIdx + 1]);
                }
                $GTI_ROW.append($(`<td>${value || '-'}</td>`));
            });

            const $actionCell = $('<td>');
            // Plot Button (Inner)
            const $plotBtn = $('<button>').addClass('btn btn-primary plot-gti').html('<i class="fas fa-chart-line"></i> Plot');
            
            // Attach click handler directly to this dynamic button
            $plotBtn.on('click', function(e) {
                e.preventDefault();
                e.stopPropagation(); // Stop bubbling so it doesn't trigger other things
                $('#gti-modal').hide(); 
                showPlotSelectionPopup(obsID, gti.GTI); 
            });

            const $downloadGtiBtn = $('<button>').addClass('btn btn-secondary download-data').html('<i class="fas fa-download"></i> Download')
                .attr('data-type', 'gti').attr('data-obs-id', obsID).attr('data-gti', gti.GTI);
            
            $actionCell.append($('<div>').addClass('actions-container').append($plotBtn, $downloadGtiBtn));
            $GTI_ROW.append($actionCell);
            $GTI_TABLE.append($GTI_ROW);
        }
    });

    // Select All
    const $SELECT_ALL = $('<input>', { type: 'checkbox' });
    $GTI_HEADER.find('th:first').append($SELECT_ALL);
    $SELECT_ALL.on('change', function () {
        $GTI_TABLE.find('.gti-checkbox').prop('checked', $(this).is(':checked')).trigger('change');
    });

    // Multi-Plot Form
    const $GTI_FORM = $('<form>', { class: 'fetch-gti' });
    $GTI_FORM.append($('<input>', { name: 'gti-search', type: 'hidden' }));
    $GTI_FORM.append($('<input>', { name: 'plot_type', type: 'hidden', value: 'spectrum' }));
    $GTI_FORM.append($('<input>', { name: 'obs_id', type: 'hidden', value: obsID }));
    
    const $GRAPH_BUTTON = $('<button>', {
        class: 'graph-selected-gtis hide',
        text: 'Graph Selected GTIs',
        type: 'submit',
        style: 'margin-top: 10px;'
    });

    $GTI_TABLE.on('change', '.gti-checkbox', function () {
        const selectedGTIs = [];
        $GTI_TABLE.find('.gti-checkbox:checked').each(function () {
            selectedGTIs.push($(this).closest('tr').attr('data-gti'));
        });
        $GTI_FORM.find('input[name="gti-search"]').val(selectedGTIs.join(','));
        if(selectedGTIs.length > 0) { $GRAPH_BUTTON.removeClass('hide').show(); } 
        else { $GRAPH_BUTTON.addClass('hide').hide(); }
    });

    $modalBody.append($GTI_TABLE);
    $GTI_FORM.append($GRAPH_BUTTON);
    $modalBody.append($GTI_FORM);
    
    $('#gti-modal-title').text(`GTI Details for ObsID: ${obsID}`);
    
    // Show the modal using jQuery (interoperable with vanilla hide)
    $('#gti-modal').show();
    completeOperation('gti-build', `GTI table loaded.`);
}

export function handleMultipleObservations() {}
// ***************************************************
// SOURCE SUMMARY HELPER FUNCTION
// ***************************************************
async function fetchSourceSummary(observations) {
  console.log('Fetching source summary for observations:', observations);

  const operationId = 'source-summary-' + Date.now();
  startOperation(operationId, 'Loading source summary for ' + observations.length + ' observation(s)...');

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
      'Overshoot Rate Range (s⁻N¹)': formatMinMax(
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
    completeOperation(operationId, 'Source summary loaded successfully');
  } catch (error) {
    console.error('Error fetching source summary data:', error);
    errorOperation(operationId, 'Error loading source summary');
    $container.html(
      '<div class="error">Error loading source summary. Please try again.</div>',
    );
  }

  return $container[0];
}