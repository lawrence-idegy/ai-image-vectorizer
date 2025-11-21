const potrace = require('potrace');
const sharp = require('sharp');

class PotraceService {
  /**
   * Convert an image to SVG using Potrace (fallback for simple images)
   * @param {Buffer} imageBuffer - Image buffer
   * @param {object} options - Potrace options
   * @returns {Promise<string>} - SVG content as string
   */
  async vectorizeImage(imageBuffer, options = {}) {
    try {
      console.log('Starting vectorization with Potrace (fallback)...');

      // Potrace works best with preprocessed images
      const processedBuffer = await this.preprocessImage(imageBuffer);

      // Map detail level to Potrace parameters
      const detailLevel = options.detailLevel || 'medium';
      let detailSettings = {};

      switch (detailLevel) {
        case 'low':
          detailSettings = {
            turdSize: 4, // More aggressive speckle suppression
            optTolerance: 0.5, // More simplification
            alphaMax: 1.0
          };
          break;
        case 'high':
          detailSettings = {
            turdSize: 0, // Keep all details
            optTolerance: 0.1, // Minimal simplification
            alphaMax: 0
          };
          break;
        case 'medium':
        default:
          detailSettings = {
            turdSize: 2,
            optTolerance: 0.2,
            alphaMax: 0.5
          };
      }

      // Default Potrace parameters for best quality
      const potraceOptions = {
        color: 'auto', // Use color detection
        background: 'transparent',
        threshold: options.threshold || potrace.THRESHOLD_AUTO,
        ...detailSettings,
        ...options
      };

      console.log(`Using detail level: ${detailLevel}`, detailSettings);

      return new Promise((resolve, reject) => {
        potrace.trace(processedBuffer, potraceOptions, (error, svg) => {
          if (error) {
            console.error('Potrace error:', error);
            reject(new Error(`Potrace vectorization failed: ${error.message}`));
          } else {
            console.log('Vectorization completed successfully with Potrace');
            resolve(svg);
          }
        });
      });
    } catch (error) {
      console.error('Potrace service error:', error);
      throw new Error(`Potrace vectorization failed: ${error.message}`);
    }
  }

  /**
   * Preprocess image for better Potrace results
   * @param {Buffer} imageBuffer - Original image buffer
   * @returns {Promise<Buffer>} - Processed image buffer
   */
  async preprocessImage(imageBuffer) {
    try {
      // Convert to grayscale and enhance contrast for better tracing
      const processed = await sharp(imageBuffer)
        .grayscale()
        .normalize() // Auto-adjust contrast
        .png()
        .toBuffer();

      return processed;
    } catch (error) {
      console.error('Image preprocessing error:', error);
      // Return original buffer if preprocessing fails
      return imageBuffer;
    }
  }

  /**
   * Vectorize multiple images in batch using Potrace
   * @param {Array} images - Array of {buffer, filename} objects
   * @param {object} options - Potrace options
   * @returns {Promise<Array>} - Array of results
   */
  async vectorizeBatch(images, options = {}) {
    console.log(`Starting batch vectorization with Potrace of ${images.length} images...`);

    const promises = images.map(async (image, index) => {
      try {
        const svg = await this.vectorizeImage(image.buffer, options);
        return {
          success: true,
          index,
          filename: image.filename,
          result: svg
        };
      } catch (error) {
        console.error(`Error processing image ${index} (${image.filename}):`, error);
        return {
          success: false,
          index,
          filename: image.filename,
          error: error.message
        };
      }
    });

    const results = await Promise.all(promises);
    console.log(`Batch vectorization completed. Success: ${results.filter(r => r.success).length}/${images.length}`);

    return results;
  }

  /**
   * Get information about Potrace capabilities
   * @returns {object}
   */
  getInfo() {
    return {
      name: 'Potrace',
      version: '2.1.8',
      description: 'Local fallback vectorization for simple black & white images',
      limitations: [
        'Best for simple line art and logos',
        'Works with black & white or grayscale images',
        'May not preserve color information',
        'Less accurate for complex images'
      ],
      advantages: [
        'Free and offline',
        'No API dependency',
        'Fast processing',
        'Good for simple graphics'
      ]
    };
  }
}

module.exports = new PotraceService();
