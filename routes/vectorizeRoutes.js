const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const replicateService = require('../services/replicateService');
const potraceService = require('../services/potraceService');
const qualityValidator = require('../services/qualityValidator');
const backgroundRemovalService = require('../services/backgroundRemovalService');
const svgOptimizer = require('../services/svgOptimizer');
const { validate } = require('../middleware/validation');
const { asyncHandler, ProcessingError, NotFoundError } = require('../utils/errors');
const { apiLogger } = require('../utils/logger');

/**
 * POST /api/vectorize
 * Convert a single image to SVG vector
 */
router.post('/vectorize', asyncHandler(async (req, res) => {
  const upload = req.app.get('upload');
  const cacheService = req.app.get('cache');
  const websocketService = req.app.get('websocket');
  const storageService = req.app.get('storage');

  upload.single('image')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    const startTime = Date.now();

    try {
      const {
        method = 'ai',
        removeBackground = 'false',
        detailLevel = 'medium',
        optimize = 'true',
        optimizeLevel = 'default',
        ...options
      } = req.body;

      let imageBuffer = await fs.readFile(req.file.path);

      // Check cache first
      const cacheKey = cacheService.generateSVGKey(imageBuffer, { method, detailLevel, removeBackground });
      const cachedResult = cacheService.getSVG(cacheKey);

      if (cachedResult) {
        // Clean up uploaded file
        await fs.unlink(req.file.path).catch(() => {});

        return res.json({
          success: true,
          message: 'Image vectorized successfully (cached)',
          cached: true,
          ...cachedResult,
        });
      }

      // Create WebSocket job for progress tracking
      const jobId = websocketService.createJob({ totalItems: 1 });

      // Optional: Remove background before vectorization
      if (removeBackground === 'true' && backgroundRemovalService.isAvailable()) {
        websocketService.updateJobProgress(jobId, { status: 'removing_background' });

        try {
          const dataUri = replicateService.bufferToDataUri(imageBuffer, req.file.mimetype);
          const processedDataUri = await backgroundRemovalService.removeBackground(dataUri);
          const base64Data = processedDataUri.replace(/^data:image\/\w+;base64,/, '');
          imageBuffer = Buffer.from(base64Data, 'base64');
        } catch (bgError) {
          console.warn('Background removal failed:', bgError.message);
        }
      }

      let svgContent;
      let processingMethod;

      websocketService.updateJobProgress(jobId, { status: 'vectorizing' });

      // Preprocess image for better API compatibility
      // Always convert to PNG for Replicate - JPEG can cause issues
      const metadata = await sharp(imageBuffer).metadata();
      const maxDimension = 4096;
      const minDimension = 512; // Replicate models often need minimum size
      let mimeType = 'image/png';

      // Calculate if we need to upscale (too small) or downscale (too large)
      const needsDownscale = metadata.width > maxDimension || metadata.height > maxDimension;
      const needsUpscale = metadata.width < minDimension && metadata.height < minDimension;
      const isJpeg = metadata.format === 'jpeg' || metadata.format === 'jpg';

      // Always preprocess to ensure PNG format and proper dimensions
      let resizeOptions = { fit: 'inside', withoutEnlargement: true };
      let targetWidth = metadata.width;
      let targetHeight = metadata.height;

      if (needsUpscale) {
        // Upscale small images to minimum dimension
        const scale = minDimension / Math.max(metadata.width, metadata.height);
        targetWidth = Math.round(metadata.width * scale);
        targetHeight = Math.round(metadata.height * scale);
        resizeOptions = { width: targetWidth, height: targetHeight, fit: 'fill' };
        console.log(`Upscaling small image: ${metadata.format} ${metadata.width}x${metadata.height} -> ${targetWidth}x${targetHeight} PNG`);
      } else if (needsDownscale) {
        resizeOptions = { width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true };
        console.log(`Downscaling large image: ${metadata.format} ${metadata.width}x${metadata.height} -> max ${maxDimension}px PNG`);
      } else if (isJpeg || metadata.format !== 'png') {
        console.log(`Converting image: ${metadata.format} ${metadata.width}x${metadata.height} -> PNG`);
      }

      // Always convert to PNG
      imageBuffer = await sharp(imageBuffer)
        .resize(resizeOptions)
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png({ quality: 100 })
        .toBuffer();

      if (method === 'ai' || method === 'replicate') {
        try {
          const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);
          svgContent = await replicateService.vectorizeImage(dataUri, options);
          processingMethod = 'Replicate AI (recraft-vectorize)';
        } catch (aiError) {
          console.warn('AI vectorization failed, falling back to Potrace:', aiError.message);
          svgContent = await potraceService.vectorizeImage(imageBuffer, { detailLevel, ...options });
          processingMethod = 'Potrace (fallback from AI error)';
        }
      } else if (method === 'potrace' || method === 'fallback') {
        svgContent = await potraceService.vectorizeImage(imageBuffer, { detailLevel, ...options });
        processingMethod = 'Potrace (local)';
      } else {
        // Default to AI with Potrace fallback
        try {
          const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);
          svgContent = await replicateService.vectorizeImage(dataUri, options);
          processingMethod = 'Replicate AI (recraft-vectorize)';
        } catch (aiError) {
          console.warn('AI vectorization failed, falling back to Potrace:', aiError.message);
          svgContent = await potraceService.vectorizeImage(imageBuffer, { detailLevel, ...options });
          processingMethod = 'Potrace (fallback)';
        }
      }

      // Handle URL responses from Replicate
      let svgToSave = svgContent;
      if (typeof svgContent === 'string' && svgContent.startsWith('http')) {
        const response = await fetch(svgContent);
        svgToSave = await response.text();
      } else if (typeof svgContent === 'object' && svgContent.uri) {
        const response = await fetch(svgContent.uri);
        svgToSave = await response.text();
      } else if (typeof svgContent !== 'string') {
        svgToSave = String(svgContent);
      }

      // Optimize SVG if requested
      let optimizationStats = null;
      if (optimize === 'true') {
        websocketService.updateJobProgress(jobId, { status: 'optimizing' });

        const optimized = svgOptimizer.optimize(svgToSave, {
          level: optimizeLevel,
          preserveColors: true,
        });

        if (optimized.success) {
          svgToSave = optimized.data;
          optimizationStats = optimized.stats;
        }
      }

      // Sanitize SVG for security
      const sanitized = svgOptimizer.sanitize(svgToSave);
      if (sanitized.success) {
        svgToSave = sanitized.data;
      }

      // Save SVG
      const outputFilename = `${path.parse(req.file.filename).name}.svg`;
      const saveResult = await storageService.saveSVG(svgToSave, outputFilename);

      // Validate quality
      const qualityMetrics = qualityValidator.validateSVG(svgToSave);
      const imageMetadata = await sharp(imageBuffer).metadata();
      const sourceComparison = qualityValidator.compareWithSource(imageMetadata, qualityMetrics);
      const recommendations = qualityValidator.getMethodRecommendations(method, qualityMetrics);

      // Analyze SVG
      const svgAnalysis = svgOptimizer.analyze(svgToSave);

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      const duration = Date.now() - startTime;

      // Build result
      const result = {
        success: true,
        message: 'Image vectorized successfully',
        method: processingMethod,
        originalFilename: req.file.originalname,
        outputFilename,
        downloadUrl: `/api/download/${outputFilename}`,
        previewUrl: `/api/preview/${outputFilename}`,
        svgContent: svgToSave,
        jobId,
        processingTime: `${duration}ms`,
        quality: {
          score: qualityMetrics.score,
          rating: qualityMetrics.quality,
          isTrueVector: qualityMetrics.isTrueVector,
          hasEmbeddedRaster: qualityMetrics.hasEmbeddedRaster,
          resolutionIndependent: qualityMetrics.resolutionIndependent,
          complexity: qualityMetrics.complexity,
          pathCount: qualityMetrics.pathCount,
          vectorElements: qualityMetrics.vectorElements,
          fileSize: qualityMetrics.fileSize,
          fileSizeKB: (qualityMetrics.fileSize / 1024).toFixed(2),
          hasColors: qualityMetrics.hasColors,
          colorCount: qualityMetrics.colorCount,
          warnings: qualityMetrics.warnings,
          sourceResolution: sourceComparison.sourceResolution,
          recommendations: [...sourceComparison.recommendations, ...recommendations],
        },
        analysis: svgAnalysis,
        optimization: optimizationStats,
      };

      // Cache the result
      cacheService.setSVG(cacheKey, result);

      // Complete the job
      websocketService.completeJob(jobId, 'completed');

      // Log the operation
      apiLogger.vectorize(req.file.originalname, method, true, duration);

      res.json(result);

    } catch (error) {
      console.error('Vectorization error:', error);

      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      apiLogger.vectorize(req.file?.originalname, req.body.method, false, Date.now() - startTime);

      res.status(500).json({
        success: false,
        error: 'Vectorization failed',
        message: error.message,
      });
    }
  });
}));

