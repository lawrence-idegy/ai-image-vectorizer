const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const replicateService = require('../services/replicateService');
const qualityValidator = require('../services/qualityValidator');
const backgroundRemovalService = require('../services/backgroundRemovalService');
const svgOptimizer = require('../services/svgOptimizer');
const pdfConverter = require('../services/pdfConverter');
const { validate } = require('../middleware/validation');
const { asyncHandler, ProcessingError, NotFoundError } = require('../utils/errors');
const { requireAuth } = require('../services/authService');
const { apiLogger } = require('../utils/logger');

/**
 * POST /api/debug-upload
 * Debug endpoint to test file uploads
 */
router.post('/debug-upload', (req, res) => {
  const upload = req.app.get('upload');
  console.log('[debug-upload] Request received');
  console.log('[debug-upload] Headers:', JSON.stringify(req.headers, null, 2));

  upload.single('image')(req, res, (error) => {
    console.log('[debug-upload] Upload callback');
    console.log('[debug-upload] Error:', error);
    console.log('[debug-upload] File:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      encoding: req.file.encoding,
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer,
      bufferLength: req.file.buffer?.length
    } : 'none');
    console.log('[debug-upload] Body:', req.body);

    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      message: 'Debug upload received',
      hasFile: !!req.file,
      file: req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        hasBuffer: !!req.file.buffer
      } : null,
      body: req.body
    });
  });
});

/**
 * POST /api/vectorize
 * Convert a single image to SVG vector
 * Requires authentication with @idegy.com email
 */
