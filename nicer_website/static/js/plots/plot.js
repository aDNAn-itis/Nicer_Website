/* plot.js v200 - Clean Slate */
console.log("plot.js (v200 - Clean Slate) loaded.");

import { fetchGTIPlot } from './components/gtiPlots.js?v=201';
import { displayInfo } from './components/observationInfo.js?v=201';
import { fetchGraphPlots } from './components/graph.js?v=201';
import { downloadData } from './components/download.js?v=201';
import { fetchOptions } from './components/dropdowns.js?v=201';
import { StatusBar } from './components/statusBar.js?v=201';
import { updateTheaterFrame } from './components/lcTheater.js?v=201';

window.fetchGTIPlot = fetchGTIPlot; // 🟢 FIX: Global bridge for ESM modules and dynamic form listeners

let gtiMap = {}; // Cache for GTIs: { obsId: [gti1, gti2, ...], ... }
let selectedGtis = []; // [{ obsId: "...", gti: N }]
window.selectedGtis = selectedGtis; // 🟢 Make globally accessible to break import loop
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
            #gti-list li { padding: 0.5rem 1rem; cursor: pointer; user-select: none; }
            #gti-list li:hover { background: var(--bg-secondary, #f8fafc); }
            #gti-list li.selected { background-color: #e8f5e9; font-weight: bold; }
            #gti-list li.disabled-message { color: var(--text-secondary); cursor: default; background: transparent; }
            /* --- Selected GTI Cards --- */
            .selected-gtis-pills {
                display: flex;
                flex-wrap: wrap;
                justify-content: center;
                gap: 0.75rem;
            }
            .selected-gti-item {
                display: inline-flex;
                align-items: center;
                border: 1px solid #d1d5db;
                border-radius: 4px;
                font-size: 0.9rem;
                font-family: inherit;
                cursor: default;
                user-select: none;
                background: #fff;
            }
            .selected-gti-item:hover {
                border-color: #9ca3af;
            }
            .gti-card-text {
                padding: 0.4rem 0.75rem;
                color: var(--text-primary, #333);
            }
            .gti-card-remove {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0.4rem 0.6rem;
                border-left: 1px solid #d1d5db;
                color: #ef4444;
                font-size: 0.85rem;
                font-weight: bold;
                cursor: pointer;
                transition: background 0.15s ease;
            }
            .gti-card-remove:hover {
                background: #fef2f2;
            }
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
    const styleElement = document.createElement('style');
    styleElement.id = 'plot-js-styles';
    styleElement.textContent = style.innerHTML;
    document.head.appendChild(styleElement);
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

function loadGTIsForObsID(obsId) {
    const gtiList = document.getElementById('gti-list');
    const quality = $('#quality-select').val(); 
    
    if (!gtiMap[obsId]) {
        gtiList.innerHTML = `<li class="disabled-message">Loading GTIs for ${obsId}...</li>`;
    }

    if (gtiMap[obsId]) {
        populateGtiSelector(obsId);
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
            gtiMap[obsId] = data.gtis;
            populateGtiSelector(obsId);
        } else if (data.error) {
            console.error(`Error fetching GTIs for ${obsId}: ${data.error}`);
            gtiList.innerHTML = `<li class="disabled-message">Error loading GTIs.</li>`;
        }
    })
    .catch(error => {
        console.error('Error fetching GTIs:', error);
        gtiList.innerHTML = `<li class="disabled-message">Error loading GTIs.</li>`;
    });
}

function populateGtiSelector(activeObsId) {
    const gtiList = document.getElementById('gti-list');
    gtiList.innerHTML = '';

    if (!activeObsId) {
        gtiList.innerHTML = '<li class="disabled-message">Select an ObsID to see available GTIs</li>';
        return;
    }

    const gtis = gtiMap[activeObsId];
    if (gtis && gtis.length > 0) {
        gtis.forEach(gtiNum => {
            const li = document.createElement('li');
            li.dataset.obsid = activeObsId;
            li.dataset.gti = gtiNum;
            li.textContent = `GTI ${gtiNum}`;

            if (selectedGtis.some(item => item.obsId === activeObsId && item.gti === gtiNum)) {
                li.classList.add('selected');
            }
            gtiList.appendChild(li);
        });
    } else {
        gtiList.innerHTML = '<li class="disabled-message">No GTIs available for this ObsID</li>';
    }
}

