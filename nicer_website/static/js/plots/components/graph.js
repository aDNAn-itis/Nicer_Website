import { displayInfo, handleMultipleObservations } from './observationInfo.js';
import { GTISelection } from './gtiComponents.js';
import {
  updateAllSelections,
  initSynchronizedSelection,
} from './syncSelection.js';

/**
 *  CSS styles for the popup to the document head
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
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 4px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 10px;
            transition: background-color 0.2s;
            width: 100%;
        }
        
        .plot-submit-btn:hover {
            background-color: #555555;
        }
        
        .loading-indicator {
            margin: 20px 0;
            padding: 10px;
            background-color: #f5f5f5;
            border-left: 4px solid #666666;
            border-radius: 4px;
            color: #333;
        }
    `;

  const styleElement = document.createElement('style');
  styleElement.id = 'popup-styles';
  styleElement.textContent = styles;
  document.head.appendChild(styleElement);
}

/**
 * Displays a popup for selecting which plot types to generate for an observation ID
 * @param {string} obsID The observation ID to create plots for
 */
export function showPlotSelectionPopup(obsID) {
  // Add CSS styles
  addPopupStyles();

  // Create popup container if it doesn't exist
  let $popup = $('#plot-selection-popup');
  if ($popup.length === 0) {
    $popup = $('<div>', {
      id: 'plot-selection-popup',
      class: 'popup-container',
    });

    const $content = $('<div>', {
      class: 'popup-content',
    });

    const $title = $('<div>', {
      class: 'popup-title',
      text: 'Select Plot Types',
    });

    const $closeBtn = $('<button>', {
      class: 'popup-close',
      text: '×',
    });

    $title.append($closeBtn);
    $content.append($title);
    $popup.append($content);
    $('body').append($popup);

    // Setup close button and backdrop click to close popup
    $popup.on('click', function (e) {
      if (e.target === this) {
        $popup.fadeOut(200);
      }
    });

    $popup.on('click', '.popup-close', function () {
      $popup.fadeOut(200);
    });
  }

  // Update popup content
  const $content = $popup.find('.popup-content');
  $content
    .find('.popup-title')
    .text(`Select Plot Types for Observation ID: ${obsID}`)
    .append(
      $('<button>', {
        class: 'popup-close',
        text: '×',
      }),
    );

  // Remove any existing form
  $content.find('form').remove();

  // Create form for plot type selection
  const $form = $('<form>', {
    id: 'plot-type-form',
    class: 'plot-type-form',
  });

  // Add plot type options
  const plotTypes = [
    { id: 'spectrum', name: 'Spectrum' },
    { id: 'light-curve', name: 'Light Curve' },
    { id: 'power-density-spectrum', name: 'Power Density Spectrum' },
    { id: 'hardness-intensity-diagram', name: 'Hardness Intensity Diagram' },
  ];

  plotTypes.forEach((type) => {
    const $option = $('<div>', {
      class: 'plot-option',
    });

    const $checkbox = $('<input>', {
      type: 'checkbox',
      id: `${type.id}-checkbox`,
      name: type.id,
      value: 'on',
    });

    const $label = $('<label>', {
      for: `${type.id}-checkbox`,
      text: type.name,
    });

    $option.append($checkbox);
    $option.append($label);
    $form.append($option);
  });

  // Add hidden field for observation ID
  $form.append(
    $('<input>', {
      type: 'hidden',
      name: 'obs_id',
      value: obsID,
    }),
  );

  // Add submit button
  const $submitBtn = $('<button>', {
    type: 'submit',
    class: 'plot-submit-btn',
    text: 'Generate Plots',
  });

  $form.append($submitBtn);

  // Handle form submission
  $form.on('submit', function (event) {
    event.preventDefault();
    $popup.fadeOut(200);

    // Call fetchGraphPlots with the form
    fetchGraphPlots(false, event);
  });

  $content.append($form);

  // Show the popup with animation
  $popup.css('display', 'flex').hide().fadeIn(300);
}

/**
 * Fetches and displays the table for the given observation ID or source name
 * If plots are requested, also fetches and displays plots
 *
 * @param {boolean} refresh If the page content should be refreshed
 * @param {Event} event Event generated by form submit
 */
export function fetchGraphPlots(refresh = false, event) {
  const REGEX = /"title":\{"text":"(.+?)"\}/;
  if (!event || !event.target) {
    console.error('Event or event.target is undefined in fetchGraphPlots');
    return;
  }
  let serializedData = $(event.target).serialize();

  // Prevents reloading the page
  event.preventDefault();

  // Adds information and security token to the request
  serializedData += `&csrfmiddlewaretoken=${$(
    "input[name='csrfmiddlewaretoken']",
  ).val()}`;
  serializedData += `&quality=${$('#quality-select').val().toLowerCase()}`;

  // Show loading indicator
  const $loadingIndicator = $('<div>', {
    class: 'loading-indicator',
    text: 'Loading data...',
  });
  $('#obs-info').before($loadingIndicator);

  // Sends an asynchronous request to fetch data
  $.ajax({
    type: 'POST',
    url: PLOT_GRAPH_URL,
    data: serializedData,
    success: function (response) {
      // Clear both obs-info and plots divs if refreshing
      if (refresh) {
        $('#add-obs').show();
        $('#plots').empty();
        $('#obs-info-table').empty();
        $('#remove-obs').empty();
      }

      if (response.error) {
        console.error('Error received:', response.error);
        alert(`${response.error}`);
        return;
      }

      if (response.multiple_observations) {
        handleMultipleObservations(response.obs_ids, response.source);
        return;
      }

      if (!response.info) {
        console.error('Unexpected response format:', response);
        alert('Unexpected response from server.');
        return;
      }

      // Update info section - always show the table
      displayInfo(response.info);

      // Update form values if observation info is provided
      if (response.obs_info) {
        Object.entries(response.obs_info).forEach(([key, value]) => {
          $(`#${key}`).val(value);
        });
      }

      // Process plots only if plot types were requested
      const hasPlotTypes =
        serializedData.includes('spectrum=') ||
        serializedData.includes('light-curve=') ||
        serializedData.includes('power-density-spectrum=') ||
        serializedData.includes('hardness-intensity-diagram=');

      if (hasPlotTypes && response.plotDivs && response.plotDivs.length > 0) {
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

        // Typeset any math expressions
        MathJax.typeset();

        // Update plot selections after plots are added
        // Add a larger delay to ensure Plotly has fully rendered
        setTimeout(() => {
          console.log('Running updateAllSelections from fetchGraphPlots');
          // First reinitialize the synchronized selection for new plots
          initSynchronizedSelection();
          // Then update any existing selections
          updateAllSelections();
        }, 800);
      }

      // Add observation removal functionality
      if (!$(`#remove-${response.obsID}`).length && hasPlotTypes) {
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
      alert('An error occurred while fetching data. Please try again.');
    },
    complete: function () {
      $loadingIndicator.remove();
    },
  });
}

export function removePlots(response, removeButton) {
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

  // If we're removing a plot, update the synchronized selections
  setTimeout(() => {
    console.log('Running updateAllSelections after removing plots');
    updateAllSelections();
  }, 500);
}

export function updateCombineButtonVisibility(plotType) {
  let obsIDs = new Set();

  $(`#${plotType}-section`)
    .children('div')
    .each(function () {
      obsIDs.add(this.id.replace(`${plotType}-`, ''));
    });

  $(`.combine-gtis:has(input[name="plot_type"][value="${plotType}"])`).toggle(
    obsIDs.size >= 2,
  );
}
