/* plot.js v200 - Clean Slate */
console.log("plot.js (v200 - Clean Slate) loaded.");

import { displayInfo } from './components/observationInfo.js?v=15'; 
import { fetchGraphPlots } from './components/graph.js';
import { downloadData } from './components/download.js';
import { fetchOptions } from './components/dropdowns.js';
import { StatusBar } from './components/statusBar.js';

let allObservationsData = [];


function sanitizeId(obsId) {
    if (!obsId) return '';
    return String(obsId).replace(/[^a-zA-Z0-9-_]/g, '_');
}

function injectDynamicStyles() {
    if (document.getElementById('plot-js-styles')) return;
    const style = document.createElement('style');
    style.id = 'plot-js-styles';
    style.innerHTML = `
            #selected-obsids-list li.multi-selected { background-color: #e8f5e9; border: 2px solid #4caf50; font-weight: bold; }
            #selected-obsids-list li.active-item { border-left: 5px solid #d9534f; background-color: #fff5f5; }
            .gti-circle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 45px;
                height: 45px;
                border-radius: 50%;
                background-color: #e0e0e0;
                color: #333;
                font-size: 0.85rem;
                font-weight: 500;
                cursor: pointer;
                margin: 5px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                transition: all 0.2s ease;
                flex-shrink: 0; /* Prevent shrinking in flex container */
            }
            .gti-circle:hover {
                background-color: #d0d0d0;
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
            }
            .gti-circle.selected {
                background-color: #4CAF50;
                color: white;
                box-shadow: 0 4px 8px rgba(76, 175, 80, 0.3);
                border: 2px solid #388E3C;
            }
            .gti-circle.selected:hover {
                background-color: #45a049;
            }
            .gti-circle.removed {
                background-color: #f44336;
                color: white;
                box-shadow: 0 4px 8px rgba(244, 67, 54, 0.3);
                border: 2px solid #D32F2F;
            }
            .gti-circle.removed:hover {
                background-color: #da190b;
            }
    `;
    document.head.appendChild(style);
}


setInterval(() => {
    const globalPlotContainer = document.getElementById('combined-hid-plot');
    if (globalPlotContainer) {
        const graphDiv = globalPlotContainer.querySelector('.plotly-graph-div');
        if (graphDiv && graphDiv._fullLayout) {
            if (graphDiv._fullLayout.dragmode === 'select' || graphDiv._fullLayout.dragmode === 'lasso') {
                console.log("💓 Heartbeat: Unlocking Global HID...");
                Plotly.relayout(graphDiv, { 'dragmode': 'zoom', 'clickmode': 'event' });
                Plotly.restyle(graphDiv, {selectedpoints: [null]});
            }
        }
    }
}, 1000); 



function fetchObsIDDataForGTI(obsid) {
    const formData = new FormData();
    formData.append('obs_id', obsid);
    formData.append('quality', $('#quality-select').val().toLowerCase());
    formData.append('search_type', 'obs_id'); 
    formData.append('get_detailed_info', 'true'); 
    
    const csrfTokenInput = document.querySelector('[name=csrfmiddlewaretoken]');
    if (!csrfTokenInput) return;
    
    fetch(PLOT_GRAPH_URL, {
        method: 'POST',
        body: formData,
        headers: {'X-CSRFToken': csrfTokenInput.value}
    }).then(res => res.json()).then(data => {
        if (data.info) displayInfo(data.info); 
    }).catch(err => {
        console.error("Background fetch failed", err);
    });
}

function createListItem(obsId) {
    let li = document.createElement("li");
    li.id = `selected-${sanitizeId(obsId)}`;
    li.setAttribute("data-obsid", obsId);
    li.textContent = obsId;
    li.title = "Single Click: View | Double Click: Compare";
    li.style.cursor = "pointer";
    let removeBtn = document.createElement("span");
    removeBtn.className = "remove-btn";
    removeBtn.innerHTML = "&times;";
    li.appendChild(removeBtn);
    return li;
}

