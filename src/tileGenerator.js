const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');

// Global Sharp configuration for performance and stability with large files
try {
  sharp.cache(false); // Disable cache to prevent memory bloat
  sharp.concurrency(1); // Limit concurrency to prevent CPU/IO saturation
} catch (e) {
  console.warn('Could not set global sharp options:', e);
}

/**
 * TileGenerator class for processing TIFF/SCN files and generating DZI tiles
 */
class TileGenerator {
  constructor(uploadsDir) {
    this.uploadsDir = uploadsDir;
    this.tilesDir = path.join(uploadsDir, 'tiles');
    this.originalDir = path.join(uploadsDir, 'original');
    // Lightweight in-memory cache for metadata (avoids repeated Sharp calls on gigapixel images)
    this.metadataCache = new Map();
  }

  /**
   * Initialize directories
   */
  async init() {
    await fs.mkdir(this.uploadsDir, { recursive: true });
    await fs.mkdir(this.tilesDir, { recursive: true });
    await fs.mkdir(this.originalDir, { recursive: true });
  }

  /**
   * Get image metadata
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<Object>} Image metadata
   */
  async getImageMetadata(imagePath) {
    // Configure Sharp to handle very large images (gigapixel WSI files)
    const image = sharp(imagePath, {
      limitInputPixels: false, // Disable pixel limit for very large images
      sequentialRead: true     // Optimize for sequential reading
    });
    const metadata = await image.metadata();
    
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      channels: metadata.channels,
      depth: metadata.depth,
      hasAlpha: metadata.hasAlpha,
      pages: metadata.pages || 1
    };
  }

  /**
   * Get cached metadata or extract from file
   * @param {string} imageId - Image ID
   * @param {string} imagePath - Path to the image file
   * @returns {Promise<Object>} Image metadata
   */
  async getCachedMetadata(imageId, imagePath) {
    // Check cache first
    if (this.metadataCache.has(imageId)) {
      return this.metadataCache.get(imageId);
    }
    
    // Extract metadata and cache it
    const metadata = await this.getImageMetadata(imagePath);
    this.metadataCache.set(imageId, metadata);
    return metadata;
  }

  /**
   * Calculate the number of pyramid levels
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} tileSize - Tile size
   * @returns {number} Number of levels
   */
  calculateLevels(width, height, tileSize = 256) {
    const maxDimension = Math.max(width, height);
    return Math.ceil(Math.log2(maxDimension / tileSize)) + 1;
  }

  /**
   * Generate a single tile
   * @param {string} imagePath - Path to the source image
   * @param {string} outputPath - Path to save the tile
   * @param {number} level - Pyramid level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @param {number} tileSize - Tile size in pixels
   * @param {number} originalWidth - Original image width
   * @param {number} originalHeight - Original image height
   */
  async generateTile(imagePath, outputPath, level, x, y, tileSize, originalWidth, originalHeight) {
    // Calculate the scale factor for this level
    const maxLevels = this.calculateLevels(originalWidth, originalHeight, tileSize);
    const scale = Math.pow(2, maxLevels - level - 1);
    
    // Calculate scaled dimensions
    const scaledWidth = Math.ceil(originalWidth / scale);
    const scaledHeight = Math.ceil(originalHeight / scale);
    
    // Calculate tile position and size at scaled level
    const left = x * tileSize;
    const top = y * tileSize;
    const width = Math.min(tileSize, scaledWidth - left);
    const height = Math.min(tileSize, scaledHeight - top);
    
    // Skip if tile is outside image bounds
    if (left >= scaledWidth || top >= scaledHeight) {
      return null;
    }
    
    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    // OPTIMIZED: Extract region from original image first, then resize
    // This is much faster for gigapixel images than resizing the whole image
    const originalLeft = Math.floor(left * scale);
    const originalTop = Math.floor(top * scale);
    const originalWidth_region = Math.ceil(width * scale);
    const originalHeight_region = Math.ceil(height * scale);
    
    // Generate the tile with optimized settings for speed
    // NOTE: Removed sequentialRead: true to allow random access to regions
    await sharp(imagePath, {
      limitInputPixels: false,
      pages: 1 // Only read first page for multi-page TIFFs
    })
      .extract({
        left: originalLeft,
        top: originalTop,
        width: Math.min(originalWidth_region, originalWidth - originalLeft),
        height: Math.min(originalHeight_region, originalHeight - originalTop)
      })
      .resize(width, height, {
        fit: 'fill',
        kernel: 'nearest', // Fastest resize algorithm
        fastShrinkOnLoad: true // Enable fast shrink-on-load
      })
      .jpeg({ 
        quality: 75, // Lower quality for faster encoding
        progressive: false, // Faster than progressive
        mozjpeg: true // Use mozjpeg for better compression
      })
      .toFile(outputPath);
    
    return outputPath;
  }

  /**
   * Generate tile on-demand from source file
   * @param {string} imageId - Unique image identifier
   * @param {number} level - Pyramid level
   * @param {number} x - Tile X coordinate
   * @param {number} y - Tile Y coordinate
   * @returns {Promise<string>} Path to the generated tile
   */
  async generateTileOnDemand(imageId, level, x, y) {
    // Find the image file
    let imagePath = path.join(this.originalDir, `${imageId}.tif`);
    
    try {
      await fs.access(imagePath);
    } catch (error) {
      const files = await fs.readdir(this.originalDir);
      const imageFile = files.find(f => f.startsWith(imageId));
      if (!imageFile) {
        throw new Error(`Image not found: ${imageId}`);
      }
      imagePath = path.join(this.originalDir, imageFile);
    }
    
    // Get cached metadata (fast!)
    const metadata = await this.getCachedMetadata(imageId, imagePath);
    const tileSize = 256;
    
    // Generate tile path
    const tilePath = path.join(this.tilesDir, imageId, String(level), `${x}_${y}.jpg`);
    
    // Check if tile already exists (optional caching)
    try {
      await fs.access(tilePath);
      return tilePath;
    } catch (error) {
      // Generate the tile
      await this.generateTile(
        imagePath,
        tilePath,
        level,
        x,
        y,
        tileSize,
        metadata.width,
        metadata.height
      );
      return tilePath;
    }
  }



  /**
   * Process uploaded image - just save the file
   * @param {string} imageId - Unique image identifier
   * @param {string} originalPath - Path to uploaded file
   * @returns {Promise<Object>} Basic image information
   */
  async processUpload(imageId, originalPath) {
    // Get basic metadata for response
    const metadata = await this.getImageMetadata(originalPath);
    
    // Move to original directory
    const ext = path.extname(originalPath);
    const newPath = path.join(this.originalDir, `${imageId}${ext}`);
    await fs.rename(originalPath, newPath);
    
    // Clean up temp directory after successful upload
    try {
      const tempDir = path.join(this.uploadsDir, 'temp');
      const tempFiles = await fs.readdir(tempDir);
      for (const file of tempFiles) {
        const filePath = path.join(tempDir, file);
        const stat = await fs.stat(filePath);
        if (stat.isFile()) {
          await fs.unlink(filePath);
        }
      }
    } catch (error) {
      console.log('Temp cleanup skipped:', error.message);
    }
    
    // Return basic info (no caching)
    return {
      id: imageId,
      width: metadata.width,
      height: metadata.height,
      tileSize: 256,
      format: 'jpeg',
      levels: this.calculateLevels(metadata.width, metadata.height, 256),
      originalFormat: metadata.format,
      uploadedAt: new Date().toISOString()
    };
  }

  /**
   * List all uploaded images
   * @returns {Promise<Array>} List of image info objects
   */
  async listImages() {
    try {
      const files = await fs.readdir(this.originalDir);
      const images = [];
      
      for (const file of files) {
        // Skip hidden files
        if (file.startsWith('.')) continue;
        
        try {
          const imageId = path.parse(file).name;
          const imagePath = path.join(this.originalDir, file);
          const metadata = await this.getImageMetadata(imagePath);
          const stat = await fs.stat(imagePath);
          
          images.push({
            id: imageId,
            width: metadata.width,
            height: metadata.height,
            originalFormat: metadata.format,
            uploadedAt: stat.birthtime.toISOString()
          });
        } catch (error) {
          console.error(`Error reading ${file}:`, error.message);
          continue;
        }
      }
      
      return images;
    } catch (error) {
      return [];
    }
  }
}

module.exports = TileGenerator;
