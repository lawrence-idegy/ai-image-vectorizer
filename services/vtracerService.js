const { vectorize, ColorMode, Hierarchical, PathSimplifyMode } = require('@neplex/vectorizer');
const sharp = require('sharp');
const imagePreprocessor = require('./imagePreprocessor');
const upscaleService = require('./upscaleService');

/**
 * VTracer-based vectorization service
 * Uses the VTracer library (native Node.js binding) for high-quality vectorization
 * Similar approach to Vectorizer.ai
 */
class VTracerService {
  constructor() {
    this.available = true;

    // Quality presets - optimized for clean output with manageable file sizes
    this.presets = {
      // Best for logos with clean lines - balanced quality and file size
      logo: {
        colorMode: ColorMode.Color,
        colorPrecision: 5,        // Fewer colors = fewer paths
        filterSpeckle: 16,        // Aggressive noise removal
        spliceThreshold: 45,      // Angle for splicing splines
        cornerThreshold: 170,     // Very high = ultra smooth curves
        hierarchical: Hierarchical.Stacked,  // Stacked shapes (smaller file)
        mode: PathSimplifyMode.Spline,       // Smooth curves
        layerDifference: 32,      // Higher = fewer color layers = much cleaner
        lengthThreshold: 10,      // Higher = simpler paths
        maxIterations: 10,        // Good quality without overdoing it
        pathPrecision: 2,         // Lower precision = smaller file
      },
      // Higher detail but still manageable
      detailed: {
        colorMode: ColorMode.Color,
        colorPrecision: 6,        // More color precision
        filterSpeckle: 8,         // Filter noise
        spliceThreshold: 45,
        cornerThreshold: 120,     // Smooth curves
        hierarchical: Hierarchical.Stacked,
        mode: PathSimplifyMode.Spline,
        layerDifference: 16,      // Moderate color layers
        lengthThreshold: 6,
        maxIterations: 10,
        pathPrecision: 3,
      },
      // Poster-style with fewer colors
      poster: {
        colorMode: ColorMode.Color,
        colorPrecision: 4,        // Reduced colors
        filterSpeckle: 8,         // Remove more artifacts
        spliceThreshold: 60,
        cornerThreshold: 90,      // Fewer corners
        hierarchical: Hierarchical.Stacked,
        mode: PathSimplifyMode.Spline,
        layerDifference: 32,      // Fewer layers
        lengthThreshold: 6,
        maxIterations: 5,
        pathPrecision: 2,
      },
      // Black and white
      bw: {
        colorMode: ColorMode.BW,
        filterSpeckle: 4,
        spliceThreshold: 45,
        cornerThreshold: 60,
        hierarchical: Hierarchical.Stacked,
        mode: PathSimplifyMode.Spline,
        lengthThreshold: 4,
        maxIterations: 10,
        pathPrecision: 3,
      },
      // Text/Typography - ultra smooth curves for clean text
      text: {
        colorMode: ColorMode.Color,
        colorPrecision: 4,        // Very few colors
        filterSpeckle: 2,         // Keep text details
        spliceThreshold: 30,      // Lower = smoother splices
        cornerThreshold: 170,     // Very high = ultra smooth curves
        hierarchical: Hierarchical.Stacked,
        mode: PathSimplifyMode.Spline,
        layerDifference: 12,      // Moderate grouping
        lengthThreshold: 3,
        maxIterations: 15,        // More iterations for refinement
        pathPrecision: 4,         // Higher precision for text curves
      },
    };
  }

  /**
   * Check if service is available
   */
  isAvailable() {
    return this.available;
  }

  /**
   * Vectorize an image buffer
   * @param {Buffer} imageBuffer - Input image buffer (PNG, JPG, etc.)
   * @param {Object} options - Vectorization options
   * @returns {Promise<string>} - SVG content
   */
  async vectorizeImage(imageBuffer, options = {}) {
    const {
      preset = 'logo',
      // Individual overrides
      colorPrecision,
      filterSpeckle,
      cornerThreshold,
      layerDifference,
      maxColors,
      removeBackground = false,
      // Preprocessing options
      preprocess = true,  // Enable preprocessing by default
      preprocessColors = null,  // Override color count for quantization
      // AI upscaling options
      aiUpscale = true,  // Use AI upscaling for better quality
      aiUpscaleMinDimension = 400,  // Only upscale very small images (under 400px)
      aiUpscaleMaxDimension = 1200,  // Cap upscaled size to prevent huge SVGs
    } = options;

    console.log(`[VTracer] Starting vectorization with preset: ${preset}, preprocess: ${preprocess}, aiUpscale: ${aiUpscale}`);

    // Get preset config
    const config = { ...this.presets[preset] || this.presets.logo };

    // Apply individual overrides
    if (colorPrecision !== undefined) config.colorPrecision = colorPrecision;
    if (filterSpeckle !== undefined) config.filterSpeckle = filterSpeckle;
    if (cornerThreshold !== undefined) config.cornerThreshold = cornerThreshold;
    if (layerDifference !== undefined) config.layerDifference = layerDifference;

    // Get metadata
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`[VTracer] Input: ${metadata.width}x${metadata.height}, format: ${metadata.format}`);

    let processedBuffer = imageBuffer;

