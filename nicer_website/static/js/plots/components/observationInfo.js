// --- observationInfo.js (v15.1 - Integrated GTI Sync) ---
console.log("observationInfo.js (v15.1) loaded.");

import { showPlotSelectionPopup, fetchGraphPlots } from './graph.js?v=301';
import { showGTIPlotSelectionPopup, fetchGTIPlot } from './gtiPlots.js?v=301';
import { startOperation, completeOperation, errorOperation } from './statusBar.js?v=301';
import { mjdToDate } from '../utils/dateUtils.js';

// --- GLOBAL STATE ---
let currentGTIData = null;
let currentObsID = null;

// --- GLOBAL EVENT LISTENERS (Vanilla JS) ---
document.addEventListener('click', function(event) {
    const target = event.target;
    
    // 1. Handle "Show GTI" Button
    if (target && (target.id === 'show-gti-btn' || target.closest('#show-gti-btn'))) {
        event.preventDefault();
        console.log("👇 Show GTI button clicked (Vanilla JS detected)");

        if (!currentGTIData || !currentObsID) {
            console.warn("⚠️ Data not ready yet. Ignoring click.");
            return;
        }
        openGTIModal(currentObsID, currentGTIData);
    }

    // 2. Handle "Close (X)" Button
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
                showGTIPlotSelectionPopup(obsID, [gti.GTI]); 
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