function createGTICircle(obsId, gtiNum, isSelected = false) {
    const circle = document.createElement('span');
    circle.classList.add('gti-circle');
    if (isSelected) {
        circle.classList.add('selected');
    }
    circle.textContent = `GTI${gtiNum}`;
    circle.dataset.obsid = obsId;
    circle.dataset.gti = gtiNum;
    circle.title = `GTI ${gtiNum} for ObsID ${obsId}`;
    return circle;
}


function loadGTIsForObsID(obsId) {
    const availableGtisBox = document.getElementById('available-gtis-box');
    availableGtisBox.innerHTML = '<span style="color: var(--text-secondary);">Loading GTIs...</span>';

    const quality = $('#quality-select').val(); 
    if (gtiMap[obsId]) {
        populateGtiBoxes(obsId, gtiMap[obsId]);
        return;
    }

    const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
    
    fetch(FETCH_GTIS_URL + `?obs_id=${obsId}&quality=${quality}`, {
        method: 'GET',
        headers: {'X-CSRFToken': csrfToken}
    })
    .then(response => response.json())
    .then(data => {
        if (data.gtis) {
            gtiMap[obsId] = data.gtis; // Cache the GTIs
            populateGtiBoxes(obsId, data.gtis);
        } else if (data.error) {
            availableGtisBox.innerHTML = `<span style="color:red;">Error: ${data.error}</span>`;
        }
    })
    .catch(error => {
        console.error('Error fetching GTIs:', error);
        availableGtisBox.innerHTML = `<span style="color:red;">Failed to load GTIs.</span>`;
    });
}

function populateGtiBoxes(obsId, gtiList) {
    const availableGtisBox = document.getElementById('available-gtis-box');
    availableGtisBox.innerHTML = ''; // Clear loading message

    if (gtiList.length === 0) {
        availableGtisBox.innerHTML = '<span style="color: var(--text-secondary);">No GTIs found for this ObsID.</span>';
        return;
    }

    // Filter out GTIs that are already selected and belong to the current ObsID
    const currentSelectedGtisForObs = selectedGtis.filter(item => item.obsId === obsId).map(item => item.gti);
    const gtiListForAvailableBox = gtiList.filter(gtiNum => !currentSelectedGtisForObs.includes(gtiNum));

    gtiListForAvailableBox.forEach(gtiNum => {
        const gtiCircle = createGTICircle(obsId, gtiNum, false); // Always false for available box
        availableGtisBox.appendChild(gtiCircle);
    });
    
    updateSelectedGtisDisplay(); // Ensure selected box is also up to date
    addGtiCircleEventListeners();
}

function addGtiCircleEventListeners() {
    // Remove existing listeners to prevent duplicates
    document.querySelectorAll('.gti-circle').forEach(circle => {
        circle.removeEventListener('click', handleGtiCircleClick);
    });
    // Add new listeners
    document.querySelectorAll('.gti-circle').forEach(circle => {
        circle.addEventListener('click', handleGtiCircleClick);
    });
}

function handleGtiCircleClick(event) {
    const circle = event.target;
    const obsId = circle.dataset.obsid;
    const gti = parseInt(circle.dataset.gti);

    // Check if the GTI is currently in the selectedGtis array
    const indexInSelected = selectedGtis.findIndex(item => item.obsId === obsId && item.gti === gti);

    if (indexInSelected !== -1) {
        // It's currently selected, so deselect it (move to available)
        selectedGtis.splice(indexInSelected, 1); // Remove from array
        circle.classList.remove('selected');
        document.getElementById('available-gtis-box').appendChild(circle);
    } else {
        // It's not selected, so select it (move to selected)
        selectedGtis.push({ obsId: obsId, gti: gti }); // Add to array
        circle.classList.add('selected');
        document.getElementById('selected-gtis-box').appendChild(circle);
    }
    updateSelectedGtisDisplay();
}