/**
 * POST /api/vectorize/batch
 * Convert multiple images to SVG vectors with real-time progress
 */
router.post('/vectorize/batch', asyncHandler(async (req, res) => {
  const upload = req.app.get('upload');
  const websocketService = req.app.get('websocket');
  const storageService = req.app.get('storage');

  upload.array('images', 20)(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No image files provided' });
    }

    const startTime = Date.now();
    const { method = 'ai', optimize = 'true', outputFormat = 'svg', ...options } = req.body;

    // Create WebSocket job
    const jobId = websocketService.createJob({ totalItems: req.files.length });

    // Return immediately with job ID
    res.json({
      success: true,
      message: 'Batch processing started',
      jobId,
      totalFiles: req.files.length,
      method: method === 'ai' ? 'Replicate AI' : 'Potrace',
    });

    // Process in background
    const results = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];

      try {
        websocketService.updateJobProgress(jobId, {
          status: 'processing',
          currentFile: file.originalname,
          currentIndex: i,
        });

        let imageBuffer = await fs.readFile(file.path);

        // Preprocess image: always convert to PNG for better Replicate compatibility
        const metadata = await sharp(imageBuffer).metadata();
        const maxDimension = 4096;
        const minDimension = 512;
        const mimeType = 'image/png';

        // Calculate resize needs
        const needsDownscale = metadata.width > maxDimension || metadata.height > maxDimension;
        const needsUpscale = metadata.width < minDimension && metadata.height < minDimension;

        let resizeOptions = { fit: 'inside', withoutEnlargement: true };

        if (needsUpscale) {
          const scale = minDimension / Math.max(metadata.width, metadata.height);
          const targetWidth = Math.round(metadata.width * scale);
          const targetHeight = Math.round(metadata.height * scale);
          resizeOptions = { width: targetWidth, height: targetHeight, fit: 'fill' };
          console.log(`Batch: Upscaling ${file.originalname}: ${metadata.width}x${metadata.height} -> ${targetWidth}x${targetHeight} PNG`);
        } else if (needsDownscale) {
          resizeOptions = { width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true };
          console.log(`Batch: Downscaling ${file.originalname}: ${metadata.width}x${metadata.height} -> max ${maxDimension}px PNG`);
        } else {
          console.log(`Batch: Converting ${file.originalname}: ${metadata.format} ${metadata.width}x${metadata.height} -> PNG`);
        }

        imageBuffer = await sharp(imageBuffer)
          .resize(resizeOptions)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .png({ quality: 100 })
          .toBuffer();

        let svgContent;

        if (method === 'ai' || method === 'replicate') {
          try {
            const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);
            svgContent = await replicateService.vectorizeImage(dataUri, options);
          } catch (aiError) {
            // Fallback to Potrace if AI fails
            console.warn(`AI vectorization failed for ${file.originalname}, falling back to Potrace:`, aiError.message);
            svgContent = await potraceService.vectorizeImage(imageBuffer, options);
          }
        } else {
          svgContent = await potraceService.vectorizeImage(imageBuffer, options);
        }

        // Handle URL responses
        if (typeof svgContent === 'string' && svgContent.startsWith('http')) {
          const response = await fetch(svgContent);
          svgContent = await response.text();
        } else if (typeof svgContent === 'object' && svgContent.uri) {
          const response = await fetch(svgContent.uri);
          svgContent = await response.text();
        }

        // Optimize if requested
        if (optimize === 'true') {
          const optimized = svgOptimizer.optimize(svgContent);
          if (optimized.success) {
            svgContent = optimized.data;
          }
        }

        // Sanitize
        const sanitized = svgOptimizer.sanitize(svgContent);
        if (sanitized.success) {
          svgContent = sanitized.data;
        }

        // Determine output filename and format
        const baseName = path.parse(file.filename).name;
        let outputFilename;
        let downloadUrl;

        if (outputFormat === 'svg') {
          outputFilename = `${baseName}.svg`;
          await storageService.saveSVG(svgContent, outputFilename);
          downloadUrl = `/api/download/${outputFilename}`;
        } else if (outputFormat === 'png') {
          // Convert SVG to PNG using Sharp
          outputFilename = `${baseName}.png`;
          const svgBuffer = Buffer.from(svgContent);
          const pngBuffer = await sharp(svgBuffer)
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
          // Use storageService to save to the correct output folder
          await storageService.saveFile(pngBuffer, outputFilename, 'output');
          downloadUrl = `/api/download/${outputFilename}`;
        } else if (outputFormat === 'pdf') {
          // Save SVG first, then we'll convert on download
          outputFilename = `${baseName}.svg`;
          await storageService.saveSVG(svgContent, outputFilename);
          // For PDF, we save SVG but provide PDF download URL
          downloadUrl = `/api/download/${baseName}.pdf?source=${outputFilename}`;
        } else {
          outputFilename = `${baseName}.svg`;
          await storageService.saveSVG(svgContent, outputFilename);
          downloadUrl = `/api/download/${outputFilename}`;
        }

        const result = {
          success: true,
          originalFilename: file.originalname,
          outputFilename,
          downloadUrl,
          format: outputFormat,
        };

        results.push(result);
        websocketService.addJobResult(jobId, result);

      } catch (err) {
        const errorResult = {
          success: false,
          originalFilename: file.originalname,
          error: err.message,
        };

        results.push(errorResult);
        websocketService.addJobError(jobId, errorResult);
      }

      // Clean up uploaded file
      await fs.unlink(file.path).catch(() => {});
    }

    const successCount = results.filter(r => r.success).length;
    const duration = Date.now() - startTime;

    // Complete the job
    websocketService.completeJob(jobId, 'completed');

    // Log the operation
    apiLogger.batch(req.files.length, successCount, method, duration);
  });
}));

