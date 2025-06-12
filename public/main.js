let viewerInitStartTime = 0;
let viewerInstance = null;

/**
 * Validates if the given URL is a valid DZI image URL.
 * Checks for http(s) protocol and .dzi file extension.
 * @param {string} url - The URL string to validate.
 * @returns {boolean} True if the URL is a valid DZI image URL, false otherwise.
 */
function isValidDziUrl(url) {
  try {
    const parsed = new URL(url);
    // Must end with .dzi and be http(s)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && /\.dzi(\?.*)?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Displays an error message in the performance log area for 3 seconds.
 * @param {string} msg - The error message to display.
 */
function showInputError(msg) {
  const perfLog = document.getElementById('perf-log');
  perfLog.textContent = msg;
  perfLog.style.color = '#c0392b';
  setTimeout(() => { perfLog.textContent = ''; perfLog.style.color = '#555'; }, 3000);
}

/**
 * Tracks and logs performance events, updates UI for loading, success, or error.
 * @param {string} event - The event name (e.g., 'image-opened', 'viewer-init-start').
 * @param {Object} [extra={}] - Additional data to log and display.
 */
function trackPerformance(event, extra = {}) {
  const now = performance.now();
  const data = {
    event,
    timestamp: Date.now(),
    perfNow: now,
    ...extra
  };
  if (event === 'image-opened' && extra.loadTimeSeconds) {
    document.getElementById('perf-log').textContent = `⏱️ Loaded in ${extra.loadTimeSeconds} seconds.`;
    document.getElementById('perf-log').style.color = '#555';
    document.getElementById('loader').style.display = 'none';
  } else if (event === 'viewer-init-start') {
    document.getElementById('perf-log').textContent = '';
    document.getElementById('perf-log').style.color = '#555';
    document.getElementById('loader').style.display = 'block';
  } else if (event === 'viewer-init-error') {
    document.getElementById('perf-log').textContent = '❌ Failed to load image.';
    document.getElementById('perf-log').style.color = '#c0392b';
    document.getElementById('loader').style.display = 'none';
  }
  console.log('[PERF]', data);
}

/**
 * Loads a DZI image into the OpenSeadragon viewer and tracks load performance.
 * Empties the previous viewer instance if present.
 * @param {string|Object} tileSource - The DZI URL or tile source object to load.
 * @param {string} label - Optional label for logging (e.g., file name or URL).
 */
function loadDZI(tileSource, label) {
  // Destroy previous viewer if exists
  if (viewerInstance && typeof viewerInstance.destroy === 'function') {
    viewerInstance.destroy();
  } else if (viewerInstance && typeof viewerInstance.close === 'function') {
    viewerInstance.close();
  }
  document.getElementById('viewer').innerHTML = '';
  viewerInitStartTime = performance.now();
  trackPerformance('viewer-init-start');
  viewerInstance = OpenSeadragon({
    id: "viewer",
    prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.0.0/images/",
    tileSources: tileSource,
    showNavigator: true,
    visibilityRatio: 1.0,
    minZoomLevel: 1,
    maxZoomLevel: 20
  });
  /**
   * Event handler for when the image is fully loaded and displayed.
   * Logs the time taken from initialization to display.
   */
  viewerInstance.addHandler('open', function() {
    const imageOpenedTime = performance.now();
    const loadTimeSeconds = ((imageOpenedTime - viewerInitStartTime) / 1000).toFixed(3);
    trackPerformance('image-opened', {
      message: 'Image has been loaded and displayed.' + (label ? ' [' + label + ']' : ''),
      loadTimeSeconds: loadTimeSeconds
    });
  });
}

// DOMContentLoaded event: sets up event listeners for user input and loads images.
window.addEventListener('DOMContentLoaded', () => {
  trackPerformance('dom-content-loaded');
  document.getElementById('use-link').addEventListener('click', function() {
    const url = document.getElementById('link-input').value.trim();
    if (!url) {
      showInputError('Please enter a DZI file URL.');
      return;
    }
    if (!isValidDziUrl(url)) {
      showInputError('Please enter a valid DZI image URL (must end with .dzi and use http/https).');
      return;
    }
    loadDZI(url, url);
  });

  // Load default DZI image on page load
  loadDZI('https://openseadragon.github.io/example-images/highsmith/highsmith.dzi', 'Highsmith DZI Example');
});
