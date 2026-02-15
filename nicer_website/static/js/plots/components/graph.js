/* graph.js v200 - Title Fix & Safe Linking
   - FIX: Renames long titles (with multiple ObsIDs) to "COMBINED [TYPE]".
   - FIX: Imports interactiveLinking.js?v=2000 to prevent crashes.
*/
import { displayInfo, handleMultipleObservations } from './observationInfo.js';
import { GTISelection } from './gtiComponents.js';
import { updateAllSelections, initSynchronizedSelection } from './syncSelection.js?v=2000';
import { initInteractiveLinking } from './interactiveLinking.js?v=2000'; // 🟢 FORCE v2000
import { fetchGTIPlot } from './gtiPlots.js';
import { startOperation, completeOperation, errorOperation } from './statusBar.js';

function addPopupStyles() {
  if (document.getElementById('popup-styles')) return;
  const styles = `
        .popup-container { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.5); z-index: 1000; justify-content: center; align-items: center; animation: fadeIn 0.3s ease-out; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideIn { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .popup-content { background-color: #fff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2); width: 90%; max-width: 500px; padding: 0; position: relative; animation: slideIn 0.3s ease-out; }
        .popup-title { background-color: #505050; color: white; padding: 15px 20px; font-size: 18px; font-weight: bold; border-top-left-radius: 8px; border-top-right-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
        .popup-close { background: none; border: none; color: white; font-size: 24px; cursor: pointer; padding: 0; margin: 0; line-height: 1; transition: transform 0.2s; }
        .popup-close:hover { transform: scale(1.2); }
        .plot-type-form { padding: 20px; background-color: #f5f5f5; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px; }
        .plot-option { margin-bottom: 15px; display: flex; align-items: center; }
        .plot-option input[type="checkbox"] { margin-right: 10px; width: 18px; height: 18px; }
        .plot-option label { font-size: 16px; cursor: pointer; color: #333; }
        .plot-submit-btn { background-color: #666666; color: black; border: none; padding: 10px 20px; border-radius: 4px; font-size: 16px; cursor: pointer; margin-top: 10px; transition: background-color 0.2s, color 0.2s; width: 100%; }
        .plot-submit-btn:hover { background-color: #555555; color: white; }
    `;
  const styleElement = document.createElement('style');
  styleElement.id = 'popup-styles';
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

export function showPlotSelectionPopup(obsID, gti = null) {
  addPopupStyles();
  let $popup = $('#plot-selection-popup');
  if ($popup.length === 0) {
    $popup = $('<div>', { id: 'plot-selection-popup', class: 'popup-container' });
    const $content = $('<div>', { class: 'popup-content' });
    const $title = $('<div>', { class: 'popup-title', text: 'Select Plot Types' });
    const $closeBtn = $('<button>', { class: 'popup-close', text: '×' });
    $title.append($closeBtn);
    $content.append($title);
    $popup.append($content);
    $('body').append($popup);
    $popup.on('click', function (e) { if (e.target === this) $popup.fadeOut(200); });
    $popup.on('click', '.popup-close', function () { $popup.fadeOut(200); });
  }

  const $content = $popup.find('.popup-content');
  $content.find('.popup-title').text(`Select Plot Types for Observation ID: ${obsID}`).append($('<button>', { class: 'popup-close', text: '×' }));
  $content.find('form').remove();

  const $form = $('<form>', { id: 'plot-type-form', class: 'plot-type-form' });
  if (gti) { $form.attr('data-gti', gti); }

  const plotTypes = [
    { id: 'spectrum', name: 'Spectrum' },
    { id: 'summed-spectrum', name: 'Summed Spectrum' },
    { id: 'light-curve', name: 'Light Curve' },
    { id: 'power-density-spectrum', name: 'Comparing Power Density Spectrum' },
    { id: 'hardness-intensity-diagram', name: 'Hardness Intensity Diagram' },
    { id: 'global-hid', name: 'Global HID Diagram' }
  ];

  plotTypes.forEach((type) => {
    const $option = $('<div>', { class: 'plot-option' });
    $option.append($('<input>', { type: 'checkbox', id: `${type.id}-checkbox`, name: type.id, value: 'on' }));
    $option.append($('<label>', { for: `${type.id}-checkbox`, text: type.name }));
    $form.append($option);
  });

  $form.append($('<input>', { type: 'hidden', name: 'obs_id', value: obsID }));
  $form.append($('<button>', { type: 'submit', class: 'plot-submit-btn', text: 'Generate Plots' }));

  $form.on('submit', function (event) {
    event.preventDefault();
    $popup.fadeOut(200);
    const gti = $(this).attr('data-gti');
    
    if (gti) {
      const selectedPlotTypes = [];
      $(this).find('input[type="checkbox"]:checked').each(function() { selectedPlotTypes.push($(this).attr('name')); });
      if (selectedPlotTypes.length === 0) { alert('Please select at least one plot type.'); return; }
      selectedPlotTypes.forEach(plotType => {
        const $gtiForm = $('<form>');
        $gtiForm.append($('<input>', { name: 'gti-search', type: 'hidden', value: gti }));
        $gtiForm.append($('<input>', { name: 'plot_type', type: 'hidden', value: plotType.replace(/-/g, '_') }));
        $gtiForm.append($('<input>', { name: 'obs_id', type: 'hidden', value: obsID }));
        $gtiForm.append($('<input>', { name: 'min_value', type: 'hidden', value: '1' }));
        const mockEvent = { preventDefault: () => {}, target: $gtiForm[0] };
        fetchGTIPlot(mockEvent);
      });
    } else {
      fetchGraphPlots(false, event);
    }
  });

  $content.append($form);
  $popup.css('display', 'flex').hide().fadeIn(300);
}

export function fetchGraphPlots(refresh = false, event) {
  const REGEX = /"title":\{"text":"(.+?)"\}/;
  if (!event || !event.target) { return; }
  let serializedData = $(event.target).serialize();
  event.preventDefault();

  if (serializedData.indexOf('csrfmiddlewaretoken') === -1) {
    serializedData += `&csrfmiddlewaretoken=${$("input[name='csrfmiddlewaretoken']").val()}`;
  }
  if (serializedData.indexOf('quality') === -1) {
    serializedData += `&quality=${$('#quality-select').val().toLowerCase()}`;
  }

  const operationId = 'fetch-plots-' + Date.now();
  const obsId = serializedData.match(/obs_id=([^&]+)/)?.[1] || 'unknown';
  startOperation(operationId, 'Loading data for observation ' + obsId + '...');

  $.ajax({
    type: 'POST',
    url: PLOT_GRAPH_URL,
    data: serializedData,
    success: function (response) {
      if (refresh) { removePlots(); }
      if (response.error) {
        errorOperation(operationId, 'Error: ' + response.error);
        alert(`${response.error}`);
        return;
      }
      if (response.multiple_observations) {
        completeOperation(operationId, 'Found multiple observations');
        handleMultipleObservations(response.obs_ids, response.source);
        return;
      }
      if (response.info && (!response.plotDivs || response.plotDivs.length === 0)) {
          displayInfo(response.info);
          completeOperation(operationId, 'GTI Data Loaded.');
          return;
      }
      if (response.info) { displayInfo(response.info); }

      const hasPlotTypes = serializedData.includes('plot_types=') || serializedData.includes('spectrum=') || serializedData.includes('global_hid=') || serializedData.includes('global-hid=');

      if (hasPlotTypes && response.plotDivs && response.plotDivs.length > 0) {
        response.plotDivs.forEach((plotDiv, i) => {
          let PLOT_ID, TYPE, rawTitle;
          try {
             rawTitle = REGEX.exec(plotDiv)[1];
             PLOT_ID = rawTitle.toLowerCase().replace(/[^a-z0-9-]/g, '-'); 
             
             let cleanObsId = (response.obsID || obsId).replace(/,/g, '-');
             TYPE = PLOT_ID.replace(`-${cleanObsId}`, '');
             TYPE = TYPE.replace(/-+$/, ''); // Trim trailing dashes

             if(TYPE.includes('global')) TYPE = 'global_hid';
             if(TYPE.includes('hardness')) TYPE = 'hardness_intensity_diagram';
          } catch(e) {
             TYPE = 'plot-' + i;
             PLOT_ID = 'plot-' + i + '-' + obsId;
          }

          // Create Container
          if (!$(`#${TYPE}-section`).length) {
            const $PLOT_SECTION = $('<div>', { id: `${TYPE}-section`, class: 'plot-type-section' });
            
            // 🟢 TITLE FIX LOGIC:
            // If the raw title has multiple IDs (more than one 10-digit number),
            // or if it explicitly looks like a list, use "COMBINED".
            let titleText = TYPE.replace(/_/g, ' ').replace(/-/g, ' ').toUpperCase();
            
            // Check if Raw Title has multiple ObsIDs (e.g. 0010230101 0010230102...)
            if (rawTitle && (rawTitle.match(/\d{10}/g) || []).length > 1) {
                // If it's a spectrum, call it COMPARING ENERGY SPECTRUM
                if (titleText.includes("SPECTRUM")) titleText = "COMPARING ENERGY SPECTRUM";
                else if (titleText.includes("LIGHT")) titleText = "COMBINED LIGHT CURVE";
                else titleText = "COMBINED " + titleText;
            }

            $PLOT_SECTION.append($('<h3>', { text: titleText }));
            $('#plots').append($PLOT_SECTION);
          }
          
          // if ($(`#${PLOT_ID}`).length === 0) {
          //   const $PLOT_DIV = $(plotDiv).attr('id', PLOT_ID);

          //   if (TYPE !== 'summed_spectrum' && TYPE !== 'global_hid' && response.maxGTI) {
          //      const maxVal = response.maxGTI[i];
          //      if (maxVal !== undefined && maxVal > 0) {
          //          const GTI_FORM = GTISelection(maxVal, response.obsID || obsId, TYPE);
          //          $PLOT_DIV.append(GTI_FORM);
          //      }
          //   }
          //   $(`#${TYPE}-section`).append($PLOT_DIV);
          // }
          if ($(`#${PLOT_ID}`).length === 0) {
            const $PLOT_DIV = $(plotDiv).attr('id', PLOT_ID);
            $(`#${TYPE}-section`).append($PLOT_DIV);
          }
          updateCombineButtonVisibility(TYPE);
        });

        if (window.MathJax) MathJax.typeset();
        
        // 🟢 LOAD v2000 SCRIPTS
        setTimeout(() => { 
            initSynchronizedSelection(); 
            updateAllSelections(); 
            initInteractiveLinking(); 
        }, 800);
        
        completeOperation(operationId, 'Plots loaded.');
        
      } else if (!response.info) {
          completeOperation(operationId, 'No plots generated.');
      } else {
         completeOperation(operationId, 'Loaded.');
      }
      
      const currentObsId = response.obsID || obsId;
      if (currentObsId && !$(`#remove-${currentObsId.replace(/,/g, '-')}`).length && hasPlotTypes && response.plotDivs) {
        // Only show remove button if it's NOT a giant combined list
        if ((currentObsId.match(/,/g) || []).length < 3) {
            const safeId = currentObsId.replace(/,/g, '-');
            const REMOVE_BUTTON = $('<button>', { id: `remove-${safeId}`, class: 'remove-observation-btn', text: `Remove ${currentObsId}` });
            REMOVE_BUTTON.click(function () { removePlots({obsID: currentObsId}, REMOVE_BUTTON); });
            $('#remove-obs').append(REMOVE_BUTTON);
        }
      }
    },
    error: function (_, textStatus, errorThrown) {
      console.error('AJAX error:', textStatus, errorThrown);
      errorOperation(operationId, 'Network error occurred');
      alert('An error occurred while fetching data. Please try again.');
    },
  });
}

export function removePlots(response, removeButton) {
  if (!response && !removeButton) {
      $('#plots').empty();
      $('#remove-obs').empty();
      setTimeout(() => { updateAllSelections(); }, 100);
      return;
  }
  if (response && response.obsID) {
      $('.plot-type-section').each(function () {
        const TYPE = this.id.replace('-section', '');
        // Try precise match then fuzzy match
        let target = $(this).find(`[id*="${response.obsID.replace(/,/g, '-')}"]`);
        target.remove();
        
        if ($(this).children('div').length == 0) { $(this).remove(); }
        updateCombineButtonVisibility(TYPE);
      });
      $(`[data-obs-id="${response.obsID}"]`).remove();
      if ($('#obs-info-table').find('tr').length <= 1) { $('#obs-info').hide(); $('#add-obs').hide(); }
      if (removeButton) $(removeButton).remove();
      setTimeout(() => { updateAllSelections(); }, 500);
  }
}

export function updateCombineButtonVisibility(plotType) {
  let obsIDs = new Set();
  $(`#${plotType}-section`).children('div').each(function () { 
      // Simple count of plots
      obsIDs.add(this.id);
  });
  $(`.combine-gtis:has(input[name="plot_type"][value="${plotType}"])`).toggle(obsIDs.size >= 2);
}