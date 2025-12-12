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

/**
 * Checks if the File System Access API is supported in the current browser.
 * @returns {boolean} True if supported, false otherwise.
 */
function checkFileSystemAccessSupport() {
  return 'showDirectoryPicker' in window;
}

/**
 * Scans a directory handle recursively to find all .dzi files.
 * @param {FileSystemDirectoryHandle} dirHandle - The directory handle to scan.
 * @param {string} basePath - The base path for tracking relative paths.
 * @returns {Promise<Array>} Array of objects containing dzi file handle and path.
 */
async function scanDirectoryForDZI(dirHandle, basePath = '') {
  const dziFiles = [];
  
  try {
    for await (const entry of dirHandle.values()) {
      const currentPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.dzi')) {
        dziFiles.push({
          handle: entry,
          name: entry.name,
          path: currentPath,
          dirHandle: dirHandle
        });
      } else if (entry.kind === 'directory') {
        // Recursively scan subdirectories
        const subDziFiles = await scanDirectoryForDZI(entry, currentPath);
        dziFiles.push(...subDziFiles);
      }
    }
  } catch (error) {
    console.error('Error scanning directory:', error);
  }
  
  return dziFiles;
}

/**
 * Creates a custom tile source for loading DZI from local file system.
 * @param {FileSystemFileHandle} dziFileHandle - The DZI file handle.
 * @param {FileSystemDirectoryHandle} dirHandle - The directory containing the DZI and tiles.
 * @returns {Promise<Object>} Custom tile source object for OpenSeadragon.
 */
async function createCustomTileSource(dziFileHandle, dirHandle) {
  // Read the DZI XML file
  const dziFile = await dziFileHandle.getFile();
  const dziText = await dziFile.text();
  
  // Parse DZI XML
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(dziText, 'text/xml');
  const image = xmlDoc.getElementsByTagName('Image')[0];
  const size = xmlDoc.getElementsByTagName('Size')[0];
  
  const tileSize = parseInt(image.getAttribute('TileSize'));
  const overlap = parseInt(image.getAttribute('Overlap'));
  const format = image.getAttribute('Format');
  const width = parseInt(size.getAttribute('Width'));
  const height = parseInt(size.getAttribute('Height'));
  
  // Get the tiles directory name (typically image_files)
  const dziFileName = dziFileHandle.name;
  const tilesDirectoryName = dziFileName.replace('.dzi', '_files');
  
  // Create custom tile source
  return {
    width: width,
    height: height,
    tileSize: tileSize,
    tileOverlap: overlap,
    minLevel: 0,
    maxLevel: Math.ceil(Math.log(Math.max(width, height)) / Math.log(2)),
    getTileUrl: async function(level, x, y) {
      // Construct the tile path: image_files/level/x_y.format
      const tilePath = `${tilesDirectoryName}/${level}/${x}_${y}.${format}`;
      
      try {
        // Navigate to the tiles directory
        const tilesDir = await dirHandle.getDirectoryHandle(tilesDirectoryName);
        const levelDir = await tilesDir.getDirectoryHandle(level.toString());
        const tileFile = await levelDir.getFileHandle(`${x}_${y}.${format}`);
        const file = await tileFile.getFile();
        
        // Create a blob URL for the tile
        return URL.createObjectURL(file);
      } catch (error) {
        console.error(`Error loading tile ${tilePath}:`, error);
        return '';
      }
    }
  };
}

/**
 * Displays the list of available DZI files in the UI.
 * @param {Array} dziFiles - Array of DZI file objects.
 */
function displayAvailableDZIFiles(dziFiles) {
  const container = document.getElementById('directory-files');
  const listContainer = document.getElementById('dzi-file-list');
  
  if (dziFiles.length === 0) {
    container.style.display = 'none';
    showInputError('No DZI files found in the selected directory.');
    return;
  }
  
  listContainer.innerHTML = '';
  
  dziFiles.forEach((dziFile, index) => {
    const fileButton = document.createElement('button');
    fileButton.textContent = `📄 ${dziFile.path}`;
    fileButton.style.cssText = `
      padding: 10px 15px;
      background: #3498db;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 0.95em;
      text-align: left;
      transition: background 0.2s;
    `;
    
    fileButton.addEventListener('mouseover', () => {
      fileButton.style.background = '#2980b9';
    });
    
    fileButton.addEventListener('mouseout', () => {
      fileButton.style.background = '#3498db';
    });
    
    fileButton.addEventListener('click', async () => {
      try {
        const customTileSource = await createCustomTileSource(dziFile.handle, dziFile.dirHandle);
        loadDZI(customTileSource, dziFile.name);
      } catch (error) {
        console.error('Error loading DZI:', error);
        showInputError('Failed to load DZI file. Please check the console for details.');
      }
    });
    
    listContainer.appendChild(fileButton);
  });
  
  container.style.display = 'block';
}

/**
 * Handles the directory picker interaction.
 */
async function handleDirectoryPicker() {
  if (!checkFileSystemAccessSupport()) {
    showInputError('Directory picker is not supported in this browser. Please use Chrome, Edge, or Opera.');
    return;
  }
  
  try {
    // Show directory picker
    const dirHandle = await window.showDirectoryPicker();
    
    // Show loading state
    document.getElementById('perf-log').textContent = '🔍 Scanning directory for DZI files...';
    document.getElementById('perf-log').style.color = '#3498db';
    
    // Scan for DZI files
    const dziFiles = await scanDirectoryForDZI(dirHandle);
    
    // Clear loading state
    document.getElementById('perf-log').textContent = '';
    
    // Display the files
    displayAvailableDZIFiles(dziFiles);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      // User cancelled the picker
      console.log('Directory picker cancelled by user');
    } else {
      console.error('Error accessing directory:', error);
      showInputError('Failed to access directory. Please try again.');
    }
  }
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

  // Directory picker button
  document.getElementById('choose-directory').addEventListener('click', handleDirectoryPicker);

  // Load default DZI image on page load
  loadDZI('https://openseadragon.github.io/example-images/highsmith/highsmith.dzi', 'Highsmith DZI Example');
});
