/**
 * Background Removal Service
 * Uses Replicate API to remove backgrounds before vectorization
 */

const Replicate = require('replicate');

class BackgroundRemovalService {
  constructor() {
    if (!process.env.REPLICATE_API_TOKEN) {
      console.warn('REPLICATE_API_TOKEN not set - background removal will not be available');
    }

    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Using lucataco's remove-bg model - better quality and edge detection
    this.model = 'lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1';
  }

  /**
   * Remove background from image
   * @param {string} imageDataUri - Data URI of the image
   * @returns {Promise<string>} - Data URI of image with background removed
   */
  async removeBackground(imageDataUri) {
    try {
      console.log('Removing background with Replicate AI (remove-bg model)...');

      const input = {
        image: imageDataUri
      };

      const output = await this.replicate.run(this.model, { input });

      console.log('Background removed successfully');

      // Output is a URL to the processed image
      if (typeof output === 'string') {
        // Fetch the image and convert to data URI
        const response = await fetch(output);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      }

      return output;

    } catch (error) {
      console.error('Background removal error:', error);
      throw new Error(`Background removal failed: ${error.message}`);
    }
  }

  /**
   * Check if background removal is available
   * @returns {boolean}
   */
  isAvailable() {
    return !!process.env.REPLICATE_API_TOKEN && !!this.replicate;
  }
}

module.exports = new BackgroundRemovalService();