router.post('/vectorize', requireAuth, asyncHandler(async (req, res) => {
  const upload = req.app.get('upload');
  const cacheService = req.app.get('cache');
  const websocketService = req.app.get('websocket');
  const storageService = req.app.get('storage');
  console.log('[vectorize] Request received, user:', req.user?.email);

  upload.single('image')(req, res, async (error) => {
    console.log('[vectorize] Upload callback, error:', error, 'file:', req.file ? 'present' : 'missing');

    if (error) {
      console.error('[vectorize] Upload error:', error);
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!req.file) {
      console.error('[vectorize] No file in request');
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    console.log('[vectorize] File received:', req.file.originalname, 'size:', req.file.size, 'buffer:', req.file.buffer ? 'present' : 'missing');

    const startTime = Date.now();

    try {
      const {
        method = 'ai',
        removeBackground = 'false',
        detailLevel = 'medium',
        optimize = 'true',
        optimizeLevel = 'default',
        invert = 'false',
        ...options
      } = req.body;

      // Get image buffer - handle both memory storage (Vercel) and disk storage (local)
      let imageBuffer = req.file.buffer || await fs.readFile(req.file.path);

      // Convert PDF to image if needed
      if (req.file.mimetype === 'application/pdf' || pdfConverter.isPdf(imageBuffer)) {
        console.log('Converting PDF to image for vectorization...');
        try {
          const pdfInfo = await pdfConverter.getPdfInfo(imageBuffer);
          console.log(`PDF has ${pdfInfo.numPages} page(s), dimensions: ${pdfInfo.width}x${pdfInfo.height}`);

          // Convert first page to PNG (scale 2x for better quality)
          imageBuffer = await pdfConverter.pdfToImage(imageBuffer, { page: 1, scale: 2 });
          console.log('PDF converted to PNG successfully');
        } catch (pdfError) {
          console.error('PDF conversion failed:', pdfError);
          throw new ProcessingError(pdfError.message);
        }
      }

      // Check cache first
      const cacheKey = cacheService.generateSVGKey(imageBuffer, { method, detailLevel, removeBackground });
      const cachedResult = cacheService.getSVG(cacheKey);

      if (cachedResult) {
        // Clean up uploaded file (only if using disk storage)
        if (req.file.path) await fs.unlink(req.file.path).catch(() => {});

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

      // Vectorize using Replicate AI
      const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);
      svgContent = await replicateService.vectorizeImage(dataUri, options);
      processingMethod = 'Replicate AI (recraft-vectorize)';

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

      // Save SVG - generate filename from originalname if filename not available (memory storage)
      const baseName = req.file.filename
        ? path.parse(req.file.filename).name
        : `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
      const outputFilename = `${baseName}.svg`;

      // On Vercel/serverless, skip disk storage (read-only filesystem)
      // SVG content is returned directly in the response
      const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      if (!isServerless) {
        await storageService.saveSVG(svgToSave, outputFilename);
      }

      // Validate quality
      const qualityMetrics = qualityValidator.validateSVG(svgToSave);
      const imageMetadata = await sharp(imageBuffer).metadata();
      const sourceComparison = qualityValidator.compareWithSource(imageMetadata, qualityMetrics);
      const recommendations = qualityValidator.getMethodRecommendations(method, qualityMetrics);

      // Analyze SVG
      const svgAnalysis = svgOptimizer.analyze(svgToSave);

      // Clean up uploaded file (only if using disk storage)
      if (req.file.path) await fs.unlink(req.file.path).catch(() => {});

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
      console.error('[vectorize] ERROR:', error.message);
      console.error('[vectorize] Stack:', error.stack);

      if (req.file?.path) {
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
 * Requires authentication with @idegy.com email
 */
router.post('/vectorize/batch', requireAuth, asyncHandler(async (req, res) => {
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
      method: 'Replicate AI',
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

        // Get image buffer - handle both memory storage (Vercel) and disk storage (local)
        let imageBuffer = file.buffer || await fs.readFile(file.path);

        // Convert PDF to image if needed
        if (file.mimetype === 'application/pdf' || pdfConverter.isPdf(imageBuffer)) {
          console.log(`Batch: Converting PDF ${file.originalname} to image...`);
          imageBuffer = await pdfConverter.pdfToImage(imageBuffer, { page: 1, scale: 2 });
        }

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

        // Vectorize using Replicate AI
        const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);
        svgContent = await replicateService.vectorizeImage(dataUri, options);

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

        // Determine output filename and format - generate if not available (memory storage)
        const baseName = file.filename
          ? path.parse(file.filename).name
          : `${Date.now()}-${Math.round(Math.random() * 1E9)}-${i}`;
        let outputFilename;
        let downloadUrl;

        // On Vercel/serverless, skip disk storage (read-only filesystem)
        const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

        if (outputFormat === 'svg') {
          outputFilename = `${baseName}.svg`;
          if (!isServerless) {
            await storageService.saveSVG(svgContent, outputFilename);
          }
          downloadUrl = `/api/download/${outputFilename}`;
        } else if (outputFormat === 'png') {
          // Convert SVG to PNG using Sharp
          outputFilename = `${baseName}.png`;
          const svgBuffer = Buffer.from(svgContent);
          const pngBuffer = await sharp(svgBuffer)
            .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
            .png()
            .toBuffer();
          if (!isServerless) {
            await storageService.saveFile(pngBuffer, outputFilename, 'output');
          }
          downloadUrl = `/api/download/${outputFilename}`;
        } else if (outputFormat === 'pdf') {
          outputFilename = `${baseName}.svg`;
          if (!isServerless) {
            await storageService.saveSVG(svgContent, outputFilename);
          }
          downloadUrl = `/api/download/${baseName}.pdf?source=${outputFilename}`;
        } else {
          outputFilename = `${baseName}.svg`;
          if (!isServerless) {
            await storageService.saveSVG(svgContent, outputFilename);
          }
          downloadUrl = `/api/download/${outputFilename}`;
        }

        const result = {
          success: true,
          originalFilename: file.originalname,
          outputFilename,
          downloadUrl,
          svgContent: outputFormat === 'svg' ? svgContent : undefined,
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

      // Clean up uploaded file (only if using disk storage)
      if (file.path) await fs.unlink(file.path).catch(() => {});
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
 * GET /api/background-removal-models
 * Get available background removal models
 */
router.get('/background-removal-models', asyncHandler(async (req, res) => {
  const models = backgroundRemovalService.getAvailableModels();
  res.json({
    success: true,
    models,
    default: 'balanced'
  });
}));

/**
 * POST /api/remove-background
 * Remove background from an image using AI
 * Supports quality parameter: 'fast', 'balanced', or 'quality'
 * Requires authentication with @idegy.com email
 */
router.post('/remove-background', requireAuth, asyncHandler(async (req, res) => {
  const upload = req.app.get('upload');
  console.log('[remove-background] Request received, user:', req.user?.email);

  upload.single('image')(req, res, async (error) => {
    console.log('[remove-background] Upload callback, error:', error, 'file:', req.file ? 'present' : 'missing');

    if (error) {
      console.error('[remove-background] Upload error:', error);
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!req.file) {
      console.error('[remove-background] No file in request');
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    console.log('[remove-background] File received:', req.file.originalname, 'size:', req.file.size, 'buffer:', req.file.buffer ? 'present' : 'missing');

    try {
      // Check if background removal is available
      if (!backgroundRemovalService.isAvailable()) {
        if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});
        return res.status(503).json({
          success: false,
          error: 'Background removal service is not available',
          message: 'REPLICATE_API_TOKEN is not configured',
        });
      }

      // Get quality parameter from form data (default: balanced)
      const quality = req.body.quality || 'balanced';
      const threshold = req.body.threshold ? parseFloat(req.body.threshold) : undefined;

      // Get image buffer - handle both memory storage (Vercel) and disk storage (local)
      let imageBuffer = req.file.buffer || await fs.readFile(req.file.path);
      let mimeType = req.file.mimetype;

      // Convert PDF to image if needed
      if (req.file.mimetype === 'application/pdf' || pdfConverter.isPdf(imageBuffer)) {
        console.log('Converting PDF to image for background removal...');
        imageBuffer = await pdfConverter.pdfToImage(imageBuffer, { page: 1, scale: 2 });
        mimeType = 'image/png';
      }

      const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);

      console.log(`Starting background removal with ${quality} quality...`);
      const processedDataUri = await backgroundRemovalService.removeBackground(dataUri, {
        quality,
        threshold
      });
      console.log('Background removal completed');

      // Clean up uploaded file (only if using disk storage)
      if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        message: 'Background removed successfully',
        image: processedDataUri,
        quality: quality
      });

    } catch (error) {
      console.error('[remove-background] ERROR:', error.message);
      console.error('[remove-background] Stack:', error.stack);

      if (req.file?.path) {
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
 * POST /api/remove-background-with-mask
 * Remove background from an image using user-provided mask
 * Supports two modes:
 * - 'refine': AI refines the edges of the mask
 * - 'within': AI removes background only within the masked area
 * Requires authentication with @idegy.com email
 */
router.post('/remove-background-with-mask', requireAuth, asyncHandler(async (req, res) => {
  const upload = req.app.get('upload');

  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'mask', maxCount: 1 }
  ])(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (!req.files?.image?.[0]) {
      return res.status(400).json({ success: false, error: 'No image file provided' });
    }

    if (!req.files?.mask?.[0]) {
      return res.status(400).json({ success: false, error: 'No mask file provided' });
    }

    try {
      const mode = req.body.mode || 'refine'; // 'refine' or 'within'
      const feather = parseInt(req.body.feather) || 0;

      // Read image and mask - handle both memory storage (Vercel) and disk storage (local)
      const imageFile = req.files.image[0];
      const maskFile = req.files.mask[0];
      const imageBuffer = imageFile.buffer || await fs.readFile(imageFile.path);
      const maskBuffer = maskFile.buffer || await fs.readFile(maskFile.path);

      // Get image dimensions
      const imageMetadata = await sharp(imageBuffer).metadata();
      const { width, height } = imageMetadata;

      // Resize mask to match image dimensions if needed
      const maskMetadata = await sharp(maskBuffer).metadata();
      let processedMask = maskBuffer;

      if (maskMetadata.width !== width || maskMetadata.height !== height) {
        processedMask = await sharp(maskBuffer)
          .resize(width, height, { fit: 'fill' })
          .toBuffer();
      }

      // Apply feather to mask if requested
      if (feather > 0) {
        processedMask = await sharp(processedMask)
          .blur(feather)
          .toBuffer();
      }

      // Convert mask to grayscale for alpha channel
      const maskGrayscale = await sharp(processedMask)
        .grayscale()
        .raw()
        .toBuffer();

      let resultBuffer;

      if (mode === 'within' && backgroundRemovalService.isAvailable()) {
        // Mode: AI removes background only within the masked region
        // First, apply AI to the whole image
        const dataUri = replicateService.bufferToDataUri(imageBuffer, imageFile.mimetype);
        const processedDataUri = await backgroundRemovalService.removeBackground(dataUri);

        // Convert AI result back to buffer
        const base64Data = processedDataUri.replace(/^data:image\/\w+;base64,/, '');
        const aiResultBuffer = Buffer.from(base64Data, 'base64');

        // Composite: use original where mask is 0, AI result where mask is 255
        // Get AI result with alpha
        const aiRaw = await sharp(aiResultBuffer)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        const origRaw = await sharp(imageBuffer)
          .ensureAlpha()
          .resize(width, height)
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Create composited result
        const resultRaw = Buffer.alloc(width * height * 4);

        for (let i = 0; i < width * height; i++) {
          const maskValue = maskGrayscale[i] / 255; // 0-1 range

          // Blend between original and AI result based on mask
          resultRaw[i * 4] = Math.round(origRaw.data[i * 4] * (1 - maskValue) + aiRaw.data[i * 4] * maskValue);
          resultRaw[i * 4 + 1] = Math.round(origRaw.data[i * 4 + 1] * (1 - maskValue) + aiRaw.data[i * 4 + 1] * maskValue);
          resultRaw[i * 4 + 2] = Math.round(origRaw.data[i * 4 + 2] * (1 - maskValue) + aiRaw.data[i * 4 + 2] * maskValue);
          resultRaw[i * 4 + 3] = Math.round(origRaw.data[i * 4 + 3] * (1 - maskValue) + aiRaw.data[i * 4 + 3] * maskValue);
        }

        resultBuffer = await sharp(resultRaw, { raw: { width, height, channels: 4 } })
          .png()
          .toBuffer();

      } else {
        // Mode: Apply mask directly (local processing) or refine mode without AI
        // Simply apply the mask as alpha channel

        // Invert mask (in our system, 255 = remove, but for alpha, 255 = visible)
        const invertedMask = Buffer.alloc(maskGrayscale.length);
        for (let i = 0; i < maskGrayscale.length; i++) {
          invertedMask[i] = 255 - maskGrayscale[i];
        }

        // Get original image as raw RGBA
        const origRaw = await sharp(imageBuffer)
          .ensureAlpha()
          .resize(width, height)
          .raw()
          .toBuffer();

        // Apply inverted mask to alpha channel
        const resultRaw = Buffer.alloc(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          resultRaw[i * 4] = origRaw[i * 4];         // R
          resultRaw[i * 4 + 1] = origRaw[i * 4 + 1]; // G
          resultRaw[i * 4 + 2] = origRaw[i * 4 + 2]; // B
          resultRaw[i * 4 + 3] = Math.min(origRaw[i * 4 + 3], invertedMask[i]); // A
        }

        resultBuffer = await sharp(resultRaw, { raw: { width, height, channels: 4 } })
          .png()
          .toBuffer();
      }

      // Convert result to data URI
      const resultDataUri = `data:image/png;base64,${resultBuffer.toString('base64')}`;

      // Clean up temp files (only if using disk storage)
      if (imageFile.path) await fs.unlink(imageFile.path).catch(() => {});
      if (maskFile.path) await fs.unlink(maskFile.path).catch(() => {});

      res.json({
        success: true,
        message: 'Background removed with mask successfully',
        image: resultDataUri,
        mode: mode,
      });

    } catch (error) {
      console.error('Background removal with mask error:', error);

      // Clean up temp files (only if using disk storage)
      if (req.files?.image?.[0]?.path) {
        await fs.unlink(req.files.image[0].path).catch(() => {});
      }
      if (req.files?.mask?.[0]?.path) {
        await fs.unlink(req.files.mask[0].path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Background removal with mask failed',
        message: error.message,
      });
    }
  });
}));

/**
 * POST /api/optimize
 * Optimize an existing SVG
 * Requires authentication with @idegy.com email
 */
router.post('/optimize', requireAuth, asyncHandler(async (req, res) => {
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
 * Requires authentication with @idegy.com email
 */
router.post('/analyze', requireAuth, asyncHandler(async (req, res) => {
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
