const sharp = require('sharp');

/**
 * Image preprocessing service for improving vectorization quality
 * Reduces anti-aliasing artifacts and cleans up colors before tracing
 */
class ImagePreprocessor {
  /**
   * Quantize colors to reduce anti-aliasing artifacts
   * Uses palette-based color reduction to create clean color blocks
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {Object} options - Processing options
   * @returns {Promise<Buffer>} - Processed image buffer
   */
  async quantizeColors(imageBuffer, options = {}) {
    const {
      colors = 32,           // Number of colors in palette (lower = cleaner, but may lose detail)
      dither = 0,            // 0 = no dithering (cleaner for vectors), 1 = full dithering
    } = options;

    // Sharp uses libvips which supports PNG8 (palette mode) for color quantization
    return await sharp(imageBuffer)
      .png({
        colours: colors,     // UK spelling for sharp
        palette: true,       // Enable palette mode (quantization)
        dither: dither,      // Disable dithering for cleaner blocks
      })
      .toBuffer();
  }

  /**
   * Median filter to reduce noise while preserving edges
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {number} size - Filter size (3, 5, or 7)
   * @returns {Promise<Buffer>} - Filtered image buffer
   */
  async medianFilter(imageBuffer, size = 3) {
    return await sharp(imageBuffer)
      .median(size)
      .toBuffer();
  }

  /**
   * Threshold image to create clean binary edges for specific color channels
   * Useful for text where we want sharp edges
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {number} threshold - Threshold value (0-255)
   * @returns {Promise<Buffer>} - Thresholded image buffer
   */
  async threshold(imageBuffer, threshold = 128) {
    return await sharp(imageBuffer)
      .threshold(threshold)
      .toBuffer();
  }

  /**
   * Sharpen image to enhance edges before tracing
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {Object} options - Sharpening options
   * @returns {Promise<Buffer>} - Sharpened image buffer
   */
  async sharpen(imageBuffer, options = {}) {
    const {
      sigma = 1.5,        // Gaussian sigma
      m1 = 1.0,           // Flat areas sharpening
      m2 = 2.0,           // Edge areas sharpening
    } = options;

    return await sharp(imageBuffer)
      .sharpen({ sigma, m1, m2 })
      .toBuffer();
  }

  /**
   * Upscale image for better tracing quality
   * Uses Lanczos3 interpolation for sharp edges
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {number} scale - Scale factor (e.g., 2, 3, 4)
   * @returns {Promise<Buffer>} - Upscaled image buffer
   */
  async upscale(imageBuffer, scale = 2) {
    const metadata = await sharp(imageBuffer).metadata();
    const targetWidth = Math.round(metadata.width * scale);
    const targetHeight = Math.round(metadata.height * scale);

    return await sharp(imageBuffer)
      .resize(targetWidth, targetHeight, {
        kernel: 'lanczos3',  // Best quality for upscaling
        fit: 'fill',
      })
      .toBuffer();
  }

