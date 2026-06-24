/**
 * Fetches and plots GTIs from the search field for the given plot type.
 */
import {
  updateAllSelections,
  initSynchronizedSelection,
} from './syncSelection.js';
import { initInteractiveLinking } from './interactiveLinking.js';
import { initGTICrossLinking } from './gtiCrossLinking.js'; 
import { 
  startOperation, 
  completeOperation, 
  errorOperation, 
} from './statusBar.js';


/**
 * Highlight GTI rows in the observation info table that failed screening.
 * Adds a CSS class and a small badge so the user knows why a GTI is missing
 * from the plot.
 *
 * @param {string} obsID           Observation ID
 * @param {number[]} failedGTIs    GTI numbers that failed screening
 */
export function flagScreenedGTIs(obsID, failedGTIs) {
  if (!failedGTIs || failedGTIs.length === 0) return;

  const $table = $(`.gti-table[data-obs-id="${obsID}"]`);
  if ($table.length === 0) return;

  $table.find('.gti-row').removeClass('screening-failed');
  $table.find('.screening-badge').remove();11

  failedGTIs.forEach((gtiNum) => {int
    const $row = $table.find(`.gti-row[data-gti="GTI${gtiNum}"]`);
    if ($row.length) {
      $row.addClass('screening-failed');
      const $firstDataCell = $row.find('td').eq(1);
      if ($firstDataCell.length && $firstDataCell.find('.screening-badge').length === 0) {
        $firstDataCell.append(
          $('<span>', {
            class: 'screening-badge failed',
            text: 'BG FAIL',
            title: 'Background dominates source in this GTI',
          })
        );
      }
      $row.find('.gti-checkbox').prop('checked', false);
    }
  });
}

/**
 * Displays the screening notification toast.
 */
