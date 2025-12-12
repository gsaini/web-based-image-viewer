let viewerInstance = null;
let currentImageId = null;

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
  const statusEl = document.getElementById('status-message');
  statusEl.textContent = message;
  statusEl.className = `status-message ${type}`;
  statusEl.style.display = 'block';
  
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 4000);
}

/**
 * Upload file to server
 */
async function uploadFile(file) {
  const formData = new FormData();
  formData.append('image', file);
  
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const uploadProgress = document.getElementById('upload-progress');
  
  uploadProgress.style.display = 'block';
  progressBar.style.width = '0%';
  progressText.textContent = 'Uploading...';
  
  try {
    const xhr = new XMLHttpRequest();
    
    // Track upload progress
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressBar.style.width = percentComplete + '%';
        progressText.textContent = `Uploading... ${Math.round(percentComplete)}%`;
      }
    });
    
    // Handle completion
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        const response = JSON.parse(xhr.responseText);
        progressText.textContent = '✅ Upload complete!';
        progressBar.style.width = '100%';
        
        setTimeout(() => {
          uploadProgress.style.display = 'none';
          showStatus(`File uploaded successfully! (${response.info.width} × ${response.info.height})`, 'success');
          loadFileList();
        }, 1000);
      } else {
        throw new Error('Upload failed');
      }
    });
    
    xhr.addEventListener('error', () => {
      uploadProgress.style.display = 'none';
      showStatus('Upload failed. Please try again.', 'error');
    });
    
    xhr.open('POST', '/api/upload');
    xhr.send(formData);
    
  } catch (error) {
    console.error('Upload error:', error);
    uploadProgress.style.display = 'none';
    showStatus('Upload failed: ' + error.message, 'error');
  }
}

/**
 * Load and display file list
 */
async function loadFileList() {
  try {
    const response = await fetch('/api/images');
    const images = await response.json();
    
    const container = document.getElementById('file-list-container');
    
    if (images.length === 0) {
      container.innerHTML = '<div class="empty-state">No files uploaded yet</div>';
      return;
    }
    
    container.innerHTML = '';
    
    images.forEach((image) => {
      const item = document.createElement('div');
      item.className = 'file-item';
      if (image.id === currentImageId) {
        item.classList.add('active');
      }
      
      const fileName = document.createElement('div');
      fileName.className = 'file-name';
      fileName.textContent = `${image.width} × ${image.height}`;
      
      const fileInfo = document.createElement('div');
      fileInfo.className = 'file-info';
      fileInfo.textContent = `${image.originalFormat.toUpperCase()} • ${new Date(image.uploadedAt).toLocaleDateString()}`;
      
      item.appendChild(fileName);
      item.appendChild(fileInfo);
      
      item.addEventListener('click', () => {
        loadImage(image);
      });
      
      container.appendChild(item);
    });
    
  } catch (error) {
    console.error('Error loading file list:', error);
    showStatus('Failed to load file list', 'error');
  }
}

/**
 * Load and display an image using FlexTileSource
 */
function loadImage(image) {
  currentImageId = image.id;
  
  // Update active state in file list
  document.querySelectorAll('.file-item').forEach(item => {
    item.classList.remove('active');
  });
  event.target.closest('.file-item').classList.add('active');
  
  // Update viewer header
  document.getElementById('viewer-title').textContent = `${image.width} × ${image.height}`;
  document.getElementById('viewer-info').textContent = 
    `Format: ${image.originalFormat.toUpperCase()} • Uploaded: ${new Date(image.uploadedAt).toLocaleString()}`;
  
  // Destroy previous viewer
  if (viewerInstance && typeof viewerInstance.destroy === 'function') {
    viewerInstance.destroy();
  } else if (viewerInstance && typeof viewerInstance.close === 'function') {
    viewerInstance.close();
  }
  
  document.getElementById('viewer').innerHTML = '';
  
  showStatus('Loading image...', 'info');
  
  const startTime = performance.now();
  
  // Calculate pyramid levels
  const tileSize = 256;
  const maxDimension = Math.max(image.width, image.height);
  const maxLevel = Math.ceil(Math.log2(maxDimension / tileSize));
  
  // Build levels array for FlexTileSource
  const levels = [];
  for (let level = 0; level <= maxLevel; level++) {
    const scale = Math.pow(2, maxLevel - level);
    levels.push({
      width: Math.ceil(image.width / scale),
      height: Math.ceil(image.height / scale),
      tileWidth: tileSize,
      tileHeight: tileSize
    });
  }
  
  // Create OpenSeadragon viewer with FlexTileSource
  viewerInstance = OpenSeadragon({
    id: "viewer",
    prefixUrl: "https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.0.0/images/",
    tileSources: {
      type: 'flex-image-pyramid',
      levels: levels,
      tilesUrl: `/api/image/${image.id}_files/`,
      fileFormat: 'jpeg',
      queryParams: ''
    },
    showNavigator: true,
    navigatorPosition: 'BOTTOM_RIGHT',
    visibilityRatio: 1.0,
    minZoomLevel: 0.5,
    maxZoomLevel: 20,
    zoomPerScroll: 1.2,
    animationTime: 0.5,
    blendTime: 0.1,
    constrainDuringPan: true,
    maxZoomPixelRatio: 2,
    minPixelRatio: 0.5,
    smoothTileEdgesMinZoom: Infinity,
    iOSDevice: false
  });
  
  viewerInstance.addHandler('open', function() {
    const loadTime = ((performance.now() - startTime) / 1000).toFixed(2);
    showStatus(`Image loaded in ${loadTime}s`, 'success');
  });
  
  viewerInstance.addHandler('open-failed', function(event) {
    showStatus('Failed to load image', 'error');
    console.error('Open failed:', event);
  });
}

/**
 * Initialize the application
 */
window.addEventListener('DOMContentLoaded', () => {
  console.log('[WSI Viewer] Initialized');
  
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  
  // Click to browse
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });
  
  // File input change
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      uploadFile(file);
      fileInput.value = ''; // Reset input
    }
  });
  
  // Drag and drop
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragging');
  });
  
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragging');
  });
  
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    
    const file = e.dataTransfer.files[0];
    if (file) {
      // Validate file type
      const validExtensions = ['.tif', '.tiff', '.scn'];
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      
      if (validExtensions.includes(ext)) {
        uploadFile(file);
      } else {
        showStatus('Please upload a TIFF or SCN file', 'error');
      }
    }
  });
  
  // Load initial file list
  loadFileList();
});
