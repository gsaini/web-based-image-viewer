// Basic viewer setup
let viewer = (window.viewer = OpenSeadragon({
  element: "viewer",
  prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
  minZoomImageRatio: 0.01,
  visibilityRatio: 0,
  crossOriginPolicy: "Anonymous",
  ajaxWithCredentials: true,
  sequenceMode: true,
}));
//https://modis-vi-nasa.s3-us-west-2.amazonaws.com//MOD13A1.006/2018.01.01.tif

document.getElementById("file-picker").onchange = function (ev) {
  viewer.close();
  clearImageInfo();

  setupImage(this.files[0], this.files[0].name);
};

document.getElementById("use-link").onclick = function () {
  viewer.close();
  clearImageInfo();
  let input = document.getElementById("link-input");
  let url = input.value;
  if (!url) return;
  setupImage(url, url);
};
let links = [...document.querySelectorAll(".demo-link")].map((el) => {
  el.onclick = function () {
    // console.log('demo-link clicked',this);
    let href = this.getAttribute("data-href");
    // console.log('clicked:',href);
    document.querySelector("#link-input").setAttribute("value", href);
    document.querySelector("#use-link").dispatchEvent(new Event("click"));
  };
  return el;
});

/**
 * Handles file and URL input for loading TIFF images into the OpenSeadragon viewer.
 * Sets up event listeners for file picker, URL input, and demo links.
 * Tracks performance from initialization to image display.
 * @param {File|string} tileSourceInput - The TIFF file object or URL to load as a tile source.
 * @param {string} [tilesourceName=""] - Optional label for the image (file name or URL).
 */
function setupImage(tileSourceInput, tilesourceName = "") {
  viewer.close();
  clearImageInfo();
  document.getElementById("filename").textContent = tilesourceName;

  showLoader(true); // Show loader when starting to load
  /**
   * Record the start time for performance measurement.
   * @type {number}
   */
  const perfStart = performance.now();

  /**
   * Promise resolving to an array of GeoTIFF tile sources.
   * @type {Promise<OpenSeadragon.TileSource[]>}
   */
  let tiffTileSources = OpenSeadragon.GeoTIFFTileSource.getAllTileSources(tileSourceInput, {
    logLatency: true,
  });

  tiffTileSources.then((ts) => {
    viewer.open(ts);
    /**
     * Listen for the 'open' event to measure when the image is loaded.
     * Logs the time taken from initialization to display in seconds.
     */
    viewer.addHandler('open', function() {
      const perfEnd = performance.now();
      const loadTimeSeconds = ((perfEnd - perfStart) / 1000).toFixed(3);
      console.log('[PERF]', {
        event: 'image-opened',
        message: 'Image has been loaded and displayed.',
        loadTimeSeconds: loadTimeSeconds
      });
      showLoader(false); // Hide loader when image is loaded
    });
  });

  tiffTileSources
    .then((tileSources) => {
      document.getElementById("filename").textContent +=
        " -- " + tileSources.length + " image" + (tileSources.length != 1 ? "s" : "") + " found";
      Promise.all(tileSources.map((t) => t.promises.ready)).then(() =>
        showTileSourcesInfo(tileSources)
      );
    })
    .catch((error) => {
      document.getElementById("filename").textContent +=
        ": Error opening file. Is this a valid tiff? See console for details.";
      console.error(error);
      showLoader(false); // Hide loader on error
    });
}

/**
 * Clears the image information display fields in the UI.
 */
function clearImageInfo() {
  document.getElementById("image-description").textContent = "";
  document.getElementById("associated-images").textContent = "";
}

/**
 * Displays information about all tile sources in the UI.
 * @param {OpenSeadragon.TileSource[]} tileSources - Array of tile sources to display info for.
 */
function showTileSourcesInfo(tileSources) {
  clearImageInfo();
  let desc = document.getElementById("image-description");
  tileSources.map((ts, index) => {
    let images = ts.GeoTIFFImages;
    let h = document.createElement("h3");
    h.textContent = "TileSource #" + index;
    desc.appendChild(h);
    showImageInfo(images);
    desc.appendChild(document.createElement("hr"));
    return images;
  });
}

/**
 * Displays detailed information about each image/page in a TIFF file.
 * @param {Array} images - Array of GeoTIFF image objects.
 */
function showImageInfo(images) {
  let desc = document.getElementById("image-description");
  let frag = document.createDocumentFragment();

  images.forEach((image, index) => {
    let d = document.createElement("div");
    frag.appendChild(d);
    let t = document.createElement("h4");
    d.appendChild(t);
    t.textContent = "Tiff Page " + index;

    let fd = Object.assign({}, image.fileDirectory);
    if (fd.ImageDescription) {
      let info = document.createElement("div");
      d.appendChild(info);
      let ID =
        "<u>ImageDescription contents for this subimage</u><br>" +
        fd.ImageDescription.replaceAll("|", "<br>");
      delete fd.ImageDescription;
      info.innerHTML = ID;
    }

    let to_print = {};
    Object.entries(fd).forEach(([k, v]) => {
      to_print[k] =
        typeof v !== "string" && v.length > 8
          ? "" + v.constructor.name + " (" + v.length + ") [...]"
          : typeof v !== "string" && typeof v.length !== "undefined"
            ? v.constructor.name + "(" + v.length + ") [" + [...v.values()] + "]"
            : v;
    });

    let pre = document.createElement("pre");
    d.appendChild(pre);
    pre.textContent = JSON.stringify(to_print, null, 2);
  });
  desc.appendChild(frag);
}

/**
 * Validates if the given URL is a valid TIFF file URL.
 * @param {string} url
 * @returns {boolean}
 */
function isValidTiffUrl(url) {
  try {
    const parsed = new URL(url);
    // Must end with .tif or .tiff and be http(s)
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && /\.(tif|tiff)(\?.*)?$/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Shows an error message in the filename field for 3 seconds.
 * @param {string} msg
 */
function showInputError(msg) {
  const filename = document.getElementById('filename');
  const old = filename.textContent;
  filename.textContent = msg;
  filename.style.color = '#c0392b';
  setTimeout(() => {
    filename.textContent = old;
    filename.style.color = '';
  }, 3000);
}

// Update event handler for use-link
const useLinkBtn = document.getElementById('use-link');
if (useLinkBtn) {
  useLinkBtn.onclick = function () {
    viewer.close();
    clearImageInfo();
    let input = document.getElementById('link-input');
    let url = input.value.trim();
    if (!url) {
      showInputError('Please enter a TIFF file URL.');
      return;
    }
    if (!isValidTiffUrl(url)) {
      showInputError('Please enter a valid TIFF image URL (must end with .tif or .tiff and use http/https).');
      return;
    }
    setupImage(url, url);
  };
}

// Load a default TIFF file on page load
window.addEventListener('DOMContentLoaded', function() {
  const defaultUrl = 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/36/Q/WD/2020/7/S2A_36QWD_20200701_0_L2A/TCI.tif';
  const linkInput = document.getElementById('link-input');
  if (linkInput) linkInput.value = defaultUrl;
  setupImage(defaultUrl, defaultUrl);
});

// Show/hide loader utility
function showLoader(show) {
  const loader = document.getElementById('loader');
  if (loader) loader.style.display = show ? 'block' : 'none';
}
