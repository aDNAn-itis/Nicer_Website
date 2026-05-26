/**
 * lcTheater.js
 * Implements the High-Speed Movie Engine for Sequence Tracking
 */

// Cache to store plot data for each ObsID to avoid redundant network calls
const theaterCache = new Map();

window.openLCTheater = function() {
    if (!window.lcTheaterPlaylist || window.lcTheaterPlaylist.length === 0) {
        alert("Please click some points on the HID first to build a sequence!");
        return;
    }
    $("#lc-theater-panel, #theater-overlay").fadeIn(200);
    $("#theater-slider").attr("min", 0).attr("max", window.lcTheaterPlaylist.length - 1).val(0);
    updateTheaterFrame(0);
};

export function updateTheaterFrame(index) {
    console.log("Movie Sequence Array:", window.lcTheaterPlaylist);
    const obsId = window.lcTheaterPlaylist[index];
    if (!obsId) return;

    const $plotArea = $("#theater-plot-area");
    const layoutUpdate = {
        paper_bgcolor: "#ffffff",
        plot_bgcolor: "#ffffff",
        "xaxis.autorange": true,
        "yaxis.autorange": true,
        margin: { t: 40, b: 40, l: 60, r: 20 }
    };

    // Check cache first for high-speed playback
    if (theaterCache.has(obsId)) {
        const plotData = theaterCache.get(obsId);
        Plotly.react("theater-plot-area", plotData.data, plotData.layout || layoutUpdate, {displayModeBar: false});
        $("#theater-obs-id").text("Sequence " + (parseInt(index)+1) + ": " + obsId);
        return;
    }

    // Show loading state in theater
    $plotArea.addClass('loading');

    $.ajax({ 
        type: "POST", 
        url: PLOT_GTI_URL, 
        data: { 
            "obs_id": obsId, 
            "plot_type": "light_curve", 
            "format": "json", 
            "csrfmiddlewaretoken": $("input[name=\"csrfmiddlewaretoken\"]").val() 
        },
        success: function(response) {
            $plotArea.removeClass('loading');
            if (!response.plotDivs || response.plotDivs.length === 0) {
                console.error("No plot data returned for", obsId);
                return;
            }
            const plotData = response.plotDivs[0];
            theaterCache.set(obsId, plotData);
            
            // Use Plotly.react for flicker-free data swapping
            Plotly.react("theater-plot-area", plotData.data, plotData.layout || layoutUpdate, {displayModeBar: false});
            $("#theater-obs-id").text("Sequence " + (parseInt(index)+1) + ": " + obsId);
        },
        error: function(err) {
            $plotArea.removeClass('loading');
            console.error("Failed to fetch theater frame:", err);
        }
    });
}
window.updateTheaterFrame = updateTheaterFrame;

async function generateGIF() {
    if (!window.lcTheaterPlaylist || window.lcTheaterPlaylist.length === 0) {
        alert("Playlist is empty!");
        return;
    }

    if (typeof gifshot === 'undefined') {
        alert("GIF library (gifshot) not loaded. Please check your internet connection.");
        return;
    }

    const $btn = $('#theater-gif-btn');
    const originalText = $btn.text();
    $btn.prop('disabled', true).text("⌛ Processing...");

    const images = [];
    const gd = document.getElementById('theater-plot-area');

    try {
        // Prepare layout for GIF
        const gifLayout = {
            width: 800,
            height: 400,
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff"
        };

        for (let i = 0; i < window.lcTheaterPlaylist.length; i++) {
            $btn.text(`Frame ${i+1}/${window.lcTheaterPlaylist.length}`);
            
            const obsId = window.lcTheaterPlaylist[i];
            let plotData;

            if (theaterCache.has(obsId)) {
                plotData = theaterCache.get(obsId);
            } else {
                // Fetch if not in cache (async)
                plotData = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: PLOT_GTI_URL,
                        data: {
                            'obs_id': obsId,
                            'plot_type': 'light_curve',
                            'format': 'json',
                            'csrfmiddlewaretoken': $("input[name='csrfmiddlewaretoken']").val()
                        },
                        success: (data) => {
                            if (data.plotDivs && data.plotDivs.length > 0) {
                                theaterCache.set(obsId, data.plotDivs[0]);
                                resolve(data.plotDivs[0]);
                            } else reject("No data");
                        },
                        error: reject
                    });
                });
            }

            // Render to theater area
            await Plotly.react(gd, plotData.data, {...(plotData.layout || {}), ...gifLayout}, {displayModeBar: false});
            
            // Ensure WebGL/SVG is fully flushed
            await new Promise(r => setTimeout(r, 200));

            // Capture image
            const imgData = await Plotly.toImage(gd, { format: 'png', width: 800, height: 400 });
            images.push(imgData);
        }

        $btn.text("Creating GIF"); 

        gifshot.createGIF({
            images: images,
            gifWidth: 800,
            gifHeight: 400,
            interval: 0.5, // seconds
            numFrames: images.length,
            sampleInterval: 10
        }, function(obj) {
            if (!obj.error) {
                const link = document.createElement('a');
                link.href = obj.image;
                link.download = `nicer_sequence_${Date.now()}.gif`;
                link.click();
                $btn.prop('disabled', false).text(originalText);
                if (window.StatusBar) window.StatusBar.getInstance().show("GIF downloaded successfully!", 3000);
            } else {
                console.error("GIF Error:", obj.error);
                alert("Error generating GIF: " + obj.error);
                $btn.prop('disabled', false).text(originalText);
            }
        });

    } catch (err) {
        console.error("GIF Generation failed:", err);
        alert("GIF Generation failed. See console for details.");
        $btn.prop('disabled', false).text(originalText);
    }
}

// Initialize the listeners
$(document).ready(function() {
    $(document).off('input', '#theater-slider').on('input', '#theater-slider', function() {
        updateTheaterFrame(this.value);
    });

    $(document).off('click', '#theater-gif-btn').on('click', '#theater-gif-btn', function() {
        generateGIF();
    });
});
