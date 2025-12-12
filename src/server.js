const express = require('express');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const TileGenerator = require('./tileGenerator');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize tile generator
const uploadsDir = path.join(__dirname, '../uploads');
const tileGenerator = new TileGenerator(uploadsDir);

// Initialize directories
tileGenerator.init().catch(console.error);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const tempDir = path.join(uploadsDir, 'temp');
    const fs = require('fs').promises;
    await fs.mkdir(tempDir, { recursive: true });
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024 * 1024 // 15GB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.tif', '.tiff', '.scn'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only TIFF and SCN files are allowed'));
    }
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// File upload endpoint
app.post('/api/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const imageId = uuidv4();
    const info = await tileGenerator.processUpload(imageId, req.file.path);

    res.json({
      success: true,
      imageId: imageId,
      info: info
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});






// Serve tiles using DZI standard URL pattern: {imageId}_files/{level}/{x}_{y}.jpeg
app.get('/api/image/:imageIdWithFiles/:level/:tile', async (req, res) => {
  try {
    const { imageIdWithFiles, level, tile } = req.params;
    
    // Remove '_files' suffix from imageId
    const imageId = imageIdWithFiles.replace(/_files$/, '');
    
    // Parse tile coordinates from filename (e.g., "0_0.jpeg")
    const match = tile.match(/^(\d+)_(\d+)\.(jpg|jpeg)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid tile format' });
    }

    const x = parseInt(match[1]);
    const y = parseInt(match[2]);
    const levelNum = parseInt(level);

    // Generate tile on-demand
    const tilePath = await tileGenerator.generateTileOnDemand(imageId, levelNum, x, y);
    
    // Serve the tile
    res.sendFile(tilePath);
  } catch (error) {
    console.error('Tile error:', error);
    res.status(404).json({ error: 'Tile not found' });
  }
});

// List all uploaded images
app.get('/api/images', async (req, res) => {
  try {
    const images = await tileGenerator.listImages();
    res.json(images);
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: error.message });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`Tiles directory: ${uploadsDir}`);
});