/**
 * GET /api/download/:filename
 * Download a vectorized file (SVG, PNG, or PDF)
 */
router.get('/download/:filename', asyncHandler(async (req, res) => {
  const storageService = req.app.get('storage');
  const filename = req.params.filename;
  const sourceFile = req.query.source; // For PDF conversion from SVG

  // Validate filename - allow svg, png, pdf extensions
  if (!/^[\w\-\.]+\.(svg|png|pdf)$/i.test(filename)) {
    throw new NotFoundError('File');
  }

  const ext = path.extname(filename).toLowerCase();

  if (ext === '.svg') {
    const result = await storageService.readSVG(filename);
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(result.content);
  } else if (ext === '.png') {
    // Use storageService to read from the correct output folder
    try {
      const result = await storageService.readFile(filename, 'output');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(result.content);
    } catch (err) {
      throw new NotFoundError('File');
    }
  } else if (ext === '.pdf') {
    // Convert SVG to PDF on-the-fly
    const svgFilename = sourceFile || filename.replace('.pdf', '.svg');
    try {
      const result = await storageService.readSVG(svgFilename);
      const svgContent = result.content;

      // Use PDFKit to create PDF from SVG
      const PDFDocument = require('pdfkit');
      const SVGtoPDF = require('svg-to-pdfkit');

      const doc = new PDFDocument({ autoFirstPage: false });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => {
        const pdfBuffer = Buffer.concat(chunks);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
      });

      // Parse SVG to get dimensions
      const widthMatch = svgContent.match(/width="(\d+)"/);
      const heightMatch = svgContent.match(/height="(\d+)"/);
      const width = widthMatch ? parseInt(widthMatch[1]) : 800;
      const height = heightMatch ? parseInt(heightMatch[1]) : 600;

      doc.addPage({ size: [width, height] });
      SVGtoPDF(doc, svgContent, 0, 0, { width, height });
      doc.end();
    } catch (err) {
      console.error('PDF conversion error:', err);
      throw new NotFoundError('File');
    }
  }
}));

