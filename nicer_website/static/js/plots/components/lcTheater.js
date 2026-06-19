/**
 * lcTheater.js - RAPID-FIRE SEQUENCE VIEWER & HIGH-RES GIF ENGINE
 */

const theaterImageCache = new Map(); // 🟢 In-memory cache for preloaded images

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
        updateTheaterFrame(0);
        
        // 🟢 START PRE-LOADING THE ENTIRE SEQUENCE
        preloadSequence();
    } catch (err) {
        console.error("Failed to initialize theater:", err);
    }
}
window.openLCTheater = openLCTheater;

/**
 * 🟢 Pre-load is disabled for smart loading. 
 * We now fetch images lazily on demand.
 */
function preloadSequence() {
    console.log("Preloading disabled to prevent network jam.");
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
 * Main update function - RAPID IMAGE SWAPPING
 * Optimized to wait for all 4 images to load before showing them simultaneously.
 */
export async function updateTheaterFrame(index) {
    const obsId = window.lcTheaterPlaylist[index];
    if (!obsId) return;

    $("#theater-obs-id-label").text(obsId);

    // List selection styling
    $("#theater-obsid-list div").removeClass("active").css({"background": "transparent", "color": "#000"});
    const $activeItem = $(`#theater-obsid-list div[data-index="${index}"]`);
    $activeItem.addClass("active").css({"background": "#3b82f6", "color": "#fff"});

    // Update ALL 4 Images (FAST)
    const q = quality || 'goddard';
    const baseUrl = PLOT_THEATER_PNG_URL;
    const playlistStr = window.lcTheaterPlaylist.join(',');
    
    const plotTypes = ['global_hid', 'light_curve', 'power_density_spectrum', 'hardness_intensity_diagram'];
    const imgIds = ['theater-global-hid-img', 'theater-lc-img', 'theater-pds-img', 'theater-hid-img'];


    // Show the loading text overlay
    $('#theater-loading-overlay').css('display', 'flex');

    // 🟢 SYNCED LOADING LOGIC
    // We create temporary images in the background and only update the DOM when all are ready
    const loadPromises = plotTypes.map((type, i) => {
        return new Promise((resolve) => {
            let url = `${baseUrl}?obs_id=${obsId}&plot_type=${type}&quality=${q}`;
            if (type === 'global_hid') {
                url += `&playlist=${playlistStr}`;
            }

            // If it's already in our in-memory cache, resolve immediately
            if (theaterImageCache.has(url)) {
                resolve({ id: imgIds[i], src: theaterImageCache.get(url).src });
                return;
            }

            const tempImg = new Image();
            tempImg.onload = () => resolve({ id: imgIds[i], src: url });
            tempImg.onerror = () => resolve({ id: imgIds[i], src: url }); // Resolve anyway to avoid hanging
            tempImg.src = url;
        });
    });

    // Wait for all 4 images to be fully ready
    const results = await Promise.all(loadPromises);

    // Swap all 4 images in the DOM at the exact same time
    results.forEach(res => {
        const el = document.getElementById(res.id);
        if (el) el.src = res.src;
    });

    // Hide the loading overlay
    $('#theater-loading-overlay').fadeOut(200);
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
            
            // Get the 4 PNG images
            const imgGHID = document.getElementById('theater-global-hid-img');
            const imgLC = document.getElementById('theater-lc-img');
            const imgPDS = document.getElementById('theater-pds-img');
            const imgHID = document.getElementById('theater-hid-img');

            // Wait for them to actually load
            await Promise.all([waitLoad(imgGHID), waitLoad(imgLC), waitLoad(imgPDS), waitLoad(imgHID)]);

            // Clear and Stitch onto Canvas
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // 2x2 Grid
            ctx.drawImage(imgGHID, 0, 0, 800, 600);      // Top Left
            ctx.drawImage(imgLC, 800, 0, 800, 600);      // Top Right
            ctx.drawImage(imgPDS, 0, 600, 800, 600);     // Bottom Left
            ctx.drawImage(imgHID, 800, 600, 800, 600);   // Bottom Right

            frames.push(canvas.toDataURL('image/png'));
            $btn.text(`CAPTURED ${i+1}/${playlist.length}`);
        }

        $btn.text("CREATING GIF...");
        
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
