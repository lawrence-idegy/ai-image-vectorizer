const Replicate = require('replicate');

// Load .env if not already loaded
require('dotenv').config();

/**
 * AI Image Upscaling Service
 * Uses Real-ESRGAN via Replicate for high-quality upscaling
 */
class UpscaleService {
  constructor() {
    this.replicate = null;
  }

  /**
   * Initialize Replicate client lazily
   */
  _getClient() {
    if (!this.replicate && process.env.REPLICATE_API_TOKEN) {
      this.replicate = new Replicate({
        auth: process.env.REPLICATE_API_TOKEN,
      });
    }
    return this.replicate;
  }

  isAvailable() {
    return !!process.env.REPLICATE_API_TOKEN;
  }

  /**
   * Upscale an image using Real-ESRGAN
   * @param {string} dataUri - Data URI of the image
   * @param {Object} options - Upscaling options
   * @returns {Promise<string>} - Data URI of upscaled image
   */
  async upscale(dataUri, options = {}) {
    const {
      scale = 4,  // 2 or 4
      faceEnhance = false,
    } = options;

    const client = this._getClient();
    if (!client) {
      throw new Error('Upscale service not available - REPLICATE_API_TOKEN not set');
    }

    console.log(`[Upscale] Starting ${scale}x upscale with Real-ESRGAN`);
    const startTime = Date.now();

    try {
      // nightmareai/real-esrgan is fast and produces good results
      const output = await client.run(
        'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',
        {
          input: {
            image: dataUri,
            scale: scale,
            face_enhance: faceEnhance,
          },
        }
      );

      const duration = Date.now() - startTime;
      console.log(`[Upscale] Completed in ${duration}ms`);

      // Output is a URL - fetch the image
      if (typeof output === 'string' && output.startsWith('http')) {
        return output;  // Return URL, caller will fetch if needed
      }

      return output;
    } catch (error) {
      console.error('[Upscale] Failed:', error);
      throw error;
    }
  }

  /**
   * Upscale and return as buffer
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {string} mimeType - Image MIME type
   * @param {Object} options - Upscaling options
   * @returns {Promise<Buffer>} - Upscaled image buffer
   */
  async upscaleToBuffer(imageBuffer, mimeType = 'image/png', options = {}) {
    // Convert buffer to data URI
    const base64 = imageBuffer.toString('base64');
    const dataUri = `data:${mimeType};base64,${base64}`;

    // Upscale
    const resultUrl = await this.upscale(dataUri, options);

    // Fetch the result
    const response = await fetch(resultUrl);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

module.exports = new UpscaleService();