function updateSelectedGtisDisplay() {
    const selectedGtisBox = document.getElementById('selected-gtis-box');
    selectedGtisBox.innerHTML = ''; // Clear existing circles

    if (selectedGtis.length === 0) {
        selectedGtisBox.innerHTML = '<span style="color: var(--text-secondary);">Selected GTIs will appear here.</span>';
        return;
    }

    // Sort selected GTIs for consistent display, e.g., by obsId then gti number
    const sortedSelectedGtis = [...selectedGtis].sort((a, b) => {
        if (a.obsId < b.obsId) return -1;
        if (a.obsId > b.obsId) return 1;
        return a.gti - b.gti;
    });

    sortedSelectedGtis.forEach(item => {
        const circle = createGTICircle(item.obsId, item.gti, true); // Always selected
        selectedGtisBox.appendChild(circle);
    });
    addGtiCircleEventListeners(); // Re-add listeners for newly created elements
}

function toggleMultiSelect(obsId) {
    let li = document.getElementById(`selected-${sanitizeId(obsId)}`);
    if (!li) {
        li = createListItem(obsId);
        document.getElementById('selected-obsids-list').appendChild(li);
    }
    li.classList.toggle('multi-selected');
    if(li.classList.contains('multi-selected')) {
        StatusBar.getInstance().show(`Added ${obsId} to Compare Group`, 1500);
    } else {
        StatusBar.getInstance().show(`Removed ${obsId} from Compare Group`, 1500);
    }
}

function setActiveObsID(obsId) {
    const currentObsDisplay = document.getElementById("current-obsid-display");
    if (currentObsDisplay) currentObsDisplay.innerHTML = `Current ObsID: <span class="obsid-value-red">${obsId}</span>`;

    const plotTitle = document.getElementById("plot-selection-title");
    if (plotTitle) plotTitle.textContent = `Select Plot Types for Observation ID: ${obsId}`;

    document.querySelectorAll('#selected-obsids-list li').forEach(li => {
        li.classList.remove('active-item');
    });
    
    const activeLi = document.getElementById(`selected-${sanitizeId(obsId)}`);
    if(activeLi) activeLi.classList.add('active-item');

    const obsData = allObservationsData.find(o => o.obsid === obsId);
    if (obsData) {
        const infoBoxUl = document.querySelector("#general-info-box ul");
        if(infoBoxUl) {
             infoBoxUl.innerHTML = `<li><strong>source:</strong> <span>${obsData.source || "..."}</span></li><li><strong>OBSID:</strong> <span>${obsData.obsid || "..."}</span></li><li><strong>Total no. of GTI's:</strong> <span>${obsData.gti_count !== undefined ? obsData.gti_count : "..."}</span></li><li><strong>RA(°):</strong> <span>${obsData.ra || "..."}</span></li><li><strong>DEC(°):</strong> <span>${obsData.dec || "..."}</span></li>`;
        }
        $('#show-gti-btn').prop('disabled', true).text("Loading Data...");
        fetchObsIDDataForGTI(obsId);
        loadGTIsForObsID(obsId); // <<< NEW: Load GTIs
    } else {
        fetchObsIDDataForGTI(obsId);
        loadGTIsForObsID(obsId); // <<< NEW: Load GTIs
    }
}

function handleGlobalPointClick(obsId) {
    console.log("Global point clicked:", obsId);
    const globalCheck = document.getElementById('plot-global-hid');
    if(globalCheck) globalCheck.checked = false;

    if (!document.getElementById(`selected-${sanitizeId(obsId)}`)) {
        let li = createListItem(obsId);
        document.getElementById('selected-obsids-list').appendChild(li);
    }
    setActiveObsID(obsId);
    StatusBar.getInstance().show(`Selected ObsID ${obsId}.`, 2000);
}

