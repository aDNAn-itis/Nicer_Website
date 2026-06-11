/**
 * lcTheater.js - MATPLOTLIB-STYLE TWO-CONTAINER VIEWER
 * Implements a paper-style 2x2 grid report with red-bordered boxes
 */

const theaterCache = new Map();
let globalHidPoints = []; 

// Matplotlib-style constants for fixed, non-interactive plots
const MATPLOTLIB_LAYOUT = {
    font: { family: 'serif', size: 12, color: '#000', weight: 'normal' },
    paper_bgcolor: '#fff',
    plot_bgcolor: '#fff',
    margin: { t: 30, b: 40, l: 60, r: 20 },
    xaxis: {
        linecolor: '#000',
        linewidth: 1.5,
        mirror: true,
        showgrid: false,
        zeroline: false,
        ticks: 'inside',
        tickcolor: '#000',
        title: { font: { weight: 'normal' } },
        tickfont: { weight: 'normal' }
    },
    yaxis: {
        linecolor: '#000',
        linewidth: 1.5,
        mirror: true,
        showgrid: false,
        zeroline: false,
        ticks: 'inside',
        tickcolor: '#000',
        title: { font: { weight: 'normal' } },
        tickfont: { weight: 'normal' }
    }
};

const PLOT_CONFIG = {
    staticPlot: true, // Absolutely no interaction (zoom/pan/hover)
    responsive: true,
    displayModeBar: false
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
        // Trigger resize to ensure plots fill the new 90% flex layout
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
 * Fills the right red box with clickable ObsIDs
 */
function populateObsIDList() {
    const $list = $("#theater-obsid-list");
    $list.empty();
    
    console.log("Populating ObsID List with:", window.lcTheaterPlaylist);

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

    // Sequence Background: Hollow Black Circles
    const backgroundTrace = {
        x: x,
        y: y,
        mode: 'markers',
        type: 'scatter',
        marker: { 
            size: 8, 
            color: 'white', 
            line: { width: 1.5, color: '#000' } 
        }
    };

    // Current State: Solid Red Circle with Text Label
    const highlightTrace = {
        x: [x[0]],
        y: [y[0]],
        mode: 'markers+text',
        type: 'scatter',
        marker: { 
            size: 14, 
            color: '#e03131', 
            line: { width: 1.5, color: '#000' }
        },
        text: [globalHidPoints[0].obsid],
        textposition: 'top right',
        textfont: { family: 'monospace', size: 14, color: '#e03131', weight: 'normal' }
    };

    const layout = {
        ...MATPLOTLIB_LAYOUT,
        xaxis: { ...MATPLOTLIB_LAYOUT.xaxis, title: 'Hardness' },
        yaxis: { ...MATPLOTLIB_LAYOUT.yaxis, title: 'Intensity', type: 'log' },
        showlegend: false
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
    $activeItem.addClass("active").css({"background": "#e03131", "color": "#fff"});

    // 1. Update Global HID Marker
    const point = globalHidPoints.find(p => p.obsid === obsId);
    if (point) {
        Plotly.restyle('theater-global-hid', {
            x: [[point.hardness]],
            y: [[point.intensity]],
            text: [[obsId]]
        }, [1]);
    }

    // 2. Update 3 Subplots (Forced B&W)
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
            // Force Black and White with thick lines
            const bwData = plotData.data.map(trace => ({
                ...trace,
                line: { ...trace.line, color: '#000', width: 1.5 },
                marker: { ...trace.marker, color: '#000', line: { color: '#000', width: 1 } },
                fillcolor: 'rgba(0,0,0,0.05)'
            }));

            Plotly.react(container, bwData, applyMatplotlibStyle(plotData.layout, type), PLOT_CONFIG);
        }
    }
}

function applyMatplotlibStyle(originalLayout, type) {
    const styled = {
        ...MATPLOTLIB_LAYOUT,
        xaxis: { ...MATPLOTLIB_LAYOUT.xaxis, title: originalLayout.xaxis?.title?.text || '' },
        yaxis: { ...MATPLOTLIB_LAYOUT.yaxis, title: originalLayout.yaxis?.title?.text || '' }
    };
    if (type === 'power_density_spectrum') {
        styled.xaxis.type = 'log';
        styled.yaxis.type = 'log';
    } else if (type === 'hardness_intensity_diagram') {
        styled.yaxis.type = 'log';
    }
    return styled;
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