function handleGtiSelectionChange() {
    console.log('handleGtiSelectionChange called. current selectedGtis:', JSON.parse(JSON.stringify(selectedGtis)));
    const gtiList = document.getElementById('gti-list');
    const listItems = gtiList.querySelectorAll('li[data-obsid]');

    listItems.forEach(li => {
        const obsId = li.dataset.obsid;
        const gtiNum = parseInt(li.dataset.gti, 10);
        const isSelectedInUI = li.classList.contains('selected');
        const indexInState = selectedGtis.findIndex(item => item.obsId === obsId && item.gti === gtiNum);

        if (isSelectedInUI && indexInState === -1) {
            // It's selected in the UI but not in our state array, so add it.
            selectedGtis.push({ obsId: obsId, gti: gtiNum });
        } else if (!isSelectedInUI && indexInState > -1) {
            // It's not selected in the UI but it is in our state array, so remove it.
            selectedGtis.splice(indexInState, 1);
        }
    });

    console.log('selectedGtis after reconciliation:', JSON.parse(JSON.stringify(selectedGtis)));
    updateSelectedGtisDisplay();
}

// Plotly default color palette - used to visually match GTI pills to their plot trace colors
const PLOTLY_COLORS = [
    '#636EFA', '#EF553B', '#00CC96', '#AB63FA', '#FFA15A',
    '#19D3F3', '#FF6692', '#B6E880', '#FF97FF', '#FECB52'
];

function updateSelectedGtisDisplay() {
    const selectedGtisDisplay = document.getElementById('selected-gtis-display');
    if (!selectedGtisDisplay) return;

    selectedGtisDisplay.innerHTML = '';

    if (selectedGtis.length === 0) {
        return;
    }

    // Card container
    const cardContainer = document.createElement('div');
    cardContainer.className = 'selected-gtis-pills';

    const sortedSelectedGtis = [...selectedGtis].sort((a, b) => {
        if (a.obsId < b.obsId) return -1;
        if (a.obsId > b.obsId) return 1;
        return a.gti - b.gti;
    });

    sortedSelectedGtis.forEach((item) => {
        const card = document.createElement('span');
        card.className = 'selected-gti-item';
        card.dataset.obsid = item.obsId;
        card.dataset.gti = item.gti;

        const textSpan = document.createElement('span');
        textSpan.className = 'gti-card-text';
        textSpan.textContent = `GTI${item.gti} (${item.obsId})`;

        const removeBtn = document.createElement('span');
        removeBtn.className = 'gti-card-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Click to remove';

        card.appendChild(textSpan);
        card.appendChild(removeBtn);
        cardContainer.appendChild(card);
    });

    selectedGtisDisplay.appendChild(cardContainer);
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
        fetchObsIDDataForGTI(obsId);
        loadGTIsForObsID(obsId);
        $('#show-gti-btn').prop('disabled', false).text("GTI Details");
    } else {
        fetchObsIDDataForGTI(obsId);
        loadGTIsForObsID(obsId);
        $('#show-gti-btn').prop('disabled', false).text("GTI Details");
    }
}

