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
let currentTheaterReqId = 0;

export async function updateTheaterFrame(index) {
  const reqId = ++currentTheaterReqId;
  const obsId = window.lcTheaterPlaylist[index];
  if (!obsId) return;

  $("#theater-obs-id-label").text(obsId);

  // List selection styling
  $("#theater-obsid-list div").removeClass("active").css({"background": "transparent", "color": "#000"});
  const $activeItem = $(`#theater-obsid-list div[data-index="${index}"]`);
  $activeItem.addClass("active").css({"background": "#3b82f6", "color": "#fff"});

  // Show the loading text overlay only if not animating
  if (typeof isTheaterPlaying === 'undefined' || !isTheaterPlaying) {
    $('#theater-loading-overlay').css('display', 'flex');
  }

  const q = quality || 'goddard';
  const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value || '';

    const plotTypes = [
    { type: 'global_hid', container: '#theater-global-hid-plot' },
    { type: 'global_lc', container: '#theater-global-lc-plot' },
    { type: 'spectrum', container: '#theater-spectrum-plot' },
    { type: 'light_curve', container: '#theater-lc-plot' },
    { type: 'power_density_spectrum', container: '#theater-pds-plot' },
    { type: 'hardness_intensity_diagram', container: '#theater-hid-plot' }
  ];

  // Remove local loading overlays based on user feedback
  // We rely solely on the global #theater-loading-overlay which is activated above.

  const loadPromises = plotTypes.map(async (pt) => {
    const cacheKey = `${obsId}_${pt.type}_${q}`;
    const wrapperId = `theater_wrap_${cacheKey}`;
    
    // If it exists in DOM, we are done (True DOM caching)
    if ($(`#${wrapperId}`).length > 0) {
      return { container: pt.container, wrapperId: wrapperId, newlyCreated: false };
    }

    const formData = new FormData();
    formData.append('obs_id', obsId);
    formData.append('quality', q);
    formData.append('search_type', 'obs_id');
    formData.append('plot_types', pt.type);
    formData.append('is_theater', 'true');
    if (csrfToken) formData.append('csrfmiddlewaretoken', csrfToken);
    
    // Pass the full playlist to the backend to generate the background context
    if ((pt.type === 'global_hid' || pt.type === 'global_lc') && window.lcTheaterPlaylist) {
      formData.append('playlist', window.lcTheaterPlaylist.join(','));
    }

    try {
      const response = await fetch(PLOT_GRAPH_URL, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      let html = '<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#888;">No Data Available</div>';
      if (data.plotDivs && data.plotDivs.length > 0) {
        html = data.plotDivs[0];
      }
      return { container: pt.container, wrapperId: wrapperId, html: html, newlyCreated: true };
    } catch (err) {
      console.error(`Failed to fetch ${pt.type} for ${obsId}:`, err);
      return { container: pt.container, wrapperId: wrapperId, html: '<div style="color:red;">Failed to Load</div>', newlyCreated: true };
    }
  });

  try {
    const results = await Promise.all(loadPromises);
    
    // Check if a new request was started while we were fetching.
    // If so, discard these results to prevent DOM collisions and race conditions.
    if (reqId !== currentTheaterReqId) {
        return;
    }
    
    // First, hide all wrappers in all containers
    plotTypes.forEach(pt => {
      $(pt.container).children('.theater-plot-wrapper').hide();
    });
    
    // Inject or show HTML simultaneously
    results.forEach(res => {
      if (res.newlyCreated) {
        const wrapper = $(`<div id="${res.wrapperId}" class="theater-plot-wrapper" style="width:100%; height:100%;"></div>`);
        
        // Append to DOM first so embedded scripts can resolve document.getElementById successfully
        $(res.container).append(wrapper);
        wrapper.html(res.html);
        
        wrapper.children('div').first().css({ width: '100%', height: '100%' });
      } else {
        // Instant visual switch via CSS display, no Plotly re-rendering
        $(`#${res.wrapperId}`).show();
      }
    });
    if (window.MathJax) MathJax.typesetPromise();
  } catch (err) {
    console.error("Error loading theater frame:", err);
  } finally {
    if (reqId === currentTheaterReqId) {
      // Hide the loading overlays only if this is the active request
      if (typeof isTheaterPlaying === 'undefined' || !isTheaterPlaying) {
        $('#theater-loading-overlay').fadeOut(200);
      }
    }
  }
}
window.updateTheaterFrame = updateTheaterFrame;

/**
 * ============================================================================
 * NEW FUNCTIONALITY: GIF GENERATOR & RACE CONDITION HANDLING
 * ============================================================================
 * Approach:
 * 1. The script sequentially runs `updateTheaterFrame(i)` to fetch Plotly SVGs.
 * 2. It waits for the Plotly engine to finish mathematically rendering the heavy 
 *    nodes (via setTimeout) before invoking `Plotly.toImage`.
 * 3. It paints the resulting images onto an invisible 1600x1200 HTML5 Canvas.
 * 4. IMPORTANT: If the background "Play Animation" loop is currently active, 
 *    it is forcefully suspended here (`isTheaterPlaying = false`). If this was 
 *    not done, the background loop would continuously overwrite the DOM while 
 *    the GIF stitcher was trying to capture frames, resulting in race conditions 
 *    where the GIF would look frozen on a single random observation.
 * ============================================================================
 */
async function generateGIF() {
  // If the animation is playing in the background, stop it so they don't fight!
  if (typeof isTheaterPlaying !== 'undefined' && isTheaterPlaying) {
    isTheaterPlaying = false;
    $('#theater-play-btn').html('▶ Play Animation').removeClass('btn-danger').addClass('btn-primary');
  }

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
    canvas.height = 1800; // Increased to fit the 5th plot
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < playlist.length; i++) {
      await updateTheaterFrame(i);
      
      // Wait a moment for Plotly animations/renders to settle
      await new Promise(r => setTimeout(r, 600));

      const srcGHID = await getPlotImage('theater-global-hid-plot');
      const srcLC = await getPlotImage('theater-lc-plot');
      const srcPDS = await getPlotImage('theater-pds-plot');
      const srcHID = await getPlotImage('theater-hid-plot');
      const srcGLC = await getPlotImage('theater-global-lc-plot');
      const srcSPEC = await getPlotImage('theater-spectrum-plot');

      const imgGHID = await waitLoad(srcGHID);
      const imgLC = await waitLoad(srcLC);
      const imgPDS = await waitLoad(srcPDS);
      const imgHID = await waitLoad(srcHID);
      const imgGLC = await waitLoad(srcGLC);
      const imgSPEC = await waitLoad(srcSPEC);

      // Clear and Stitch onto Canvas
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw 6 plots on a 2x3 grid mapping to the HTML layout order
      if (imgGHID) ctx.drawImage(imgGHID, 0, 0, 800, 600);
      if (imgGLC) ctx.drawImage(imgGLC, 800, 0, 800, 600);
      if (imgSPEC) ctx.drawImage(imgSPEC, 0, 600, 800, 600);
      if (imgLC) ctx.drawImage(imgLC, 800, 600, 800, 600);
      if (imgPDS) ctx.drawImage(imgPDS, 0, 1200, 800, 600);
      if (imgHID) ctx.drawImage(imgHID, 800, 1200, 800, 600);

      frames.push(canvas.toDataURL('image/png'));
      $btn.text(`CAPTURED ${i+1}/${playlist.length}`);
    }

    $btn.text("CREATING GIF...");

    gifshot.createGIF({
      images: frames,
      gifWidth: 1200,
      gifHeight: 1350,
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

/**
 * ============================================================================
 * NEW FUNCTIONALITY: PLAY/STOP ANIMATION LOOP
 * ============================================================================
 * Approach:
 * This launches a recursive asynchronous timeout loop (`playLoop`) that 
 * increments the `currentIndex` and automatically triggers `updateTheaterFrame`.
 * The DOM is updated in-place seamlessly due to the `Promise.all` logic 
 * inside `updateTheaterFrame` which prevents staggered layout thrashing.
 * ============================================================================
 */
let isTheaterPlaying = false;

async function toggleTheaterPlay() {
  const $btn = $('#theater-play-btn');
  const playlist = window.lcTheaterPlaylist;
  if (!playlist || playlist.length === 0) return;

  if (isTheaterPlaying) {
    // Stop playing
    isTheaterPlaying = false;
    $btn.html('▶ Play Animation').removeClass('btn-danger').addClass('btn-primary');
  } else {
    // Start playing
    isTheaterPlaying = true;
    $btn.html('⏸ Stop Animation').removeClass('btn-primary').addClass('btn-danger');
    
    let currentIndex = 0;
    const $activeItem = $("#theater-obsid-list div.active");
    if ($activeItem.length) {
      currentIndex = parseInt($activeItem.attr('data-index')) || 0;
    }

    const playLoop = async () => {
      if (!isTheaterPlaying) return;
      
      currentIndex++;
      if (currentIndex >= playlist.length) currentIndex = 0;
      
      await updateTheaterFrame(currentIndex);
      
      if (isTheaterPlaying) {
        setTimeout(playLoop, 2000); // Wait 2 seconds before switching to the next frame
      }
    };
    
    // start loop
    setTimeout(playLoop, 1000);
  }
}

$(document).ready(function() {
  $(document).off('click', '#theater-play-btn').on('click', '#theater-play-btn', toggleTheaterPlay);
  
  // Ensure animation stops if the theater is closed
  $(document).on('click', '#close-theater-btn, #theater-overlay', function() {
    isTheaterPlaying = false;
    $('#theater-play-btn').html('▶ Play Animation').removeClass('btn-danger').addClass('btn-primary');
  });

  $(document).on('click', '#close-theater-btn', function() {
    $('#lc-theater-panel, #theater-overlay').fadeOut(200);
  });
});