/**
 * GET /api/preview/:filename
 * Preview a vectorized SVG file (inline display)
 */
router.get('/preview/:filename', asyncHandler(async (req, res) => {
  const storageService = req.app.get('storage');
  const filename = req.params.filename;

  // Validate filename
  if (!/^[\w\-\.]+\.svg$/i.test(filename)) {
    throw new NotFoundError('File');
  }

  const result = await storageService.readSVG(filename);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(result.content);
}));

/**
 * GET /api/job/:jobId
 * Get job status
 */
router.get('/job/:jobId', (req, res) => {
  const websocketService = req.app.get('websocket');
  const job = websocketService.getJob(req.params.jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Job not found',
      message: 'The job may have expired or does not exist',
    });
  }

  res.json({
    success: true,
    job,
  });
});

/**
 * GET /api/methods
 * Get available vectorization methods and their info
 */
router.get('/methods', asyncHandler(async (req, res) => {
  const cacheService = req.app.get('cache');

  // Check cache
  const cached = cacheService.getAPI('methods');
  if (cached) {
    return res.json(cached);
  }

  const replicateHealthy = await replicateService.checkHealth();
  const potraceInfo = potraceService.getInfo();

  const result = {
    methods: [
      {
        id: 'ai',
        name: 'Replicate AI',
        model: 'recraft-ai/recraft-vectorize',
        description: 'Professional AI-powered vectorization for complex images',
        available: replicateHealthy,
        recommended: true,
        features: [
          'Handles colored images',
          'Professional-grade quality',
          'Best for logos, illustrations, and complex graphics',
          'Compatible with Adobe Illustrator, Figma, Sketch',
        ],
      },
      {
        id: 'potrace',
        name: 'Potrace',
        ...potraceInfo,
        available: true,
        recommended: false,
      },
    ],
    features: {
      optimization: true,
      backgroundRemoval: replicateHealthy,
      batchProcessing: true,
      realTimeProgress: true,
    },
  };

  // Cache for 5 minutes
  cacheService.setAPI('methods', result, 300);

  res.json(result);
}));

