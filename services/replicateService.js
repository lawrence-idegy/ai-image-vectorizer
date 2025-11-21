const Replicate = require('replicate');

class ReplicateService {
  constructor() {
    if (!process.env.REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN is not set in environment variables');
    }

    this.replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    // Recraft Vectorize model
    this.model = 'recraft-ai/recraft-vectorize';
  }

  /**
   * Convert an image to SVG vector using Replicate AI
   * @param {string} imageUrl - URL or base64 data URI of the image
   * @param {object} options - Optional parameters
   * @returns {Promise<string>} - SVG content as string
   */
  async vectorizeImage(imageUrl, options = {}) {
    try {
      console.log('Starting vectorization with Replicate AI...');

      const input = {
        image: imageUrl,
        ...options
      };

      const output = await this.replicate.run(this.model, { input });

      console.log('Vectorization completed successfully');
      return output;
    } catch (error) {
      console.error('Replicate API error:', error);
      throw new Error(`Replicate vectorization failed: ${error.message}`);
    }
  }

  /**
   * Convert an image file to base64 data URI
   * @param {Buffer} buffer - Image buffer
   * @param {string} mimetype - Image MIME type
   * @returns {string} - Data URI
   */
  bufferToDataUri(buffer, mimetype) {
    const base64 = buffer.toString('base64');
    return `data:${mimetype};base64,${base64}`;
  }

  /**
   * Vectorize multiple images in batch
   * @param {Array} images - Array of {buffer, mimetype} objects
   * @param {object} options - Optional parameters
   * @returns {Promise<Array>} - Array of results
   */
  async vectorizeBatch(images, options = {}) {
    console.log(`Starting batch vectorization of ${images.length} images...`);

    const promises = images.map(async (image, index) => {
      try {
        const dataUri = this.bufferToDataUri(image.buffer, image.mimetype);
        const result = await this.vectorizeImage(dataUri, options);
        return {
          success: true,
          index,
          filename: image.filename,
          result
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
   * Check if the Replicate API is accessible
   * @returns {Promise<boolean>}
   */
  async checkHealth() {
    try {
      // Just check if we can create a client - actual API calls cost money
      return !!this.replicate && !!process.env.REPLICATE_API_TOKEN;
    } catch (error) {
      console.error('Replicate health check failed:', error);
      return false;
    }
  }
}

module.exports = new ReplicateService();
