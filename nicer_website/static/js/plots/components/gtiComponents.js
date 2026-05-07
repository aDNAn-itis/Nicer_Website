import { columnLayout } from '../utils/utils.js';
import {
  startOperation,
  completeOperation,
  errorOperation,
  updateOperationMessage,
  clearOperationsByPattern,
  completeOperationsByPattern,
} from './statusBar.js?v=201';
import { setGTICrossLinking, clearGTIHighlighting } from './gtiCrossLinking.js?v=201';

/**
 * Generates a GTI selection field for a specific plot
 * v200.6 - Full Structural Merge (Preserving your long-form code)
 */
export function GTISelection(maxGTI, obsID, plotType, defaultBinning = 1, currentGtiQuery = '') {
  // Constants and Logging
  console.log(`[DEBUG gtiComponents.js] GTISelection called. plotType: ${plotType}, obsID: ${obsID}, defaultBinning: ${defaultBinning}`);

  const $FORM = $('<form>', { class: 'fetch-gti' });
  let cleanPlotType = plotType.replace(`-${obsID}`, '');

  // Calculate slider max
  let sliderMax = Math.max(200, defaultBinning * 10);

  // --- YOUR ORIGINAL CONFIGURATION BLOCK ---
  let binningLabel = 'Binning';
  let binningUnit = 'counts';
  let binningDescription = 'Higher = fewer points, faster loading';
  let displayMultiplier = 1;

  if (cleanPlotType === 'light_curve' || cleanPlotType === 'light-curve') {
    binningLabel = 'Time Binning';
    binningUnit = 's';
    binningDescription = 'Combines time bins (1 bin = 0.125s)';
    displayMultiplier = 0.125;
  } 
  else if (cleanPlotType === 'power_density_spectrum' || cleanPlotType === 'power-density-spectrum') {
    binningLabel = 'Significance Threshold';
    binningUnit = 'sigma';
    binningDescription = 'Higher = more aggressive binning';
  } 
  else if (cleanPlotType === 'hardness_intensity_diagram' || cleanPlotType === 'hardness-intensity-diagram' || cleanPlotType === 'time') {
    if (cleanPlotType === 'hardness_intensity_diagram') {
      cleanPlotType = 'hardness-intensity-diagram';
    }
    binningLabel = 'Time Binning';
    binningUnit = 's';
    binningDescription = 'Combines time bins (1 bin = 0.125s)';
    sliderMax = 400; // 50 seconds / 0.125s
    displayMultiplier = 0.125;
  } 
  else if (cleanPlotType === 'spectrum' || cleanPlotType === 'summed_spectrum' || cleanPlotType === 'summed-spectrum') {
    binningLabel = 'Energy Grouping';
    binningUnit = 'counts';
    binningDescription = 'Combines energy bins (higher = fewer points)';
  }

  // --- YOUR ORIGINAL ELEMENT CREATION ---
  const $TYPE = $('<input>', {
    name: 'plot_type',
    type: 'hidden',
    value: cleanPlotType,
  });

  const $OBS_ID = $('<input>', {
    name: 'obs_id',
    type: 'hidden',
    value: obsID,
  });

  const $SEARCH = $('<input>', {
        name: 'gti-search',
        type: 'text',
        value: currentGtiQuery, // 🟢 Set the persistence value
        placeholder: `GTI numbers...`,
        class: 'gti-search-input'
    });

  const $HIDDEN_MIN_VALUE = $('<input>', {
    name: 'min_value',
    type: 'hidden',
    value: defaultBinning,
  });

  const $MIN_SLIDER = $(`<input>`, {
    id: `${cleanPlotType}-min-slider`,
    type: 'range',
    min: 1,
    max: sliderMax,
    value: defaultBinning,
    title: binningDescription,
  });

  let initialDisplayValue = defaultBinning;
  if (displayMultiplier !== 1) {
    initialDisplayValue = parseFloat(
      (defaultBinning * displayMultiplier).toFixed(3),
    );
  }

  const $CONTROLS_CONTAINER = $('<div>', {
    style: 'display: flex; align-items: center; justify-content: center; margin-top: 5px; gap: 5px;',
  });

  const $BINNING_LABEL = $('<label>', {
    for: `${cleanPlotType}-min-input`,
    text: `${binningLabel}:`,
    title: binningDescription,
    style: 'margin-bottom: 0;',
  });

  const $MIN_INPUT = $('<input>', {
    id: `${cleanPlotType}-min-input`,
    type: 'number',
    min: displayMultiplier,
    step: displayMultiplier,
    value: initialDisplayValue,
    title: binningDescription,
    style: 'width: 80px; padding: 2px 5px;',
  });

  const $UNIT_LABEL = $('<span>', {
    text: binningUnit,
  });

  $CONTROLS_CONTAINER.append($BINNING_LABEL);
  $CONTROLS_CONTAINER.append($MIN_INPUT);
  $CONTROLS_CONTAINER.append($UNIT_LABEL);

  const $SUBMIT = $('<button>', { type: 'submit', text: 'Submit' });

  // --- RAHUL'S HID CROSS-LINKING BUTTON ---
  let $crossLinkToggle = null;
  if (cleanPlotType === 'hardness_intensity_diagram' || cleanPlotType === 'hardness-intensity-diagram') {
    $crossLinkToggle = $('<button>', {
      type: 'button',
      class: 'gti-cross-link-toggle',
      text: 'Enable GTI Cross-Linking',
      title: 'Click points in HID to highlight corresponding GTIs in other plots',
    });

    let crossLinkEnabled = false;
    $crossLinkToggle.on('click', function () {
      crossLinkEnabled = !crossLinkEnabled;
      setGTICrossLinking(crossLinkEnabled);
      if (crossLinkEnabled) {
        $(this).addClass('active').text('GTI Cross-Linking Active');
      } else {
        $(this).removeClass('active').text('Enable GTI Cross-Linking');
      }
    });
  }

  // --- FORM ASSEMBLY (Your original sequential style) ---
  $FORM.append($TYPE);
  $FORM.append($OBS_ID);
  $FORM.append($HIDDEN_MIN_VALUE);
  $FORM.append(columnLayout([$SEARCH, $SUBMIT]));
  $FORM.append(columnLayout([$MIN_SLIDER, $CONTROLS_CONTAINER]));

  if ($crossLinkToggle) {
    $FORM.append($crossLinkToggle);
  }

  // --- AUTO-SUBMIT LOGIC (Integrated into your structure) ---
  let sliderTimeout;
  function handleBinningChange() {
    if (sliderTimeout) {
      clearTimeout(sliderTimeout);
    }
    sliderTimeout = setTimeout(() => {
      const binningPattern = 'gti-change-' + cleanPlotType + '-' + obsID;
      completeOperationsByPattern(binningPattern);
      startOperation(
        binningPattern,
        'Updating ' + cleanPlotType.replace(/_/g, ' ') + ' plot...',
      );
      $FORM.trigger('submit');
    }, 300); 
  }

  // Rahul's Sync Logic inserted here
  function syncOtherPlotBinning(val, gtiSearchVal) {
    if (!$("#cross-link-check").is(":checked")) return;
    const currentType = cleanPlotType.replace(/_/g, '-');
    let targetType = null;
    if (currentType === 'hardness-intensity-diagram' || currentType === 'time') {
      targetType = 'light-curve';
    } else if (currentType === 'light-curve') {
      targetType = 'hardness-intensity-diagram';
    }
    if (!targetType) return;

    let $targetContainer = $(`#${targetType}-${obsID}`);
    if ($targetContainer.length === 0 && targetType === 'hardness-intensity-diagram') {
      $targetContainer = $(`#time-${obsID}`);
    }

    if ($targetContainer.length) {
      const $targetForm = $targetContainer.find('form.fetch-gti');
      if ($targetForm.length) {
        // Sync Binning
        if (val !== undefined) {
          const $targetSlider = $targetForm.find('input[type="range"]');
          if ($targetSlider.length) {
            if (val > parseInt($targetSlider.attr('max'))) {
              $targetSlider.attr('max', val);
            }
            $targetSlider.val(val);
            $targetSlider.trigger('input', [{ fromSync: true }]);
          }
        }
        
        // Sync GTI Search
        if (gtiSearchVal !== undefined) {
          const $targetSearch = $targetForm.find('input[name="gti-search"]');
          if ($targetSearch.length && $targetSearch.val() !== gtiSearchVal) {
            $targetSearch.val(gtiSearchVal);
            // We don't trigger 'input' here to avoid infinite loops, 
            // the binning change will trigger the submit anyway.
          }
        }
      }
    }
  }

  // --- YOUR ORIGINAL EVENT LISTENERS (Updated with Rahul's sync) ---
  $MIN_SLIDER.on('input', function (e, data) {
    const isSync = data && data.fromSync;
    const newValue = parseInt($(this).val());
    $HIDDEN_MIN_VALUE.val(newValue);
    
    let displayValue = newValue;
    if (displayMultiplier !== 1) {
      displayValue = parseFloat((newValue * displayMultiplier).toFixed(3));
    }
    $MIN_INPUT.val(displayValue);
    
    handleBinningChange();
    if (!isSync) {
      syncOtherPlotBinning(newValue, $SEARCH.val());
    }
  });

  $MIN_INPUT.on('input', function (e, data) {
    const isSync = data && data.fromSync;
    const val = parseFloat($(this).val());
    if (isNaN(val)) return;

    let intValue = Math.round(val / displayMultiplier);
    if (intValue < 1) intValue = 1;
    
    if (intValue > parseInt($MIN_SLIDER.attr('max'))) {
      $MIN_SLIDER.attr('max', intValue);
    }
    
    $MIN_SLIDER.val(intValue);
    $HIDDEN_MIN_VALUE.val(intValue);
    
    handleBinningChange();
    if (!isSync) {
      syncOtherPlotBinning(intValue, $SEARCH.val());
    }
  });

  let gtiTimeout;
  $SEARCH.on('input', function (e, data) {
    const isSync = data && data.fromSync;
    const newGTIs = $(this).val();
    
    if (gtiTimeout) {
      clearTimeout(gtiTimeout);
    }
    
    gtiTimeout = setTimeout(() => {
      const gtiPattern = 'gti-change-' + cleanPlotType + '-' + obsID;
      completeOperationsByPattern(gtiPattern);
      startOperation(
        gtiPattern,
        'Updating ' + cleanPlotType.replace(/_/g, ' ') + ' plot...',
      );
      $FORM.trigger('submit');
    }, 500);

    if (!isSync) {
      syncOtherPlotBinning(undefined, newGTIs);
    }
  });

  return $FORM;
}