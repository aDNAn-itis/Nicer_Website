/**
 * lcTheater.js - INTERACTIVE SEQUENCE VIEWER
 */

const theaterCache = new Map();
let globalHidPoints = []; 

const PLOT_CONFIG = {
    responsive: true,
    displayModeBar: true
};

/**
 * Opens the theater and initializes the sequence
 */
export async function openLCTheater() {
    if (!window.lcTheaterPlaylist || window.lcTheaterPlaylist.length === 0) {
        alert("Please select some observations first (click points on the Global HID plot)!");
        return;
    }

    $("#lc-theater-panel, #theater-overlay").fadeIn(200, function() {
        // Trigger resize to ensure plots fill the new layout
        const containers = ['theater-global-hid', 'theater-lc', 'theater-pds', 'theater-hid'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) Plotly.Plots.resize(el);
        });
    });
    
    // Header info
    const sourceName = $("#source-search").val() || "Unknown Source";
    $("#theater-source-label").text(sourceName);

    populateObsIDList();
    
    try {
        await initGlobalHid();
        updateTheaterFrame(0);
    } catch (err) {
        console.error("Failed to initialize theater:", err);
        alert("Error initializing sequence viewer.");
    }
}
window.openLCTheater = openLCTheater;

/**
 * Fills the ObsID list
 */
function populateObsIDList() {
    const $list = $("#theater-obsid-list");
    $list.empty();
    
    window.lcTheaterPlaylist.forEach((obsId, idx) => {
        const $item = $("<div>")
            .text(obsId)
            .attr("data-index", idx)
            .css({
                "padding": "10px 15px",
                "cursor": "pointer",
                "border-bottom": "1px solid #eee",
                "transition": "all 0.1s",
                "color": "#000",
                "font-weight": "normal"
            })
            .hover(
                function() { $(this).css("background", "#f0f0f0"); },
                function() { if (!$(this).hasClass("active")) $(this).css("background", "transparent"); }
            )
            .click(function() {
                updateTheaterFrame($(this).attr("data-index"));
            });
        
        $list.append($item);
    });
}

/**
 * Global HID data fetching
 */
async function initGlobalHid() {
    const obsids = window.lcTheaterPlaylist;
    const formData = new FormData();
    formData.append('obs_ids', obsids.join(','));
    formData.append('quality', quality || 'goddard');
    formData.append('csrfmiddlewaretoken', $("input[name=\"csrfmiddlewaretoken\"]").val());

    const response = await fetch(PLOT_COMBINED_URL, { method: 'POST', body: formData });
    const data = await response.json();

    if (data.error) throw new Error(data.error);
    globalHidPoints = data.rawData || [];
    renderGlobalHidBase();
}

function renderGlobalHidBase() {
    const x = globalHidPoints.map(p => p.hardness);
    const y = globalHidPoints.map(p => p.intensity);

    const backgroundTrace = {
        x: x,
        y: y,
        mode: 'markers',
        type: 'scatter',
        name: 'Sequence',
        marker: { size: 10, color: '#ccc', opacity: 0.5 }
    };

    const highlightTrace = {
        x: [x[0]],
        y: [y[0]],
        mode: 'markers+text',
        type: 'scatter',
        name: 'Current',
        marker: { size: 14, color: '#3b82f6', line: { width: 2, color: '#fff' } },
        text: [globalHidPoints[0].obsid],
        textposition: 'top right'
    };

    const layout = {
        title: 'Global HID Sequence',
        xaxis: { title: 'Hardness' },
        yaxis: { title: 'Intensity', type: 'log' },
        showlegend: false,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)'
    };

    Plotly.newPlot('theater-global-hid', [backgroundTrace, highlightTrace], layout, PLOT_CONFIG);
}

/**
 * Main update function
 */
export async function updateTheaterFrame(index) {
    const obsId = window.lcTheaterPlaylist[index];
    if (!obsId) return;

    $("#theater-obs-id-label").text(obsId);

    // List selection styling
    $("#theater-obsid-list div").removeClass("active").css({"background": "transparent", "color": "#000"});
    const $activeItem = $(`#theater-obsid-list div[data-index="${index}"]`);
    $activeItem.addClass("active").css({"background": "#3b82f6", "color": "#fff"});

    // 1. Update Global HID Marker
    const point = globalHidPoints.find(p => p.obsid === obsId);
    if (point) {
        Plotly.restyle('theater-global-hid', {
            x: [[point.hardness]],
            y: [[point.intensity]],
            text: [[obsId]]
        }, [1]);
    }

    // 2. Update Subplots (Default Styles)
    await updateSubplots(obsId);
}
window.updateTheaterFrame = updateTheaterFrame;

async function updateSubplots(obsId) {
    const types = ['light_curve', 'power_density_spectrum', 'hardness_intensity_diagram'];
    const containers = ['theater-lc', 'theater-pds', 'theater-hid'];
    
    for (let i = 0; i < types.length; i++) {
        const type = types[i];
        const container = containers[i];
        const cacheKey = `${obsId}_${type}`;

        let plotData;
        if (theaterCache.has(cacheKey)) {
            plotData = theaterCache.get(cacheKey);
        } else {
            try {
                const response = await $.ajax({
                    type: "POST",
                    url: PLOT_GTI_URL,
                    data: {
                        "obs_id": obsId,
                        "plot_type": type,
                        "format": "json",
                        "csrfmiddlewaretoken": $("input[name=\"csrfmiddlewaretoken\"]").val()
                    }
                });
                if (response.plotDivs && response.plotDivs.length > 0) {
                    plotData = response.plotDivs[0];
                    theaterCache.set(cacheKey, plotData);
                }
            } catch (err) { continue; }
        }

        if (plotData) {
            Plotly.react(container, plotData.data, plotData.layout, PLOT_CONFIG);
        }
    }
}

/**
 * GIF Generation
 */
async function generateGIF() {
    const $btn = $('#theater-gif-btn');
    $btn.prop('disabled', true).text("CAPTURNING...");

    const images = [];
    const playlist = window.lcTheaterPlaylist;
    const pageElement = document.getElementById('theater-page-content');

    try {
        for (let i = 0; i < playlist.length; i++) {
            await updateTheaterFrame(i);
            await new Promise(r => setTimeout(r, 800));
            const canvas = await html2canvas(pageElement, { scale: 1.5, backgroundColor: "#ffffff" });
            images.push(canvas.toDataURL('image/png'));
        }
        $btn.text("ENCODING...");
        gifshot.createGIF({
            images: images,
            gifWidth: 1200,
            gifHeight: 900,
            interval: 0.6,
            numFrames: images.length
        }, function(obj) {
            if (!obj.error) {
                const link = document.createElement('a');
                link.href = obj.image;
                link.download = `nicer_report_${Date.now()}.gif`;
                link.click();
            }
            $btn.prop('disabled', false).text("GENERATE GIF");
        });
    } catch (err) {
        $btn.prop('disabled', false).text("GENERATE GIF");
    }
}

$(document).ready(function() {
    $(document).off('click', '#theater-gif-btn').on('click', '#theater-gif-btn', function() {
        generateGIF();
    });
});