function addToTheaterPlaylist(obsid) {
    if (!obsid) return;
    if (!window.lcTheaterPlaylist) window.lcTheaterPlaylist = [];
    
    // Add to playlist (unique entries for cleaner sequence)
    if (!window.lcTheaterPlaylist.includes(obsid)) {
        window.lcTheaterPlaylist.push(obsid);
        if (window.StatusBar) window.StatusBar.getInstance().show(`Added ${obsid} to Theater Sequence.`, 1500);
    } else {
        if (window.StatusBar) window.StatusBar.getInstance().show(`${obsid} already in Sequence.`, 1000);
    }

    // If theater is open, sync the slider and view
    if ($("#lc-theater-panel").is(":visible")) {
        const newIndex = window.lcTheaterPlaylist.indexOf(obsid);
        $("#theater-slider").attr("max", window.lcTheaterPlaylist.length - 1).val(newIndex);
        if (window.updateTheaterFrame) window.updateTheaterFrame(newIndex);
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
    
    // Auto-track in Theater
    addToTheaterPlaylist(obsId);
    
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

function openLCTheater() {
    if (!window.lcTheaterPlaylist || window.lcTheaterPlaylist.length === 0) {
        alert("Please click some points on the HID first to build a sequence!");
        return;
    }
    $("#lc-theater-panel, #theater-overlay").fadeIn(200);
    $("#theater-slider").attr("max", window.lcTheaterPlaylist.length - 1).val(0);
    updateTheaterFrame(0);
}

document.addEventListener("DOMContentLoaded", () => {
  StatusBar.getInstance();
  injectDynamicStyles(); 

  const gtiList = document.getElementById('gti-list');
  if (gtiList) {
      gtiList.addEventListener('click', (e) => {
          if (e.target.tagName === 'LI' && !e.target.classList.contains('disabled-message')) {
              e.target.classList.toggle('selected');
              handleGtiSelectionChange();
          }
      });
  }

  // New listener for the selected GTIs display for deselection
  const selectedGtisDisplay = document.getElementById('selected-gtis-display');
  if (selectedGtisDisplay) {
      selectedGtisDisplay.addEventListener('click', (e) => {
          const card = e.target.closest('.selected-gti-item');
          if (card) {
              console.log('selected-gti-item clicked. current selectedGtis:', JSON.parse(JSON.stringify(selectedGtis)));
              const obsId = card.dataset.obsid;
              const gti = parseInt(card.dataset.gti, 10);
              console.log('Deselecting obsId:', obsId, 'gti:', gti);

              // Remove from selectedGtis array
              const filteredPills = selectedGtis.filter(item => !(item.obsId === obsId && item.gti === gti));
              selectedGtis.length = 0; // Clears without losing reference
              selectedGtis.push(...filteredPills);
              
              console.log('selectedGtis after deselection:', JSON.parse(JSON.stringify(selectedGtis)));

              // Update the display
              updateSelectedGtisDisplay();

              // Un-select from the gti-list if it's currently displayed
              const gtiListItem = document.querySelector(`#gti-list li[data-obsid='${obsId}'][data-gti='${gti}']`);
              if (gtiListItem) {
                  gtiListItem.classList.remove('selected');
              }
          }
      });
  }

  // New listener for the 'GTI Details' button
  const showGtiBtn = document.getElementById('show-gti-btn');
  if (showGtiBtn) {
      showGtiBtn.addEventListener('click', () => {
          const modal = document.getElementById('gti-modal');
          const modalBody = document.getElementById('gti-modal-body');
          const selectedObs = Array.from(document.getElementById('selected-obsids-list').children).map(li => li.dataset.obsid);

          modalBody.innerHTML = ''; // Clear previous content
          
          if (selectedObs.length === 0) {
              modalBody.innerHTML = '<p>Please select an Observation ID first.</p>';
          } else {
              let tableHTML = '<table class="gti-table"><thead><tr><th>ObsID</th><th>GTI Number</th><th>Details</th></tr></thead><tbody>';
              let gtiFound = false;
              selectedObs.forEach(obsId => {
                  const gtis = gtiMap[obsId] || [];
                  if (gtis.length > 0) {
                      gtis.forEach(gtiNum => {
                          const isSelected = selectedGtis.some(item => item.obsId === obsId && item.gti === gtiNum);
                          if (isSelected) {
                            gtiFound = true;
                            tableHTML += `<tr><td>${obsId}</td><td>GTI ${gtiNum}</td><td>Detailed information not yet available.</td></tr>`;
                          }
                      });
                  }
              });
              if (!gtiFound) {
                tableHTML += '<tr><td colspan="3">No GTIs selected in the dropdown. Select some to see details.</td></tr>';
              }
              tableHTML += '</tbody></table>';
              modalBody.innerHTML = tableHTML;
          }

          modal.style.display = 'block';
      });
  }

  // Listener to close the modal
  const closeModalBtn = document.querySelector('.modal-close-btn');
  if(closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
        document.getElementById('gti-modal').style.display = 'none';
    });
  }
  
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

          // LC Theater Logic (Silent Tracking)
          addToTheaterPlaylist(obsid);
      }
    });
  }

  const selectedObsidsList = document.getElementById("selected-obsids-list");
  if (selectedObsidsList) {
    selectedObsidsList.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-btn")) {
        const obsIdToRemove = e.target.parentElement.dataset.obsid;
        delete gtiMap[obsIdToRemove];
        const filteredObs = selectedGtis.filter(gti => gti.obsId !== obsIdToRemove);
        selectedGtis.length = 0;
        selectedGtis.push(...filteredObs);
        updateSelectedGtisDisplay();
        e.target.parentElement.remove();

        if (selectedObsidsList.children.length === 0) {
             const currentObsDisplay = document.getElementById("current-obsid-display");
             if(currentObsDisplay) currentObsDisplay.innerHTML = `Current ObsID: <span class="obsid-value-red">---</span>`;
             const infoBoxUl = document.querySelector("#general-info-box ul");
             if(infoBoxUl) infoBoxUl.innerHTML = "";
             document.getElementById('gti-list').innerHTML = '<li class="disabled-message">Select an ObsID to see available GTIs</li>';
        } else {
            const firstRemainingLi = selectedObsidsList.querySelector('li');
            if(firstRemainingLi) setActiveObsID(firstRemainingLi.dataset.obsid);
        }
        return;
      }
      const li = e.target.closest('li');
      if (li) {
          const obsid = li.getAttribute("data-obsid");
          setActiveObsID(obsid);

          // LC Theater Logic (Silent Tracking)
          addToTheaterPlaylist(obsid);
      }
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
            formData.append('search_type', $("#search-type").val());
            formData.append('csrfmiddlewaretoken', document.querySelector('[name=csrfmiddlewaretoken]').value);

            fetch(PLOT_COMBINED_URL, { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.plotDiv) {
                    const safeContainerId = 'global-safe-container';
                    if ($(`#${safeContainerId}`).length === 0) {
                        $('#plots').before(`<div id="${safeContainerId}" style="margin-bottom: 2rem; border-bottom: 1px solid #ddd;"></div>`);
                    }
                    $(`#${safeContainerId}`).html(`
                        <div class="plot-type-section">
                            <h3>GLOBAL HID</h3>
                            <div id="combined-hid-plot">${data.plotDiv}</div>
                            <div style="text-align:center; padding:15px; background:#fff; border-top:1px solid #eee; margin-top:-10px; border-bottom-left-radius:0.75rem; border-bottom-right-radius:0.75rem;">
                                <button id="btn-open-theater" class="btn btn-sm btn-dark" style="box-shadow: 0 4px 10px rgba(0,0,0,0.2); border-radius:5px; width:auto; display:inline-block;"> Track lc Plots </button>
                            </div>
                        </div>
                    `);
                    $('#plots').empty();

                    // Attach listener to the newly injected button
                    $(`#${safeContainerId}`).find('#btn-open-theater').on('click', openLCTheater);
                    
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
                            let obsIdText = point.text.replace(/<[^>]*>/g, '').trim(); 
                            const obsIdMatch = obsIdText.match(/ObsID:\s*(\d+)/) || [null, obsIdText];
                            const obsId = obsIdMatch[1];

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
                multiSelectedItems.forEach(li => obsidsToPlot.push(li.getAttribute('data-obsid')));
                StatusBar.getInstance().show(`Comparing ${obsidsToPlot.length} highlighted observations...`, -1);
            } else {
                const allListItems = selectedList.querySelectorAll('li');
                
                if (allListItems.length > 0) {
                     allListItems.forEach(li => obsidsToPlot.push(li.getAttribute('data-obsid')));
                     StatusBar.getInstance().show(`Comparing all ${obsidsToPlot.length} listed observations...`, -1);
                } else {
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
            $tempForm.append($('<input>').attr('name', 'search_type').val($('#search-type').val()));
            $tempForm.append($('<input>').attr('name', 'csrfmiddlewaretoken').val($('[name=csrfmiddlewaretoken]').val()));

            const finalGtiQuery = selectedGtis
            .filter(item => obsidsToPlot.includes(item.obsId)) // Only send GTIs for the IDs we are plotting
            .map(item => `${item.obsId}-${item.gti}`)
            .join(',');

            if (finalGtiQuery) {
             $tempForm.append($('<input>').attr('name', 'gti-search').val(finalGtiQuery));
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

  // LC Theater Track Points Button
  const trackPointsBtn = document.getElementById('track-points-btn');
  if (trackPointsBtn) {
    trackPointsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        openLCTheater();
    });
  }

});