/**
 * POST /api/remove-background
 * Remove background from an image using AI
 */
router.post('/remove-background', asyncHandler(async (req, res) => {
  const upload = req.app.get('upload');

  upload.single('image')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    try {
      // Check if background removal is available
      if (!backgroundRemovalService.isAvailable()) {
        await fs.unlink(req.file.path).catch(() => {});
        return res.status(503).json({
          success: false,
          error: 'Background removal service is not available',
          message: 'REPLICATE_API_TOKEN is not configured',
        });
      }

      const imageBuffer = await fs.readFile(req.file.path);
      const dataUri = replicateService.bufferToDataUri(imageBuffer, req.file.mimetype);

      console.log('Starting background removal...');
      const processedDataUri = await backgroundRemovalService.removeBackground(dataUri);
      console.log('Background removal completed');

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        message: 'Background removed successfully',
        image: processedDataUri,
      });

    } catch (error) {
      console.error('Background removal error:', error);

      if (req.file) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Background removal failed',
        message: error.message,
      });
    }
  });
}));

/**
 * POST /api/optimize
 * Optimize an existing SVG
 */
router.post('/optimize', asyncHandler(async (req, res) => {
  const { svgContent, level = 'default', preserveColors = true } = req.body;

  if (!svgContent) {
    return res.status(400).json({
      success: false,
      error: 'SVG content is required',
    });
  }

  const result = svgOptimizer.optimize(svgContent, { level, preserveColors });
  const analysis = svgOptimizer.analyze(result.data);

  res.json({
    success: result.success,
    data: result.data,
    stats: result.stats,
    analysis,
    error: result.error,
  });
}));

/**
 * POST /api/analyze
 * Analyze an SVG
 */
router.post('/analyze', asyncHandler(async (req, res) => {
  const { svgContent } = req.body;

  if (!svgContent) {
    return res.status(400).json({
      success: false,
      error: 'SVG content is required',
    });
  }

  const analysis = svgOptimizer.analyze(svgContent);
  const quality = qualityValidator.validateSVG(svgContent);

  res.json({
    success: true,
    analysis,
    quality,
  });
}));

module.exports = router;