function populateResultsLayout(data, searchType) {
  allObservationsData = data.observations || [];
  const allList = document.getElementById("all-obsids-list");
  const selectedList = document.getElementById("selected-obsids-list");
  const title = document.getElementById("all-obsids-title");
  const globalToolsSection = document.getElementById("global-tools-section");

  allList.innerHTML = "";
  selectedList.innerHTML = "";
  
  const infoBoxUl = document.querySelector("#general-info-box ul");
  if(infoBoxUl) infoBoxUl.innerHTML = "";

  const globalCheck = document.getElementById('plot-global-hid');
  if(globalCheck) globalCheck.checked = false;

  if (searchType === 'source') {
    if(globalToolsSection) globalToolsSection.classList.remove('hide'); // SHOW BUTTON
    if(title) title.textContent = `All ObsIDs for ${data.source_name || "Unknown Source"}`;
    
    if (allObservationsData.length === 0) {
        allList.innerHTML = "<li>No observations found.</li>";
    } else {
        allObservationsData.forEach((obs) => {
            let li = document.createElement("li");
            li.textContent = obs.obsid;
            li.setAttribute("data-obsid", obs.obsid);
            allList.appendChild(li);
        });
    }
  } else {

    if(globalToolsSection) globalToolsSection.classList.add('hide'); // HIDE BUTTON
    
    if (allObservationsData.length === 0) {
        if(title) title.textContent = "ObsID not found";
        allList.innerHTML = "<li>N/A</li>";
    } else {
        const obsData = allObservationsData[0];
        const obsid = obsData.obsid;
        if(title) title.textContent = `ObsID: ${obsid}`;
        
        let li = createListItem(obsid);
        selectedList.appendChild(li);
        setActiveObsID(obsid);
    }
  }
}