    // Step 1: AI Upscaling ONLY for very small images
    const minDim = Math.min(metadata.width, metadata.height);
    const maxDim = Math.max(metadata.width, metadata.height);

    // Only upscale if image is very small AND won't exceed max dimension after 2x scale
    const shouldUpscale = aiUpscale &&
                          upscaleService.isAvailable() &&
                          minDim < aiUpscaleMinDimension &&
                          maxDim * 2 <= aiUpscaleMaxDimension;

    if (shouldUpscale) {
      try {
        // Use 2x scale instead of 4x to keep output manageable
        console.log(`[VTracer] Image is small (${minDim}px), applying 2x AI upscaling...`);
        processedBuffer = await upscaleService.upscaleToBuffer(imageBuffer, 'image/png', { scale: 2 });
        const upscaledMeta = await sharp(processedBuffer).metadata();
        console.log(`[VTracer] AI upscaled to ${upscaledMeta.width}x${upscaledMeta.height}`);
      } catch (upscaleError) {
        console.warn('[VTracer] AI upscaling failed, continuing with original:', upscaleError.message);
        processedBuffer = imageBuffer;
      }
    } else if (aiUpscale && minDim < aiUpscaleMinDimension) {
      console.log(`[VTracer] Skipping AI upscale - image would exceed max dimension (${maxDim * 2}px > ${aiUpscaleMaxDimension}px)`);
    }

    // Step 2: Apply preprocessing pipeline to clean up anti-aliasing artifacts
    // Skip upscaling in preprocessing if AI already upscaled
    if (preprocess) {
      try {
        // Simple preprocessing: just quantize colors and clean up
        // Skip upscaling since AI upscale already handled it (or we don't want huge output)
        const preprocessOptions = {
          upscale: false,  // Never upscale in preprocessing - keep output manageable
          quantize: true,
          colors: preset === 'detailed' ? 32 : (preset === 'text' ? 8 : 16),
          dither: 0,
          denoise: preset === 'poster',
          denoiseSize: 3,
          sharpen: false,  // Don't sharpen - can create artifacts
        };

        processedBuffer = await imagePreprocessor.preprocessForVectorization(processedBuffer, preprocessOptions);

        // Override quantization colors if specified
        if (preprocessColors) {
          processedBuffer = await imagePreprocessor.quantizeColors(processedBuffer, {
            colors: preprocessColors,
            dither: 0,
          });
        }
      } catch (preprocessError) {
        console.warn('[VTracer] Preprocessing failed, using original image:', preprocessError.message);
        processedBuffer = imageBuffer;
      }
    }

    // Ensure we have a PNG buffer (VTracer works best with PNG)
    if (!preprocess) {
      if (metadata.format !== 'png') {
        processedBuffer = await sharp(processedBuffer)
          .png()
          .toBuffer();
      }

      // Optionally ensure image has white background (helps with some logos)
      if (removeBackground === false && metadata.hasAlpha) {
        // Flatten transparency to white for cleaner tracing
        processedBuffer = await sharp(processedBuffer)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .png()
          .toBuffer();
      }
    }

    const startTime = Date.now();

    try {
      // Call VTracer
      const svg = await vectorize(processedBuffer, config);

      const duration = Date.now() - startTime;
      console.log(`[VTracer] Completed in ${duration}ms, output: ${(svg.length / 1024).toFixed(1)}KB`);

      return svg;
    } catch (error) {
      console.error('[VTracer] Vectorization failed:', error);
      throw new Error(`VTracer vectorization failed: ${error.message}`);
    }
  }

  /**
   * Vectorize with automatic preset detection
   * Analyzes the image to choose the best preset
   */
  async vectorizeAuto(imageBuffer, options = {}) {
    const metadata = await sharp(imageBuffer).metadata();
    const stats = await sharp(imageBuffer).stats();

    // Simple heuristics for preset selection
    let preset = 'logo';

    // Check if image is mostly black and white
    const isGrayscale = stats.channels.length === 1 ||
      (stats.channels[0].mean === stats.channels[1]?.mean &&
       stats.channels[1]?.mean === stats.channels[2]?.mean);

    if (isGrayscale) {
      preset = 'bw';
    } else {
      // Check color complexity
      const colorVariance = stats.channels.reduce((sum, ch) => sum + ch.stdev, 0) / stats.channels.length;

      if (colorVariance < 30) {
        // Low variance = simple colors = logo
        preset = 'logo';
      } else if (colorVariance < 60) {
        // Medium variance = poster style
        preset = 'poster';
      } else {
        // High variance = detailed
        preset = 'detailed';
      }
    }

    console.log(`[VTracer] Auto-detected preset: ${preset}`);
    return this.vectorizeImage(imageBuffer, { ...options, preset });
  }

  /**
   * Get available presets
   */
  getPresets() {
    return Object.keys(this.presets).map(id => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      description: this.getPresetDescription(id),
    }));
  }

  getPresetDescription(preset) {
    const descriptions = {
      logo: 'Best for logos, icons, and simple graphics with clean lines',
      detailed: 'High detail for complex images with many colors',
      poster: 'Poster-style with reduced colors and simplified shapes',
      bw: 'Black and white tracing for silhouettes and line art',
    };
    return descriptions[preset] || '';
  }
}

module.exports = new VTracerService();
