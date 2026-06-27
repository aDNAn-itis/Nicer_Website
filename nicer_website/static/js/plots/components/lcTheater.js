/**
 * Light Curve Theater
 * Handles the rapid-fire sequence viewer and GIF engine with Plotly.
 */

const theaterImageCache = new Map(); // Keep for structure if needed, or remove later

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
    preloadSequence();
  } catch (err) {
    console.error("Failed to initialize theater:", err);
  }
}
window.openLCTheater = openLCTheater;

/**
 * Pre-load is disabled for smart loading. 
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
 * Main update function for Plotly data fetching.
 * @param {number} index Index in the playlist
 */
export async function updateTheaterFrame(index) {
  const obsId = window.lcTheaterPlaylist[index];
  if (!obsId) return;

  $("#theater-obs-id-label").text(obsId);

  // List selection styling
  $("#theater-obsid-list div").removeClass("active").css({"background": "transparent", "color": "#000"});
  const $activeItem = $(`#theater-obsid-list div[data-index="${index}"]`);
  $activeItem.addClass("active").css({"background": "#3b82f6", "color": "#fff"});

  // Show the loading text overlay
  $('#theater-loading-overlay').css('display', 'flex');

  const q = quality || 'goddard';
  const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';

  const plotTypes = [
    { type: 'global_hid', container: '#theater-global-hid-plot' },
    { type: 'light_curve', container: '#theater-lc-plot' },
    { type: 'power_density_spectrum', container: '#theater-pds-plot' },
    { type: 'hardness_intensity_diagram', container: '#theater-hid-plot' }
  ];

  // Clear previous plots
  plotTypes.forEach(pt => {
    $(pt.container).html('<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#888;">Loading...</div>');
  });

  const loadPromises = plotTypes.map(async (pt) => {
    const formData = new FormData();
    formData.append('obs_id', obsId);
    formData.append('quality', q);
    formData.append('search_type', 'obs_id');
    formData.append('plot_types', pt.type);
    formData.append('is_theater', 'true');
    if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken);
    
    // Pass the full playlist to the backend to generate the background context
    if (pt.type === 'global_hid' && window.lcTheaterPlaylist) {
      formData.append('playlist', window.lcTheaterPlaylist.join(','));
    }

    try {
      const response = await fetch(PLOT_GRAPH_URL, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (data.plotDivs && data.plotDivs.length > 0) {
        // Inject Plotly HTML
        $(pt.container).html(data.plotDivs[0]);
        // Force the wrapper div created by plotly to fill height
        $(pt.container).children('div').first().css({ width: '100%', height: '100%' });
      } else {
        $(pt.container).html('<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#888;">No Data Available</div>');
      }
    } catch (err) {
      console.error(`Failed to fetch ${pt.type} for ${obsId}:`, err);
      $(pt.container).html('<div style="display:flex; justify-content:center; align-items:center; height:100%; color:red;">Error Loading Plot</div>');
    }
  });

  try {
    await Promise.all(loadPromises);
    if (window.MathJax) MathJax.typesetPromise();
  } catch (err) {
    console.error("Error loading theater frame:", err);
  } finally {
    // Hide the loading overlay
    $('#theater-loading-overlay').fadeOut(200);
  }
}
window.updateTheaterFrame = updateTheaterFrame;

/**
 * GIF Generation using Plotly.toImage and direct canvas stitching.
 */
async function generateGIF() {
  const $btn = $('#theater-gif-btn');
  $btn.prop('disabled', true).text("STITCHING...");

  const playlist = window.lcTheaterPlaylist;
  const frames = [];

  const getPlotImage = async (wrapperId) => {
    const el = document.querySelector(`#${wrapperId} .js-plotly-plot`);
    if (!el) return null;
    try {
      return await Plotly.toImage(el, {format: 'png', width: 800, height: 600});
    } catch (e) {
      console.warn("Plotly toImage failed", e);
      return null;
    }
  };

  const waitLoad = (src) => new Promise(r => {
    if (!src) return r(null);
    const img = new Image();
    img.onload = () => r(img);
    img.onerror = () => r(null);
    img.src = src;
  });

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1600; 
    canvas.height = 1200;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < playlist.length; i++) {
      await updateTheaterFrame(i);

      // Wait a moment for Plotly animations/renders to settle
      await new Promise(r => setTimeout(r, 600));

      const srcGHID = await getPlotImage('theater-global-hid-plot');
      const srcLC = await getPlotImage('theater-lc-plot');
      const srcPDS = await getPlotImage('theater-pds-plot');
      const srcHID = await getPlotImage('theater-hid-plot');

      const imgGHID = await waitLoad(srcGHID);
      const imgLC = await waitLoad(srcLC);
      const imgPDS = await waitLoad(srcPDS);
      const imgHID = await waitLoad(srcHID);

      // Clear and Stitch onto Canvas
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2x2 Grid
      if (imgGHID) ctx.drawImage(imgGHID, 0, 0, 800, 600);
      if (imgLC) ctx.drawImage(imgLC, 800, 0, 800, 600);
      if (imgPDS) ctx.drawImage(imgPDS, 0, 600, 800, 600);
      if (imgHID) ctx.drawImage(imgHID, 800, 600, 800, 600);

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