document.addEventListener("DOMContentLoaded", () => {
  StatusBar.getInstance();
  injectDynamicStyles(); 
  
  // GLOBAL HID CHECKBOX
  const globalHidCheckbox = document.getElementById('plot-global-hid');
  if (globalHidCheckbox) {
    globalHidCheckbox.addEventListener('change', function() {
        if (this.checked) {
            const allList = document.getElementById('all-obsids-list');
            const selectedList = document.getElementById('selected-obsids-list');
            const allItems = allList.querySelectorAll('li');

            if (allItems.length === 0 || (allItems.length === 1 && allItems[0].textContent.includes("No observations"))) {
                alert("No observations found. Please search for a Source first.");
                this.checked = false; 
                return;
            }
            selectedList.innerHTML = ""; 
            let count = 0;
            allItems.forEach(item => {
                const obsId = item.getAttribute('data-obsid');
                if (obsId) {
                    let li = createListItem(obsId);
                    selectedList.appendChild(li);
                    count++;
                }
            });
            StatusBar.getInstance().show(`Selected ${count} observations for Global HID.`, 3000);
        }
    });
  }

  const searchForm = document.getElementById("plot-graph");
  const searchTypeSelect = document.getElementById("search-type");

  $(document).on('submit', '#plots form', function(event) {
      event.preventDefault();
      fetchGTIPlot(event);
  });
  
  if (searchTypeSelect) {
    searchTypeSelect.addEventListener("change", () => {
      if (searchTypeSelect.value === "obs_id") {
        document.getElementById("obs-id-dropdown").style.display = "block";
        document.getElementById("source-name-dropdown").style.display = "none";
        $('#global-hid-section').remove();
        $('#global-safe-container').remove(); 
        const globalTools = document.getElementById("global-tools-section");
        if(globalTools) globalTools.classList.add('hide'); 
        const globalCheck = document.getElementById('plot-global-hid');
        if(globalCheck) globalCheck.checked = false;
      } else {
        document.getElementById("obs-id-dropdown").style.display = "none";
        document.getElementById("source-name-dropdown").style.display = "block";
      }
    });
  }

  if (searchForm) {
    searchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      StatusBar.getInstance().show("Searching...", -1);
      const formData = new FormData(searchForm);
      const searchType = formData.get("search_type");
      let url = (searchType === "obs_id") ? PLOT_GRAPH_URL : SOURCE_SEARCH_URL;

      try {
        const response = await fetch(url, { method: "POST", body: formData });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        if (data.error) {
            StatusBar.getInstance().show(data.error, 5000, true);
            return;
        }
        populateResultsLayout(data, searchType);
        document.getElementById("observation-details").style.display = "block";
        StatusBar.getInstance().show(`Found ${data.observations.length} obs.`, 3000);
      } catch (error) {
        console.error("Error during search:", error);
        StatusBar.getInstance().show(error.message || "An error occurred.", 5000, true);
      }
    });
  }

  const obsidFilter = document.getElementById("obsid-search-input");
  if (obsidFilter) {
    obsidFilter.addEventListener("keyup", () => {
      const filter = obsidFilter.value.toUpperCase();
      const listItems = document.getElementById("all-obsids-list").getElementsByTagName("li");
      for (let item of listItems) {
        item.style.display = item.textContent.toUpperCase().indexOf(filter) > -1 ? "" : "none";
      }
    });
  }

  const allObsidsList = document.getElementById("all-obsids-list");
  if (allObsidsList) {
    allObsidsList.addEventListener("click", (e) => {
      if (e.target.tagName === "LI") {
          const obsid = e.target.getAttribute("data-obsid");
          const selectedList = document.getElementById("selected-obsids-list");
          if (!document.getElementById(`selected-${sanitizeId(obsid)}`)) {
              let li = createListItem(obsid);
              selectedList.appendChild(li);
          }
          setActiveObsID(obsid);
      }
    });
  }

  const selectedObsidsList = document.getElementById("selected-obsids-list");
  if (selectedObsidsList) {
    selectedObsidsList.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-btn")) {
        e.target.parentElement.remove();
        if (selectedObsidsList.children.length === 0) {
             const currentObsDisplay = document.getElementById("current-obsid-display");
             if(currentObsDisplay) currentObsDisplay.innerHTML = `Current ObsID: <span class="obsid-value-red">---</span>`;
             const infoBoxUl = document.querySelector("#general-info-box ul");
             if(infoBoxUl) infoBoxUl.innerHTML = "";
        }
        return;
      }
      const li = e.target.closest('li');
      if (li) setActiveObsID(li.getAttribute("data-obsid"));
    });

    selectedObsidsList.addEventListener("dblclick", (e) => {
        const li = e.target.closest('li');
        if (li) {
            e.preventDefault(); 
            toggleMultiSelect(li.getAttribute("data-obsid"));
        }
    });
  }

  const plotForm = document.getElementById("plot-selection-form");
  if(plotForm) {
    plotForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        
        const selectedList = document.getElementById("selected-obsids-list");
        const obsidsToPlot = [];
        const isGlobalHID = document.getElementById('plot-global-hid').checked;

        if (isGlobalHID) {
        
            selectedList.querySelectorAll('li').forEach(li => obsidsToPlot.push(li.getAttribute('data-obsid')));
            
            if (obsidsToPlot.length === 0) {
                StatusBar.getInstance().show("Please add items to list for Global HID.", 4000, true);
                return;
            }

            StatusBar.getInstance().show(`Processing Global HID...`, -1);
            const formData = new FormData();
            formData.append('obs_ids', obsidsToPlot.join(',')); 
            formData.append('quality', document.getElementById('quality-select').value);
            formData.append('csrfmiddlewaretoken', document.querySelector('[name=csrfmiddlewaretoken]').value);

            fetch(PLOT_COMBINED_URL, { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.plotDiv) {
                    const safeContainerId = 'global-safe-container';
                    if ($(`#${safeContainerId}`).length === 0) {
                        $('#plots').before(`<div id="${safeContainerId}" style="margin-bottom: 2rem; border-bottom: 1px solid #ddd;"></div>`);
                    }
                    $(`#${safeContainerId}`).html(`<div class="plot-type-section"><h3>GLOBAL HID</h3><div id="combined-hid-plot">${data.plotDiv}</div></div>`);
                    $('#plots').empty();
                    
                    document.getElementById('plot-global-hid').checked = false;

                    if (window.MathJax) MathJax.typeset();
                    StatusBar.getInstance().show("Global HID generated.", 3000);
                    
                    const graphDiv = document.getElementById('combined-hid-plot').querySelector('.plotly-graph-div');
                    let lastClickTime = 0;

                    if (graphDiv) {
                        graphDiv.removeAllListeners('plotly_click');
                        graphDiv.on('plotly_click', function(evData) {
                            const currentTime = new Date().getTime();
                            const timeDiff = currentTime - lastClickTime;
                            lastClickTime = currentTime;

                            const point = evData.points[0];
                            let obsId = point.text.replace(/<[^>]*>/g, '').trim(); 

                            if (timeDiff < 500) {
                                console.log("Double Click on Point:", obsId);
                                toggleMultiSelect(obsId); 
                            } else {
                                console.log("Single Click on Point:", obsId);
                                handleGlobalPointClick(obsId); 
                            }
                        });
                        
                        Plotly.relayout(graphDiv, { dragmode: 'zoom' });
                    }
                }
            })
            .catch(e => { console.error(e); StatusBar.getInstance().show("Error generating plot.", 5000, true); });

        } else {
        
            const multiSelectedItems = selectedList.querySelectorAll('li.multi-selected');
            
            if (multiSelectedItems.length > 0) {
                // Scenario A: User explicitly selected (Green) items
                multiSelectedItems.forEach(li => obsidsToPlot.push(li.getAttribute('data-obsid')));
                StatusBar.getInstance().show(`Comparing ${obsidsToPlot.length} highlighted observations...`, -1);
            } else {
                // If nothing is green, but items exist in list -> Use ALL of them
                const allListItems = selectedList.querySelectorAll('li');
                
                if (allListItems.length > 0) {
                     allListItems.forEach(li => obsidsToPlot.push(li.getAttribute('data-obsid')));
                     StatusBar.getInstance().show(`Comparing all ${obsidsToPlot.length} listed observations...`, -1);
                } else {
                    // Scenario C: Fallback to single active (Standard Search)
                    const currentObsElement = document.querySelector("#current-obsid-display .obsid-value-red");
                    let activeObsId = currentObsElement ? currentObsElement.textContent.trim() : null;
                    if (activeObsId && activeObsId !== "---" && activeObsId !== "...") {
                        obsidsToPlot.push(activeObsId);
                        StatusBar.getInstance().show(`Plotting ${activeObsId}...`, -1);
                    } else {
                        StatusBar.getInstance().show("Select an ObsID to plot (Double-click to compare).", 4000, true);
                        return;
                    }
                }
            }

            $('#plots').empty(); 
            const $tempForm = $('<form>');
            
            const combinedString = obsidsToPlot.join(',');
            $tempForm.append($('<input>').attr('name', 'obs_id').val(combinedString));
            $tempForm.append($('<input>').attr('name', 'quality').val($('#quality-select').val()));
            $tempForm.append($('<input>').attr('name', 'csrfmiddlewaretoken').val($('[name=csrfmiddlewaretoken]').val()));

            // NEW: Append selected GTIs to form data
            if (selectedGtis.length > 0) {
                const gtiQueryString = selectedGtis.map(item => `${item.obsId}-${item.gti}`).join(',');
                $tempForm.append($('<input>').attr('name', 'gti-search').val(gtiQueryString));
            }
            
            plotForm.querySelectorAll('input[name="plot_types"]:checked').forEach(input => {
                if(input.value !== 'global-hid') {
                    $tempForm.append($('<input>').attr('name', input.value).val('on'));
                    $tempForm.append($('<input>').attr('name', 'plot_types').val(input.value));
                }
            });

            fetchGraphPlots(false, { preventDefault: () => {}, target: $tempForm[0] });
        }
    });
  }

  $('#additional-observation-search').keyup(function () { fetchOptions(`obs_id=${this.value}`, $('#additional-observation-options')); });
  $('#source-search').keyup(function () { fetchOptions(`source=${this.value}`, $('#source-options')); });
  $('#add-obs-btn').click(function () { $('#add-obs-dropdown').toggle(); });
  $('#advance-search-btn').click(function () { $('#advanced-search').toggle(); });
  $('.change-quality').click(function () { $('#quality-select').val(this.textContent); });
  $(document).on('click', '.popup-close', function () { $('#gti-modal').hide(); });
  $(document).on('click', '.download-data', function () {
    const dataType = $(this).data('type');
    let obsId = $(this).data('obs-id');
    if (!obsId) {
        const currentObsIdText = document.getElementById('current-obsid-display').textContent;
        if (currentObsIdText && !currentObsIdText.includes("---")) obsId = currentObsIdText.replace('Current ObsID: ', '');
    }
    if (!obsId) { alert("Please select an ObsID first."); return; }
    let gtiNum = $(this).data('gti');
    const quality = $('#quality-select').val();
    if (dataType === 'gti' && gtiNum) downloadData(dataType, obsId, null, [gtiNum], quality);
    else downloadData(dataType, obsId, null, null, quality);
  });

});