function showScreeningToast(obsID, summary) {
  if (!summary || summary.failed_gtis === 0) return;
  let $notification = $('#screening-notification');
  if ($notification.length === 0) {
    $notification = $('<div>', { 
      id: 'screening-notification', 
      css: { position: 'fixed', bottom: '20px', right: '20px', padding: '15px 20px', borderRadius: '5px', color: '#fff', zIndex: 9999, fontSize: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' } 
    }).appendTo('body');
  }
  const allFailed = !!summary.all_failed;
  $notification.css('background', allFailed ? '#d9534f' : '#f0ad4e')
               .html(`<strong>Screening Applied</strong><br>${summary.passed_gtis}/${summary.total_gtis} GTIs passed.<br><small>Excluded: ${summary.failed_gti_numbers.join(', ')}</small>`)
               .fadeIn(300);
  setTimeout(() => $notification.fadeOut(500), allFailed ? 8000 : 5000);
  flagScreenedGTIs(obsID, summary.failed_gti_numbers);
}

/**
 * Shows a popup for selecting which plot types to generate for selected GTIs
 * @param {string} obsID The observation ID
 * @param {Array} selectedGTIs Array of selected GTI numbers
 */
export function showGTIPlotSelectionPopup(obsID, selectedGTIs) {
  if (!document.getElementById('popup-styles')) {
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
      
      .plot-option input {
        margin-right: 10px;
        width: 18px;
        height: 18px;
      }
      
      .plot-option label {
        font-size: 16px;
        color: #333;
        cursor: pointer;
      }
      
      .plot-submit-btn {
        background-color: #666666;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 4px;
        font-size: 16px;
        cursor: pointer;
        margin-top: 10px;
        width: 100%;
        transition: background-color 0.2s;
      }
      
      .plot-submit-btn:hover {
        background-color: #555555;
      }
      
      .screening-section {
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid #ddd;
      }
      
      .screening-toggle-container {
        display: flex;
        align-items: center;
        margin-bottom: 10px;
      }
      
      .screening-toggle-container label {
        font-size: 14px;
        font-weight: bold;
        color: #333;
        cursor: pointer;
      }
      
      .screening-options {
        display: none;
        padding: 10px;
        background: #e9e9e9;
        border-radius: 4px;
        margin-top: 10px;
      }
      
      .screening-options.visible {
        display: block;
      }
      
      .screening-option-row {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        gap: 10px;
        font-size: 12px;
      }
      
      .screening-option-row input {
        width: 70px;
        padding: 4px;
        border: 1px solid #ccc;
        border-radius: 3px;
      }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.id = 'popup-styles';
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);
  }

  let $popup = $('#gti-plot-selection-popup');
  if ($popup.length === 0) {
    $popup = $('<div>', { id: 'gti-plot-selection-popup', class: 'popup-container' });
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
  $content.find('.popup-title').text(`Select Plot Types for GTIs: ${selectedGTIs.join(', ')}`);
  $content.find('form').remove();

  const $form = $('<form>', { id: 'gti-plot-type-form', class: 'plot-type-form' });
  const plotTypes = [
    { id: 'spectrum', name: 'Spectrum' },
    { id: 'summed-spectrum', name: 'Summed Spectrum' },
    { id: 'light-curve', name: 'Light Curve' },
    { id: 'power-density-spectrum', name: 'Power Density Spectrum' },
    { id: 'hardness-intensity-diagram', name: 'Hardness Intensity Diagram' },
  ];

  plotTypes.forEach((type) => {
    const $option = $('<div>', { class: 'plot-option' });
    $option.append($('<input>', { type: 'checkbox', id: `gti-${type.id}-checkbox`, name: type.id, value: 'on' }));
    $option.append($('<label>', { for: `gti-${type.id}-checkbox`, text: type.name }));
    $form.append($option);
  });

  const $screeningSection = $('<div>', { class: 'screening-section' });
  const $screeningToggleContainer = $('<div>', { class: 'screening-toggle-container' });
  const $screeningCheckbox = $('<input>', { type: 'checkbox', id: 'gti-apply-screening-checkbox', name: 'apply_screening', value: 'true' });
  $screeningToggleContainer.append($screeningCheckbox, $('<label>', { for: 'gti-apply-screening-checkbox', text: ' Enable Background Screening' }));
  
  const $screeningOptions = $('<div>', { class: 'screening-options', id: 'gti-screening-options' });
  const createRow = (lbl, name, val) => $('<div>', { class: 'screening-option-row' }).append($('<label>', { text: lbl })).append($('<input>', { type: 'number', name: name, value: val, step: 0.1 }));
  $screeningOptions.append(createRow('Energy Low (keV):', 'screening_energy_low', 2.0));
  $screeningOptions.append(createRow('Energy High (keV):', 'screening_energy_high', 5.0));
  $screeningOptions.append(createRow('Min Bad Channels:', 'screening_min_bad_channels', 2));
  
  $screeningSection.append($screeningToggleContainer, $screeningOptions);
  $form.append($screeningSection);
  $screeningCheckbox.on('change', function() { $screeningOptions.toggleClass('visible', $(this).is(':checked')); });

  $form.append($('<input>', { type: 'hidden', name: 'obs_id', value: obsID }));
  $form.append($('<input>', { type: 'hidden', name: 'gti-search', value: selectedGTIs.join(',') }));
  $form.append($('<button>', { type: 'submit', class: 'plot-submit-btn', text: 'Generate Plots' }));

  $content.append($form);

  $form.on('submit', function (event) {
    event.preventDefault();
    $popup.fadeOut(200);
    const selected = [];
    $form.find('input[type="checkbox"]:checked').not('#gti-apply-screening-checkbox').each(function () {
      selected.push($(this).attr('id').replace('gti-', '').replace('-checkbox', ''));
    });

    if (selected.length === 0) { alert('Please select at least one plot type'); return; }

    const opIds = selected.map(type => {
      const opId = 'gti-plot-' + type + '-' + Date.now();
      const gtiText = selectedGTIs.length > 1 ? selectedGTIs.length + ' GTIs' : 'GTI ' + selectedGTIs[0];
      startOperation(opId, `Generating ${type.replace(/-/g, ' ')} for ${gtiText}...`);
      return opId;
    });

    Promise.all(selected.map((type, idx) => {
      let fd = new FormData($form[0]);
      fd.set('plot_type', type);
      fd.set('quality', $('#quality-select').val().toLowerCase());
      fd.set('csrfmiddlewaretoken', $("input[name='csrfmiddlewaretoken']").val());
      return $.ajax({ type: 'POST', url: PLOT_GTI_URL, data: fd, processData: false, contentType: false });
    })).then((responses) => {
      responses.forEach((response, index) => {
        const opId = opIds[index];
        const plotType = selected[index];
        if (response.error) { errorOperation(opId, response.error); return; }
        
        // Target correctly using hyphens
        const cleanObs = obsID.replace(/,/g, '-');
        const plotID = plotType + '-' + cleanObs;
        let $section = $('#' + plotType + '-section');
        if (!$section.length) {
          $section = $('<div>', { id: plotType + '-section', class: 'plot-type-section' });
          $section.append($('<h3>', { text: plotType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') }));
          $('#plots').append($section);
        }

        let $container = $('#' + plotID);
        if (!$container.length) { $container = $('<div>', { id: plotID, class: 'plot-container' }); $section.append($container); }
        $container.html(response.plotDivs[0]);

        if (response.screeningSummary) showScreeningToast(obsID, response.screeningSummary);
        initGTICrossLinking();
        completeOperation(opId, 'Plot generated successfully');
      });
      MathJax.typeset();
      setTimeout(() => { initSynchronizedSelection(); updateAllSelections(); initInteractiveLinking(); }, 500);
    });
  });

  $popup.css('display', 'flex').hide().fadeIn(300);
}

/**
 * Fetches and plots GTIs from the search field for the given plot type.
 * @param {Event} e Event generated by form submit
 */
export async function fetchGTIPlot(e) {
  e.preventDefault();
  const $form = $(e.target);
  const triggeringPlotType = $form.find('input[name="plot_type"]').val();
  const currentObsID = $form.find('input[name="obs_id"]').val();
  
  // Look in the whole container for the search box
  const $searchBox = $form.closest(".plot-container, .plot-type-section").find('input[name="gti-search"]');
  let gtiSearch = $searchBox.length ? $searchBox.val() : undefined;
  
  if (gtiSearch === undefined && window.selectedGtis && window.selectedGtis.length > 0) {
    const obsIdArray = currentObsID.split(',').map(id => id.trim());
    if (obsIdArray.length > 1) {
        gtiSearch = window.selectedGtis
            .filter(item => obsIdArray.includes(item.obsId))
            .map(item => `${item.obsId}-${item.gti}`)
            .join(',');
    } else {
        gtiSearch = window.selectedGtis
            .filter(item => item.obsId === currentObsID)
            .map(item => item.gti)
            .join(',');
    }
    // Update the UI so it doesn't look empty
    $form.closest(".plot-container, .plot-type-section").find('input[name="gti-search"]').val(gtiSearch);
  }

  const currentGtis = gtiSearch || "";
  const selectedGTIsArray = currentGtis ? currentGtis.split(',').map(g => g.trim()).filter(g => g !== '') : [];

  // Dynamic section detection
  let openPlotTypes = [];
  const isCrossLinkEnabled = $("#cross-link-check").is(":checked");

  if (!isCrossLinkEnabled) {
    openPlotTypes = [triggeringPlotType];
  } else {
    $('.plot-type-section').each(function () {
        const sectionId = $(this).attr('id');
        if (sectionId) {
          const sectionPlotType = sectionId.replace('-section', '');
          const cleanObsForSearch = currentObsID.replace(/,/g, '-');
          // Look for container by ID or by Data-Attributes
          const $search = $(`#${sectionPlotType}-${cleanObsForSearch}, [data-plot-type="${sectionPlotType.replace(/-/g, '_')}"][data-obs-id="${currentObsID}"], #${sectionPlotType.replace(/_/g, '-')}-${cleanObsForSearch}`);
          if ($search.length > 0) openPlotTypes.push(sectionPlotType.replace(/-/g, '_'));
        }
    });
  }

  // Fallback if nothing found
  if (openPlotTypes.length === 0) {
  showGTIPlotSelectionPopup(currentObsID, selectedGTIsArray);
  return;
  }

  // Perform AJAX updates for open plot types
  openPlotTypes.forEach(type => {
  const opId = 'gti-change-' + type + '-' + currentObsID;
  startOperation(opId, `Updating ${type.replace(/_/, ' ')} plot...`);

  // Find the specific form for this plot type to preserve its own binning/GTIs
  const cleanObsForTarget = currentObsID.replace(/,/g, '-');
  const cleanTypeForTarget = type.replace(/_/g, '-');
  const altTypeForTarget = type.replace(/-/g, '_');

  const $targetContainer = $(`
      [data-plot-type="${type}"][data-obs-id="${currentObsID}"], 
      [data-plot-type="${altTypeForTarget}"][data-obs-id="${currentObsID}"],
      #${cleanTypeForTarget}-${cleanObsForTarget},
      #${altTypeForTarget}-${cleanObsForTarget},
      #combined-${cleanTypeForTarget}-${cleanObsForTarget}
  `).first();

  // Use target form if it's not the one we just changed, to keep its own binning/GTIs
  const $targetForm = $targetContainer.find('form.fetch-gti');
  let formData = ($targetForm.length > 0 && type !== triggeringPlotType) 
      ? $targetForm.serialize() 
      : $form.serialize();

  // Force request to ask for correct plot type per loop iteration
  const cleanTypeForReq = type.replace(/-/g, '_');
  if (formData.includes('plot_type=')) {
      formData = formData.replace(/plot_type=[^&]*/, "plot_type=" + cleanTypeForReq);
  } else {
      formData += `&plot_type=${cleanTypeForReq}`;
  }

  // Ensure search_type is included
  if (!formData.includes('search_type')) {
      formData += `&search_type=${encodeURIComponent($('#search-type').val())}`;
  }

  // Force fallback to trigger if search is empty or missing
  if (!formData.includes("gti-search") || formData.includes("gti-search=&")) {
      // If it's empty in the form, use our recovered gtiSearch
      if (formData.includes("gti-search=&")) {
          formData = formData.replace("gti-search=", "gti-search=" + encodeURIComponent(currentGtis));
      } else {
          formData += "&gti-search=" + encodeURIComponent(currentGtis);
      }
  }

  const token = $("input[name='csrfmiddlewaretoken']").val();
  const quality = $('#quality-select').val().toLowerCase();

  // Combined Slider Context
  if (triggeringPlotType.startsWith('combined_')) {
      const sectionId = `#${triggeringPlotType.replace(/_/g, '-')}-section`;
      const sectionObsIDs = new Set();
      $(sectionId).children('div').each(function() {
          const idPart = this.id.replace(`${triggeringPlotType.replace(/_/g, '-')}-`, '');
          if (idPart) {
              idPart.split('-').forEach(oid => { if (oid && oid.match(/^\d+$/)) sectionObsIDs.add(oid); });
          }
      });
      if (sectionObsIDs.size > 0) {
          const allObsIdsStr = Array.from(sectionObsIDs).join(',');
          formData = formData.replace(/obs_id=[^&]*/, `obs_id=${encodeURIComponent(allObsIdsStr)}`);
      }
  }

  if (!formData.includes('csrfmiddlewaretoken')) formData += `&csrfmiddlewaretoken=${token}`;
  if (!formData.includes('quality')) formData += `&quality=${quality}`;

  $.ajax({
    type: 'POST', url: PLOT_GTI_URL, data: formData,
    success: function (data) {
      if (data.screeningSummary) showScreeningToast(currentObsID, data.screeningSummary);

      // Robust lookup for container by attribute or ID
      const cleanObsForTarget = currentObsID.replace(/,/g, '-');
      const cleanTypeForTarget = type.replace(/_/g, '-');
      const altTypeForTarget = type.replace(/-/g, '_');

      const $container = $(`
          [data-plot-type="${type}"][data-obs-id="${currentObsID}"], 
          [data-plot-type="${altTypeForTarget}"][data-obs-id="${currentObsID}"],
          #${cleanTypeForTarget}-${cleanObsForTarget},
          #${altTypeForTarget}-${cleanObsForTarget},
          #combined-${cleanTypeForTarget}-${cleanObsForTarget}
      `).first();

      if ($container.length > 0 && data.plotDivs?.length > 0) {
        // Freeze the height temporarily to prevent the scroll jump
        const currentHeight = $container.height();
        if (currentHeight > 0) {
            $container.css('min-height', currentHeight + 'px');
        }

        const $plotlyPlot = $container.find('.js-plotly-plot');
        if ($plotlyPlot.length > 0) {
          // Surgical replace of JUST the plot
          $plotlyPlot.replaceWith(data.plotDivs[0]);
        } else {
          const $formToSave = $container.find("form").detach();
          $container.html(data.plotDivs[0]).append($formToSave);
        }

        // Release the height freeze after Plotly renders
        setTimeout(() => { $container.css('min-height', ''); }, 500);

        // Echo synchronization
        if (data.gtiQuery) {
          $container.find('input[name="gti-search"]').val(data.gtiQuery);
        }
      }
        completeOperation(opId, 'Plot updated');
        if (typeof MathJax !== 'undefined') MathJax.typeset();
        
        setTimeout(() => { 
          initGTICrossLinking();
          initSynchronizedSelection(); 
          updateAllSelections(); 
          initInteractiveLinking(); // RE-BIND double-click functionality!
        }, 500);
      },
      error: function() { errorOperation(opId, 'Error updating plot'); }
    });
  });
}

/**
 * Theater-specific LC fetcher
 * Returns raw Plotly JSON for movie frames
 */
export function fetchTheaterLC(obsID) {
    const token = $("input[name='csrfmiddlewaretoken']").val();
    const quality = $('#quality-select').val().toLowerCase();
    
    return $.ajax({
        type: 'POST',
        url: PLOT_GTI_URL,
        data: {
            obs_id: obsID,
            plot_type: 'light_curve',
            csrfmiddlewaretoken: token,
            quality: quality,
            format: 'json' // Request JSON specifically
        }
    });
}

/**
 * Combines and plots all GTIs from all observations for a given plot type
 * @param {Event} event Event generated by form submit
 */
export function combineAndPlotGTIs(event) {
  event.preventDefault();
  const TYPE = $(event.target).children('input[name="plot_type"]').val();
  let obsIDs = new Set();
  $(`#${TYPE}-section`).children('div').each(function () {
    obsIDs.add(this.id.replace(`${TYPE}-`, ''));
  });

  let serializedData = $(event.target).serialize();
  serializedData += `&csrfmiddlewaretoken=${$("input[name='csrfmiddlewaretoken']").val()}&quality=${$('#quality-select').val().toLowerCase()}&combined_obs_ids=${Array.from(obsIDs).join(',')}`;

  const operationId = 'combine-gtis-' + Date.now();
  startOperation(operationId, 'Combining GTIs...');

  $.ajax({
    type: 'POST', url: PLOT_GTI_URL, data: serializedData,
    success: function (data) {
      if (data.error) { errorOperation(operationId, data.error); return; }
      const PLOT_ID = TYPE + '-combined';
      let $combinedContainer = $('#' + PLOT_ID + '-container');

      if (!$combinedContainer.length) {
        $combinedContainer = $('<div>', { id: PLOT_ID + '-container', class: 'combined-plot-container' });
        $combinedContainer.append($('<h4>', { text: 'Combined GTIs Plot' }));
        $('<button>', { class: 'remove-btn', text: 'Remove' }).click(() => $combinedContainer.remove()).appendTo($combinedContainer);
        $('#' + TYPE + '-section').append($combinedContainer);
      }

      if (data.plotDivs?.length > 0) {
        $combinedContainer.find('.js-plotly-plot').remove();
        $combinedContainer.append(data.plotDivs[0]);
        completeOperation(operationId, 'GTIs combined');
        // Re-bind double click functionality for newly injected combined plot
        setTimeout(() => { initInteractiveLinking(); }, 100);
      }
    },
    error: function () { errorOperation(operationId, 'Error combining GTIs'); },
  });
}