  /**
   * Full preprocessing pipeline optimized for logo vectorization
   * Combines multiple steps to produce clean images for tracing
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {Object} options - Pipeline options
   * @returns {Promise<Buffer>} - Processed image buffer
   */
  async preprocessForVectorization(imageBuffer, options = {}) {
    const {
      // Upscaling
      upscale: shouldUpscale = true,
      upscaleMinDimension = 1024,  // Minimum dimension before upscaling
      maxUpscaleScale = 4,

      // Color quantization
      quantize: shouldQuantize = true,
      colors = 32,
      dither = 0,

      // Noise reduction
      denoise: shouldDenoise = false,
      denoiseSize = 3,

      // Sharpening
      sharpen: shouldSharpen = true,
      sharpenSigma = 1.0,

      // Flatten transparency
      flatten: shouldFlatten = true,
      backgroundColor = { r: 255, g: 255, b: 255 },
    } = options;

    let processed = imageBuffer;
    const metadata = await sharp(imageBuffer).metadata();

    console.log(`[Preprocessor] Starting: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    // Step 1: Upscale small images for better tracing
    if (shouldUpscale) {
      const minDim = Math.min(metadata.width, metadata.height);
      if (minDim < upscaleMinDimension) {
        const scale = Math.min(upscaleMinDimension / minDim, maxUpscaleScale);
        if (scale > 1.5) {  // Only upscale if meaningful
          processed = await this.upscale(processed, scale);
          const newMeta = await sharp(processed).metadata();
          console.log(`[Preprocessor] Upscaled ${scale.toFixed(1)}x to ${newMeta.width}x${newMeta.height}`);
        }
      }
    }

    // Step 2: Flatten transparency to white background
    if (shouldFlatten) {
      processed = await sharp(processed)
        .flatten({ background: backgroundColor })
        .toBuffer();
    }

    // Step 3: Denoise to reduce anti-aliasing artifacts
    if (shouldDenoise) {
      processed = await this.medianFilter(processed, denoiseSize);
      console.log(`[Preprocessor] Applied median filter (${denoiseSize}px)`);
    }

    // Step 4: Quantize colors to create clean color blocks
    if (shouldQuantize) {
      processed = await this.quantizeColors(processed, { colors, dither });
      console.log(`[Preprocessor] Quantized to ${colors} colors`);
    }

    // Step 5: Sharpen edges for cleaner tracing
    if (shouldSharpen) {
      processed = await this.sharpen(processed, { sigma: sharpenSigma });
      console.log(`[Preprocessor] Sharpened (sigma: ${sharpenSigma})`);
    }

    // Ensure PNG format for VTracer
    processed = await sharp(processed)
      .png()
      .toBuffer();

    const finalMeta = await sharp(processed).metadata();
    console.log(`[Preprocessor] Complete: ${finalMeta.width}x${finalMeta.height}`);

    return processed;
  }

  /**
   * Preset: Logo mode - optimized for text and simple graphics
   * Focuses on color quantization without upscaling for balanced output
   */
  async preprocessLogo(imageBuffer) {
    return this.preprocessForVectorization(imageBuffer, {
      upscale: false,             // No upscaling - keeps paths manageable
      quantize: true,
      colors: 16,                 // Few colors for clean logos
      dither: 0,
      denoise: false,             // Don't blur - preserve edges
      sharpen: false,
    });
  }

  /**
   * Preset: Detailed mode - for complex images with many colors
   */
  async preprocessDetailed(imageBuffer) {
    return this.preprocessForVectorization(imageBuffer, {
      upscale: true,
      upscaleMinDimension: 1500,
      maxUpscaleScale: 2,
      quantize: true,
      colors: 64,         // More colors for detail
      dither: 0.3,        // Light dithering for gradients
      denoise: true,
      denoiseSize: 3,
      sharpen: true,
      sharpenSigma: 1.2,
    });
  }

  /**
   * Preset: Poster mode - bold colors with minimal detail
   */
  async preprocessPoster(imageBuffer) {
    return this.preprocessForVectorization(imageBuffer, {
      upscale: true,
      upscaleMinDimension: 800,
      maxUpscaleScale: 2,
      quantize: true,
      colors: 16,         // Very few colors
      dither: 0,
      denoise: true,
      denoiseSize: 5,     // More noise reduction
      sharpen: true,
      sharpenSigma: 0.5,
    });
  }

  /**
   * Preset: Text mode - optimized specifically for text/typography
   * No upscaling to keep paths clean, just color quantization
   */
  async preprocessText(imageBuffer) {
    return this.preprocessForVectorization(imageBuffer, {
      upscale: false,       // No upscaling - keeps paths manageable
      quantize: true,
      colors: 8,            // Very few colors for text
      dither: 0,            // No dithering
      denoise: false,       // Don't blur text
      sharpen: false,
    });
  }
}


module.exports = new ImagePreprocessor();
