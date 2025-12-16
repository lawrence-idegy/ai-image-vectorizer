/**
 * Background Removal Service
 * Uses Replicate API to remove backgrounds before vectorization
 * Supports multiple models with different quality/speed tradeoffs
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

    // Available models with different quality/speed tradeoffs
    this.models = {
      // Fast - Quick processing, good for simple backgrounds
      fast: {
        id: 'lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1',
        name: 'Fast',
        description: 'Quick processing, best for simple backgrounds',
        speed: '~2s',
        quality: 'Good'
      },
      // Balanced - Good balance of speed and quality with threshold tuning
      balanced: {
        id: '851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc',
        name: 'Balanced',
        description: 'Good balance of speed and quality',
        speed: '~3s',
        quality: 'Very Good',
        supportsThreshold: true
      },
      // High Quality - Best edge preservation for fine details (hair, spikes, fur)
      quality: {
        id: 'men1scus/birefnet:f74986db0355b58403ed20963af156525e2891ea3c2d499bfbfb2a28cd87c5d7',
        name: 'High Quality',
        description: 'Best for fine details like hair, fur, and spikes',
        speed: '~40s',
        quality: 'Excellent'
      }
    };

    // Default model
    this.defaultModel = 'balanced';
  }

  /**
   * Get available models info for frontend
   * @returns {Object} - Model information
   */
  getAvailableModels() {
    return Object.entries(this.models).map(([key, model]) => ({
      id: key,
      name: model.name,
      description: model.description,
      speed: model.speed,
      quality: model.quality
    }));
  }

  /**
   * Remove background from image
   * @param {string} imageDataUri - Data URI of the image
   * @param {Object} options - Options for background removal
   * @param {string} options.quality - Quality preset: 'fast', 'balanced', or 'quality'
   * @param {number} options.threshold - Threshold for balanced model (0.0-1.0)
   * @returns {Promise<string>} - Data URI of image with background removed
   */
  async removeBackground(imageDataUri, options = {}) {
    const quality = options.quality || this.defaultModel;
    const modelConfig = this.models[quality] || this.models[this.defaultModel];

    try {
      console.log(`Removing background with ${modelConfig.name} model (${quality})...`);

      let input = { image: imageDataUri };

      // Add model-specific parameters
      if (quality === 'balanced' && options.threshold !== undefined) {
        input.threshold = options.threshold;
      }

      const output = await this.replicate.run(modelConfig.id, { input });

      console.log('Background removed successfully');

      // Handle different output formats from different models
      let resultUrl = output;

      // BiRefNet returns an object with the image URL
      if (typeof output === 'object' && output !== null) {
        if (Array.isArray(output) && output.length > 0) {
          resultUrl = output[0];
        } else if (output.image) {
          resultUrl = output.image;
        } else if (output.output) {
          resultUrl = output.output;
        }
      }

      // Convert URL to data URI
      if (typeof resultUrl === 'string' && resultUrl.startsWith('http')) {
        const response = await fetch(resultUrl);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64 = buffer.toString('base64');
        return `data:image/png;base64,${base64}`;
      }

      // Already a data URI or base64
      if (typeof resultUrl === 'string') {
        if (resultUrl.startsWith('data:')) {
          return resultUrl;
        }
        return `data:image/png;base64,${resultUrl}`;
      }

      throw new Error('Unexpected output format from model');

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
