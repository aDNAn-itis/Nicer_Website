/* global Plotly */

import { displayInfo, handleMultipleObservations } from './observationInfo.js';
import { GTISelection } from './gtiComponents.js';
import { updateAllSelections, initSynchronizedSelection } from './syncSelection.js';
import { initInteractiveLinking } from './interactiveLinking.js'; 
import { fetchGTIPlot } from './gtiPlots.js';
import { startOperation, completeOperation, errorOperation } from './statusBar.js';
import { updateTheaterFrame } from './lcTheater.js';

// Initialize LC Theater Playlist
window.lcTheaterPlaylist = window.lcTheaterPlaylist || [];

// Global Delegation for Theater
$(document).off("click", "#btn-open-theater").on("click", "#btn-open-theater", function() {
  if (typeof window.openLCTheater === "function") {
    window.openLCTheater();
  }
});


/**
 * Injected Styles for the Plot Selection Popup
 */
function addPopupStyles() {
  if (document.getElementById('popup-styles')) return;
  const styles = `
    .popup-container {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      animation: fadeIn 0.3s ease-out;
    }
    
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    
    @keyframes slideIn {
      from { transform: translateY(-50px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    
    .popup-content {
      background-color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      width: 90%;
      max-width: 500px;
      padding: 0;
      position: relative;
      animation: slideIn 0.3s ease-out;
    }
    
    .popup-title {
      background-color: #505050;
      color: white;
      padding: 15px 20px;
      font-size: 18px;
      font-weight: bold;
      border-top-left-radius: 8px;
      border-top-right-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .popup-close {
      background: none;
      border: none;
      color: white;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      margin: 0;
      line-height: 1;
      transition: transform 0.2s;
    }
    
    .popup-close:hover {
      transform: scale(1.2);
    }
    
    .plot-type-form {
      padding: 20px;
      background-color: #f5f5f5;
      border-bottom-left-radius: 8px;
      border-bottom-right-radius: 8px;
    }
    
    .plot-option {
      margin-bottom: 15px;
      display: flex;
      align-items: center;
    }
    
    .plot-option input[type="checkbox"] {
      margin-right: 10px;
      width: 18px;
      height: 18px;
    }
    
    .plot-option label {
      font-size: 16px;
      cursor: pointer;
      color: #333;
    }
    
    .plot-submit-btn {
      background-color: #666666;
      color: black;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
      margin-top: 10px;
      transition: background-color 0.2s, color 0.2s;
      width: 100%;
    }
    
    .plot-submit-btn:hover {
      background-color: #555555;
      color: white;
    }
  `;
  const styleElement = document.createElement('style');
  styleElement.id = 'popup-styles';
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

/**
 * Show a popup allowing user to pick plot types for a specific Observation or GTI
 */
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
    { id: 'power-density-spectrum', name: 'Power Density Spectrum' },
    { id: 'hardness-intensity-diagram', name: 'Hardness Intensity Diagram' }
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
    const gtiValue = $(this).attr('data-gti');
    
    if (gtiValue) {
      const selectedPlotTypes = [];
      $(this).find('input[type="checkbox"]:checked').each(function() { selectedPlotTypes.push($(this).attr('name')); });
      if (selectedPlotTypes.length === 0) { alert('Please select at least one plot type.'); return; }
      
      selectedPlotTypes.forEach(plotType => {
        const $gtiForm = $('<form>');
        $gtiForm.append($('<input>', { name: 'gti-search', type: 'hidden', value: gtiValue }));
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

/**
 * Main function to fetch plot data from the server and render it using Plotly
 */
export function fetchGraphPlots(refresh = false, event) {
  const REGEX = /"title":\{"text":"(.+?)"\}/;
  if (!event || !event.target) return;
  
  let serializedData = $(event.target).serialize();
  event.preventDefault();

  // Ensure CSRF and Quality are present
  if (serializedData.indexOf('csrfmiddlewaretoken') === -1) {
    serializedData += `&csrfmiddlewaretoken=${$("input[name='csrfmiddlewaretoken']").val()}`;
  }
  if (serializedData.indexOf('quality') === -1) {
    serializedData += `&quality=${$('#quality-select').val().toLowerCase()}`;
  }

  const operationId = 'fetch-plots-' + Date.now();
  const rawObsId = serializedData.match(/obs_id=([^&]+)/)?.[1] || 'unknown';
  const decodedObsId = decodeURIComponent(rawObsId);
  const obsIdCount = decodedObsId.split(',').length;
  
  const displayMessage = obsIdCount > 1 
      ? `Loading combined data for ${obsIdCount} observations...` 
      : `Loading data for observation ${decodedObsId}...`;
  
  // Clear status reporting
  startOperation(operationId, displayMessage);

  $.ajax({
    type: 'POST',
    url: PLOT_GRAPH_URL,
    data: serializedData,
    success: function (response) {
      if (refresh) removePlots();
      
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
        completeOperation(operationId, 'GTI Data successfully loaded.');
        return;
      }

      if (response.info) displayInfo(response.info);

      const hasPlotTypes = serializedData.includes('plot_types=') || serializedData.includes('spectrum=') || serializedData.includes('global_hid=');

      if (hasPlotTypes && response.plotDivs && response.plotDivs.length > 0) {
        response.plotDivs.forEach((plotDiv, i) => {
          let PLOT_ID, TYPE, rawTitle;
          try {
            rawTitle = REGEX.exec(plotDiv)[1];
            PLOT_ID = rawTitle.toLowerCase().replace(/[^a-z0-9-]/g, '-'); 
            
            let cleanObsId = (response.obsID || obsIdInput).replace(/,/g, '-');
            TYPE = PLOT_ID.replace(`-${cleanObsId}`, '').replace(/-+$/, '');

            if(TYPE.includes('global')) TYPE = 'global_hid';
            if(TYPE.includes('hardness')) TYPE = 'hardness_intensity_diagram';
          } catch(e) {
            TYPE = 'plot-' + i;
            PLOT_ID = 'plot-' + i + '-' + obsIdInput;
          }

          // Create the section if it doesn't exist
          let $PLOT_SECTION = $(`#${TYPE}-section`);
          if (!$PLOT_SECTION.length) {
            $PLOT_SECTION = $('<div>', { id: `${TYPE}-section`, class: 'plot-type-section' });
            
            // Dynamic title renaming for Combined views
            let titleText = TYPE.replace(/_/g, ' ').replace(/-/g, ' ').toUpperCase();
            if (rawTitle && (rawTitle.match(/\d{10}/g) || []).length > 1) {
              if (titleText.includes("SPECTRUM")) titleText = "COMPARING ENERGY SPECTRUM";
              else if (titleText.includes("LIGHT")) titleText = "COMBINED LIGHT CURVE";
              else titleText = "COMBINED " + titleText;
            }

            $PLOT_SECTION.append($('<h3>', { text: titleText }));

            const $combineForm = $('<form>', { class: 'combine-gtis', style: 'display: none; margin-bottom: 15px;' });
            $combineForm.append($('<input>', { type: 'hidden', name: 'plot_type', value: TYPE }));
            $combineForm.append($('<button>', { type: 'submit', class: 'btn-search', text: 'Combine GTIs' }));
            $PLOT_SECTION.append($combineForm);

            $('#plots').append($PLOT_SECTION);
          }
          
          // Render the plot div
          if ($(`#${PLOT_ID}`).length === 0) {
            const $PLOT_DIV_WRAPPER = $(plotDiv).attr('id', PLOT_ID);
            
            // Add 'plot-container' class so GTI updates can find the search field
            $PLOT_DIV_WRAPPER.addClass('plot-container');
            
            // Add attributes for reliable targeting by GTI update scripts
            $PLOT_DIV_WRAPPER.attr('data-plot-type', TYPE.replace(/-/g, '_'));
            $PLOT_DIV_WRAPPER.attr('data-obs-id', response.obsID || obsIdInput);
            
            // Manual re-binding of GTI Selection UI inside the loop
            if (TYPE !== 'summed_spectrum' && TYPE !== 'global_hid' && response.maxGTI) {
               const maxVal = response.maxGTI[i];
               const defaultBinning = response.defaultBinnings ? response.defaultBinnings[TYPE] : 1;
               const gtiQuery = response.gtiQuery || '';

               if (maxVal !== undefined && maxVal >= 0) {
                 // We use your component but ensure handlers are attached
                 const $GTI_FORM_HTML = $(GTISelection(maxVal, response.obsID || obsIdInput, TYPE, defaultBinning, gtiQuery));
                 
                 // Force re-attach the submit handler to this fresh HTML
                 $GTI_FORM_HTML.off('submit').on('submit', function(e) {
                   e.preventDefault();
                   try {
                     fetchGTIPlot(e);
                   } catch (err) {
                     console.error("GTI Fetch Error:", err);
                   }
                 });
                 $PLOT_DIV_WRAPPER.append($GTI_FORM_HTML);
               }
            }
            $PLOT_SECTION.append($PLOT_DIV_WRAPPER);
            
            // LC Theater Logic for Global HID - Click registration and Button Injection
            if (TYPE === 'global_hid') {
              // Inject with delay to ensure Plotly is 100% finished
              setTimeout(() => {
                if ($("#theater-btn-container").length === 0) {
                  $("#global_hid-section").append("<div id='theater-btn-container' style='text-align:center; padding:20px; z-index:9999; position:relative;'><button id='btn-open-theater' class='btn btn-lg btn-danger' style='border: 3px solid black; font-weight:bold;'>🎥 OPEN SEQUENCE MOVIE</button></div>");
                }
              }, 500);

              const gd = document.getElementById(PLOT_ID).querySelector('.js-plotly-plot');
              if (gd) {
                gd.on('plotly_click', function(data) {
                  const obsId = data.points[0].text;
                  if (!window.lcTheaterPlaylist.includes(obsId)) { 
                    window.lcTheaterPlaylist.push(obsId); 
                    console.log("Movie Sequence updated:", window.lcTheaterPlaylist); 
                  }
                });
              }
            }
          }
          updateCombineButtonVisibility(TYPE);
        });

        // Standard MathJax render
        if (window.MathJax) MathJax.typeset();
        
        // Re-initialize all linking tools
        setTimeout(() => { 
          initSynchronizedSelection(); 
          updateAllSelections(); 
          initInteractiveLinking(); 
        }, 800);
        
        // Detailed success message
        completeOperation(operationId, 'Successfully rendered ' + response.plotDivs.length + ' interactive plot(s).');
      } else {
        completeOperation(operationId, 'Observation data loaded successfully.');
      }
      
      // Handle Observation removal list
      const currentObsId = response.obsID || obsIdInput;
      if (currentObsId && !$(`#remove-${currentObsId.replace(/,/g, '-')}`).length && hasPlotTypes && response.plotDivs) {
        if ((currentObsId.match(/,/g) || []).length < 3) {
          const safeId = currentObsId.replace(/,/g, '-');
          const REMOVE_BUTTON = $('<button>', { id: `remove-${safeId}`, class: `remove-observation-btn`, text: `Remove Observation ${currentObsId}` });
          REMOVE_BUTTON.click(function () { removePlots({obsID: currentObsId}, REMOVE_BUTTON); });
          $('#remove-obs').append(REMOVE_BUTTON);
        }
      }
    },
    error: function (_, textStatus, errorThrown) {
      console.error('AJAX error:', textStatus, errorThrown);
      errorOperation(operationId, 'Network error: Failed to communicate with server.');
      alert('An error occurred while fetching data. Please try again.');
    }
  });
}

/**
 * Removes plots for a specific observation or empties everything
 */
export function removePlots(response, removeButton) {
  if (!response && !removeButton) {
    $('#plots').empty();
    $('#remove-obs').empty();
    setTimeout(() => { updateAllSelections(); }, 100);
    return;
  }
  if (response && response.obsID) {
    const safeObsId = response.obsID.replace(/,/g, '-');
    
    $('.plot-type-section').each(function () {
      const TYPE = this.id.replace('-section', '');
      
      // Use data-obs-id attribute for reliable removal
      let target = $(this).find(`[data-obs-id="${response.obsID}"]`);
      
      // Fallback to ID-based search if data-attribute fails (for older plots)
      if (target.length === 0) {
        target = $(this).find(`[id*="${safeObsId}"]`);
      }
      
      target.remove();
      
      // Clean up empty sections
      if ($(this).find('.plot-container, .js-plotly-plot').length === 0) {
        $(this).remove();
      }
      updateCombineButtonVisibility(TYPE);
    });

    // Remove from metadata tracking
    $(`[data-obs-id="${response.obsID}"]`).remove();
    
    // Hide info panel if empty
    if ($('#obs-info-table').find('tr').length <= 1) { 
      $('#obs-info').hide(); 
      $('#add-obs').hide(); 
    }

    // Ensure no orphaned buttons remain
    if (removeButton) {
      $(removeButton).remove();
    }
    
    // Final garbage collection of buttons
    syncRemoveButtons();
    
    // Refresh selection tools
    setTimeout(() => { updateAllSelections(); }, 500);
  }
}

/**
 * Synchronizes removal buttons with visible plots.
 * Removes any 'Remove Observation' buttons that don't have matching plots.
 */
function syncRemoveButtons() {
  $('.remove-observation-btn').each(function() {
    const buttonObsId = $(this).attr('id').replace('remove-', '').replace(/-/g, ',');
    const hasPlots = $(`[data-obs-id="${buttonObsId}"]`).length > 0;
    
    // Also check by ID fallback if no data-obs-id found
    const safeId = buttonObsId.replace(/,/g, '-');
    const hasPlotsById = $(`[id*="${safeId}"]`).length > 0;

    if (!hasPlots && !hasPlotsById) {
      $(this).remove();
    }
  });

  // If all buttons are gone, ensure container state is clean
  if ($('.remove-observation-btn').length === 0) {
    $('#remove-obs').empty();
  }
}

/**
 * Determines if the "Combine GTIs" button should be visible
 */
export function updateCombineButtonVisibility(plotType) {
  let obsIDs = new Set();
  $(`#${plotType}-section`).children('div').each(function () { 
    obsIDs.add(this.id);
  });
  $(`.combine-gtis:has(input[name="plot_type"][value="${plotType}"])`).toggle(obsIDs.size >= 2);
}