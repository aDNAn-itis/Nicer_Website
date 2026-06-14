/**
 * lcTheater.js - RAPID-FIRE SEQUENCE VIEWER & HIGH-RES GIF ENGINE
 */

let globalHidPoints = []; 
const theaterImageCache = new Map(); // 🟢 NEW: In-memory cache for preloaded images

const PLOT_CONFIG = {
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

    $("#lc-theater-panel, #theater-overlay").fadeIn(200);
    
    // Header info
    const sourceName = $("#source-search").val() || "Unknown Source";
    $("#theater-source-label").text(sourceName);

    populateObsIDList();
    
    try {
        await initGlobalHid();
        updateTheaterFrame(0);
        
        // 🟢 START PRE-LOADING THE ENTIRE SEQUENCE
        preloadSequence();
    } catch (err) {
        console.error("Failed to initialize theater:", err);
    }
}
window.openLCTheater = openLCTheater;

/**
 * 🟢 NEW: Pre-loads all images in the playlist into browser memory
 */
function preloadSequence() {
    const playlist = window.lcTheaterPlaylist;
    const q = quality || 'goddard';
    const baseUrl = PLOT_THEATER_PNG_URL;
    const plotTypes = ['light_curve', 'power_density_spectrum', 'hardness_intensity_diagram'];

    console.log(`🚀 Pre-loading ${playlist.length * 3} images...`);

    playlist.forEach(obsId => {
        plotTypes.forEach(type => {
            const url = `${baseUrl}?obs_id=${obsId}&plot_type=${type}&quality=${q}`;
            if (!theaterImageCache.has(url)) {
                const img = new Image();
                img.src = url;
                theaterImageCache.set(url, img); // Store the Image object in memory
            }
        });
    });
}

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
                "color": "#000"
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
        xaxis: { title: 'Hardness' },
        yaxis: { title: 'Intensity', type: 'log' },
        showlegend: false,
        margin: { t: 30, b: 40, l: 50, r: 20 },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white'
    };

    Plotly.newPlot('theater-global-hid', [backgroundTrace, highlightTrace], layout, PLOT_CONFIG);
}

/**
 * Main update function - RAPID IMAGE SWAPPING
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

    // 2. Update Subplot Images (FAST)
    const q = quality || 'goddard';
    const baseUrl = PLOT_THEATER_PNG_URL;
    const plotTypes = ['light_curve', 'power_density_spectrum', 'hardness_intensity_diagram'];
    const imgIds = ['theater-lc-img', 'theater-pds-img', 'theater-hid-img'];

    plotTypes.forEach((type, i) => {
        const url = `${baseUrl}?obs_id=${obsId}&plot_type=${type}&quality=${q}`;
        const el = document.getElementById(imgIds[i]);
        
        // 🟢 CHECK CACHE FIRST: If pre-loaded, swap instantly.
        if (theaterImageCache.has(url)) {
            el.src = theaterImageCache.get(url).src;
        } else {
            el.src = url;
        }
    });
}
window.updateTheaterFrame = updateTheaterFrame;

/**
 * GIF Generation - DIRECT CANVAS STITCHING (Rapid & Sharp)
 */
async function generateGIF() {
    const $btn = $('#theater-gif-btn');
    $btn.prop('disabled', true).text("STITCHING...");

    const playlist = window.lcTheaterPlaylist;
    const frames = [];

    // Helper to wait for image load
    const waitLoad = (img) => new Promise(r => {
        if (img.complete) r();
        else img.onload = r;
    });

    try {
        const canvas = document.createElement('canvas');
        canvas.width = 1600; 
        canvas.height = 1200;
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < playlist.length; i++) {
            await updateTheaterFrame(i);
            
            // Get the 3 PNG images
            const imgLC = document.getElementById('theater-lc-img');
            const imgPDS = document.getElementById('theater-pds-img');
            const imgHID = document.getElementById('theater-hid-img');

            // Wait for them to actually load
            await Promise.all([waitLoad(imgLC), waitLoad(imgPDS), waitLoad(imgHID)]);

            // Get the Plotly image (Global HID) as a dataURL
            const plotlyDataUrl = await Plotly.toImage('theater-global-hid', {format: 'png', width: 800, height: 600});
            const imgGlobal = new Image();
            imgGlobal.src = plotlyDataUrl;
            await waitLoad(imgGlobal);

            // Clear and Stitch onto Canvas
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 2x2 Grid
            ctx.drawImage(imgGlobal, 0, 0, 800, 600);    // Top Left
            ctx.drawImage(imgLC, 800, 0, 800, 600);      // Top Right
            ctx.drawImage(imgPDS, 0, 600, 800, 600);     // Bottom Left
            ctx.drawImage(imgHID, 800, 600, 800, 600);   // Bottom Right

            frames.push(canvas.toDataURL('image/png'));
            $btn.text(`CAPTURED ${i+1}/${playlist.length}`);
        }

        $btn.text("ENCODING GIF...");
        
        gifshot.createGIF({
            images: frames,
            gifWidth: 1200,
            gifHeight: 900,
            interval: 0.5,
            numFrames: frames.length
        }, function(obj) {
            if (!obj.error) {
                const link = document.createElement('a');
                link.href = obj.image;
                link.download = `nicer_sequence_${Date.now()}.gif`;
                link.click();
            }
            $btn.prop('disabled', false).text("GENERATE GIF");
        });

    } catch (err) {
        console.error("GIF Error:", err);
        $btn.prop('disabled', false).text("GENERATE GIF");
    }
}

$(document).ready(function() {
    $(document).off('click', '#theater-gif-btn').on('click', '#theater-gif-btn', generateGIF);
});
