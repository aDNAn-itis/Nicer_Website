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

    // Check cache first for high-speed playback
    if (theaterCache.has(obsId)) {
        const plotData = theaterCache.get(obsId);
        const layoutUpdate = {
            paper_bgcolor: "#ffffff",
            plot_bgcolor: "#ffffff",
            "xaxis.autorange": true,
            "yaxis.autorange": true
        };
        Plotly.react("theater-plot-area", plotData.data, plotData.layout || layoutUpdate, {displayModeBar: false});
        $("#theater-obs-id").text("Sequence " + (parseInt(index)+1) + ": " + obsId);
        return;
    }

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
            const plotData = response.plotDivs[0];
            theaterCache.set(obsId, plotData);
            const layoutUpdate = {
                paper_bgcolor: "#ffffff",
                plot_bgcolor: "#ffffff",
                "xaxis.autorange": true,
                "yaxis.autorange": true
            };
            // Use Plotly.react for flicker-free data swapping
            Plotly.react("theater-plot-area", plotData.data, plotData.layout || layoutUpdate, {displayModeBar: false});
            $("#theater-obs-id").text("Sequence " + (parseInt(index)+1) + ": " + obsId);
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
        for (let i = 0; i < window.lcTheaterPlaylist.length; i++) {
            $btn.text(`⌛ Frame ${i+1}/${window.lcTheaterPlaylist.length}`);
            
            // Update frame (ensure it's rendered)
            await new Promise((resolve) => {
                const obsId = window.lcTheaterPlaylist[i];
                if (theaterCache.has(obsId)) {
                    const plotData = theaterCache.get(obsId);
                    Plotly.react("theater-plot-area", plotData.data, plotData.layout || {}, {displayModeBar: false});
                    // Give a small delay for Plotly to finish rendering
                    setTimeout(resolve, 300);
                } else {
                    // Fetch if not in cache (should be rare if they used the slider)
                    $.ajax({
                        type: 'POST',
                        url: PLOT_GTI_URL,
                        data: {
                            'obs_id': obsId,
                            'plot_type': 'light_curve',
                            'format': 'json',
                            'csrfmiddlewaretoken': $("input[name='csrfmiddlewaretoken']").val()
                        },
                        success: function(data) {
                            const plotData = data.plotDivs[0];
                            theaterCache.set(obsId, plotData);
                            Plotly.react("theater-plot-area", plotData.data, plotData.layout || {}, {displayModeBar: false});
                            setTimeout(resolve, 500);
                        }
                    });
                }
            });

            // Capture image
            const imgData = await Plotly.toImage(gd, { format: 'png', width: 800, height: 400 });
            images.push(imgData);
        }

        $btn.text("🎬 Encoding...");

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

function clearSequence() {
    if (confirm("Clear entire theater sequence?")) {
        window.lcTheaterPlaylist = [];
        theaterCache.clear();
        $('#theater-plot-area').empty();
        $('#theater-obs-id').text("Playlist Cleared.");
        $("#theater-slider").attr("max", 0).val(0);
        if (window.StatusBar) window.StatusBar.getInstance().show("Theater Sequence Cleared.", 2000);
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

    $(document).off('click', '#theater-clear-btn').on('click', '#theater-clear-btn', function() {
        clearSequence();
    });
});
