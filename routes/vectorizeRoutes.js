const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const replicateService = require('../services/replicateService');
const vtracerService = require('../services/vtracerService');
const IdegyVectorizer = require('../services/vectorizer');
const AIVectorizer = require('../services/vectorizer/aiVectorizer');
const ColorPreservingVectorizer = require('../services/vectorizer/colorPreservingVectorizer');
const AIColorPreservingVectorizer = require('../services/vectorizer/aiColorPreservingVectorizer');
const SmoothingVectorizer = require('../services/vectorizer/smoothingVectorizer');
const generativeReconstructionService = require('../services/generativeReconstructionService');
const svgPostProcessor = require('../services/svgPostProcessor');
const qualityValidator = require('../services/qualityValidator');
const backgroundRemovalService = require('../services/backgroundRemovalService');
const svgOptimizer = require('../services/svgOptimizer');
const pdfConverter = require('../services/pdfConverter');
const { validate } = require('../middleware/validation');
const { asyncHandler, ProcessingError, NotFoundError } = require('../utils/errors');
const { requireAuth } = require('../services/authService');
const { apiLogger } = require('../utils/logger');

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
        method = 'color-preserving',
        removeBackground = 'false',
        detailLevel = 'medium',
        optimize = 'true',
        optimizeLevel = 'default',
        invert = 'false',
        // Post-processing options
        detectShapes = 'true',
        gapFiller = 'false',
        groupBy = 'none',
        adobeCompatibility = 'false',
        ...options
      } = req.body;

      // Get image buffer - handle both memory storage (Vercel) and disk storage (local)
      let imageBuffer = req.file.buffer || await fs.readFile(req.file.path);

      // Convert PDF to image if needed
      if (req.file.mimetype === 'application/pdf' || pdfConverter.isPdf(imageBuffer)) {
        try {
          imageBuffer = await pdfConverter.pdfToImage(imageBuffer, { page: 1, scale: 2 });
        } catch (pdfError) {
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
      let svgToSave;

      websocketService.updateJobProgress(jobId, { status: 'vectorizing' });

      const metadata = await sharp(imageBuffer).metadata();

      // Choose vectorization method: 'smooth' (default), 'color-preserving', 'gen-pro', 'ai-pro', 'idegy', 'vtracer', or 'ai'
      if (method === 'smooth' || method === 'color-preserving') {
        // SMOOTHING VECTORIZER - Best quality: exact colors with smooth Bezier curves
        // 1. Upscales image 3x for higher tracing resolution
        // 2. Traces with imagetracerjs for exact color regions
        // 3. Converts polylines to smooth Bezier curves (Catmull-Rom)
        // 4. Snaps colors to detected brand colors

        const vectorizer = new SmoothingVectorizer({ upscaleFactor: 3 });
        const quantizeColors = detailLevel !== 'ultra';
        svgToSave = await vectorizer.vectorize(imageBuffer, { quantizeColors });
        processingMethod = 'Smoothing Vectorizer (exact colors + smooth curves)';

      } else if (method === 'ai-color' && replicateService.isAvailable()) {
        // AI COLOR-PRESERVING VECTORIZER - Clean shapes but may change regions
        // Uses Recraft AI for smooth vector shapes, then samples original image for exact colors
        // Note: AI may reinterpret the image, changing region boundaries

        const vectorizer = new AIColorPreservingVectorizer();
        const quantizeColors = detailLevel !== 'ultra';
        svgToSave = await vectorizer.vectorize(imageBuffer, { quantizeColors });
        processingMethod = 'AI Color-Preserving Vectorizer (Recraft AI + exact colors)';

      } else if (method === 'gen-pro' && generativeReconstructionService.isAvailable()) {
        // Use Generative Reconstruction Pipeline + VTracer
        // This is the highest quality option using:
        // 1. Real-ESRGAN AI super-resolution
        // 2. OpenCV edge preservation (bilateral filter + adaptive sharpening)
        // 3. Color quantization to solid hex codes
        // 4. VTracer for final vectorization

        websocketService.updateJobProgress(jobId, { status: 'ai_preprocessing' });

        const colorMap = {
          low: 8,
          medium: 16,
          high: 24,
          ultra: 32,
        };

        const result = await generativeReconstructionService.process(imageBuffer, {
          upscaleFactor: 4,
          maxColors: colorMap[detailLevel] || 16,
          outputDpi: 300,
          minDimension: 2000,
          sharpenEdges: true,
          denoise: true,
        });

        websocketService.updateJobProgress(jobId, { status: 'vectorizing' });

        // Now vectorize the preprocessed image
        svgToSave = await vtracerService.vectorizeImage(result.buffer, {
          preset: 'logo',
          preprocess: false,  // Already preprocessed by Python pipeline
          aiUpscale: false,
        });

        processingMethod = `Generative Reconstruction + VTracer (${detailLevel} quality)`;

      } else if (method === 'ai-pro' || (method === 'gen-pro' && !generativeReconstructionService.isAvailable())) {
        // Use VTracer with optimized settings for clean vector output
        // Logo preset produces cleaner, smaller files
        // Falls back here if gen-pro requested but Python pipeline not available
        const presetMap = {
          low: 'poster',
          medium: 'logo',
          high: 'logo',      // Logo preset is best for most cases
          ultra: 'detailed',
        };
        const preset = presetMap[detailLevel] || 'logo';

        svgToSave = await vtracerService.vectorizeImage(imageBuffer, {
          preset,
          preprocess: true,
          aiUpscale: false,  // Disabled - causes bloated output (4x paths)
        });
        processingMethod = `AI Vectorizer Pro (${preset} preset)`;

      } else if (method === 'idegy' || method === 'vtracer' && false) {
        // Use IDEGY Vectorizer (built from scratch, no external dependencies)
        const presetMap = {
          low: { maxColors: 16, minArea: 25, simplifyTolerance: 2.5, lineTolerance: 2.0 },
          medium: { maxColors: 32, minArea: 8, simplifyTolerance: 1.5, lineTolerance: 1.0 },
          high: { maxColors: 64, minArea: 4, simplifyTolerance: 1.0, lineTolerance: 0.5 },
        };
        const preset = presetMap[detailLevel] || presetMap.medium;

        const vectorizer = new IdegyVectorizer({
          ...preset,
          gapFiller: true,  // Always use gap filler
          detectShapes: false,  // Disable shape detection (causes issues)
        });

        svgToSave = await vectorizer.vectorize(imageBuffer);
        processingMethod = `IDEGY Vectorizer (${detailLevel} detail)`;

        // Mark to skip optimization - IDEGY output is already clean
        // The SVGO optimizer strips black fills which breaks the output

      } else if (method === 'ai' && replicateService.isAvailable()) {
        // Use Replicate AI (recraft-vectorize)
        const maxDimension = 4096;
        const minDimension = 512;
        let mimeType = 'image/png';

        const needsDownscale = metadata.width > maxDimension || metadata.height > maxDimension;
        const needsUpscale = metadata.width < minDimension || metadata.height < minDimension;

        let resizeOptions = { fit: 'inside', withoutEnlargement: true };

        if (needsUpscale && !needsDownscale) {
          const scale = minDimension / Math.min(metadata.width, metadata.height);
          const targetWidth = Math.round(metadata.width * scale);
          const targetHeight = Math.round(metadata.height * scale);
          resizeOptions = { width: targetWidth, height: targetHeight, fit: 'fill' };
        } else if (needsDownscale) {
          resizeOptions = { width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true };
        }

        imageBuffer = await sharp(imageBuffer)
          .resize(resizeOptions)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .png({ quality: 100 })
          .toBuffer();

        const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);
        svgContent = await replicateService.vectorizeImage(dataUri, options);
        processingMethod = 'Replicate AI (recraft-vectorize)';

        // Handle URL responses from Replicate
        svgToSave = svgContent;
        if (typeof svgContent === 'string' && svgContent.startsWith('http')) {
          const response = await fetch(svgContent);
          svgToSave = await response.text();
        } else if (typeof svgContent === 'object' && svgContent.uri) {
          const response = await fetch(svgContent.uri);
          svgToSave = await response.text();
        } else if (typeof svgContent !== 'string') {
          svgToSave = String(svgContent);
        }
      } else {
        // Use VTracer with AI upscaling for best quality
        // Map detailLevel to VTracer preset
        const presetMap = {
          low: 'poster',
          medium: 'logo',
          high: 'detailed',
        };
        const preset = presetMap[detailLevel] || 'logo';

        // VTracer with preprocessing for best quality
        // AI upscale only for very small images to keep output manageable
        svgToSave = await vtracerService.vectorizeImage(imageBuffer, {
          preset,
          preprocess: true,
          aiUpscale: true,
          aiUpscaleMinDimension: 400,   // Only upscale very small images
          aiUpscaleMaxDimension: 1200,  // Cap to prevent huge SVGs
        });
        processingMethod = `VTracer (${preset} preset with AI upscaling)`;
      }

      // Optimize SVG if requested (skip for IDEGY - optimizer strips black fills)
      let optimizationStats = null;
      const skipOptimization = processingMethod.includes('IDEGY');
      if (optimize === 'true' && !skipOptimization) {
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

      // Post-process SVG (shape detection, grouping, gap filler)
      // Skip for IDEGY - it already has gap filler and proper structure
      let postProcessStats = null;
      if (!skipOptimization) {
        try {
          websocketService.updateJobProgress(jobId, { status: 'post-processing' });

          const statsBefore = svgPostProcessor.getStatistics(svgToSave);

          svgToSave = svgPostProcessor.process(svgToSave, {
            detectShapes: detectShapes === 'true',
            shapeTypes: ['circle', 'ellipse', 'rectangle'],
            gapFiller: { enabled: gapFiller === 'true', strokeWidth: 1.5 },
            groupBy: groupBy || 'none',
            adobeCompatibility: adobeCompatibility === 'true',
            svgVersion: '1.1',
          });

          const statsAfter = svgPostProcessor.getStatistics(svgToSave);
          postProcessStats = {
            shapesDetected: (statsAfter.circles || 0) + (statsAfter.ellipses || 0) + (statsAfter.rectangles || 0),
            pathsBefore: statsBefore.paths,
            pathsAfter: statsAfter.paths,
            groups: statsAfter.groups,
          };
        } catch (postProcessError) {
          console.warn('Post-processing failed, using original SVG:', postProcessError.message);
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
        postProcessing: postProcessStats,
      };

      // Cache the result
      cacheService.setSVG(cacheKey, result);

      // Complete the job
      websocketService.completeJob(jobId, 'completed');

      // Log the operation
      apiLogger.vectorize(req.file.originalname, method, true, duration);

      res.json(result);

    } catch (error) {
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
          imageBuffer = await pdfConverter.pdfToImage(imageBuffer, { page: 1, scale: 2 });
        }

        // Preprocess image: always convert to PNG for better Replicate compatibility
        const metadata = await sharp(imageBuffer).metadata();
        const maxDimension = 4096;
        const minDimension = 512;
        const mimeType = 'image/png';

        // Calculate resize needs
        const needsDownscale = metadata.width > maxDimension || metadata.height > maxDimension;
        // Upscale if EITHER dimension is below minimum (not just both)
        const needsUpscale = metadata.width < minDimension || metadata.height < minDimension;

        let resizeOptions = { fit: 'inside', withoutEnlargement: true };

        if (needsUpscale && !needsDownscale) {
          // Upscale so the SMALLER dimension reaches minimum (ensures both dimensions are >= minDimension)
          const scale = minDimension / Math.min(metadata.width, metadata.height);
          const targetWidth = Math.round(metadata.width * scale);
          const targetHeight = Math.round(metadata.height * scale);
          resizeOptions = { width: targetWidth, height: targetHeight, fit: 'fill' };
        } else if (needsDownscale) {
          resizeOptions = { width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true };
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
  const vtracerHealthy = vtracerService.isAvailable();
  const genReconHealthy = generativeReconstructionService.isAvailable();

  const result = {
    methods: [
      {
        id: 'smooth',
        name: 'Smoothing Vectorizer',
        description: 'Best quality vectorization with exact brand colors AND smooth edges. Upscales 3x, traces exact regions, then applies Bezier curve smoothing.',
        available: true,
        recommended: true,
        default: true,
        features: [
          'Preserves exact brand colors (hex values)',
          'Smooth Bezier curve edges (not jagged)',
          '3x upscaling for higher tracing resolution',
          'Catmull-Rom to Bezier curve conversion',
          'Handles anti-aliasing automatically',
          'Best for logos requiring pinpoint accuracy',
        ],
      },
      {
        id: 'color-preserving',
        name: 'Color-Preserving Vectorizer (Legacy)',
        description: 'Exact brand colors with Potrace-based tracing. Same as smooth method.',
        available: true,
        recommended: false,
        default: false,
        features: [
          'Alias for smooth method',
          'Preserves exact brand colors',
          'Smooth Bezier curves',
        ],
      },
      {
        id: 'gen-pro',
        name: 'Generative Reconstruction',
        description: 'High quality vectorization using AI super-resolution (Real-ESRGAN), edge preservation, and color quantization. Best for low-resolution or compressed logos.',
        available: genReconHealthy && vtracerHealthy,
        recommended: false,
        default: false,
        features: [
          'Real-ESRGAN AI super-resolution (4x upscale)',
          'Edge-preserving bilateral filtering',
          'Adaptive edge sharpening',
          'Color quantization to solid hex codes',
          '300+ DPI vector-ready output',
          'OpenCV advanced image processing',
          'Optimized for low-res brand assets',
        ],
      },
      {
        id: 'ai-pro',
        name: 'AI Vectorizer Pro',
        description: 'Fast production-quality vectorization using VTracer with preprocessing. Best for higher-resolution logos.',
        available: vtracerHealthy,
        recommended: false,
        default: false,
        features: [
          'High-quality VTracer engine',
          'Color preprocessing and quantization',
          'Smooth spline-based curves',
          'Intelligent noise filtering',
          'Optimized for logos and graphics',
          'Multiple quality presets',
        ],
      },
      {
        id: 'idegy',
        name: 'IDEGY Vectorizer',
        description: 'Fast local vectorization with multi-curve fitting. Good balance of speed and quality.',
        available: true,
        recommended: false,
        default: false,
        features: [
          'Multi-curve fitting (lines, arcs, Bézier)',
          'Shape detection (circles, ellipses, rectangles)',
          'Gap filler to prevent white lines',
          'Color quantization and region segmentation',
          'Fast local processing',
          'No external dependencies',
        ],
      },
      {
        id: 'vtracer',
        name: 'VTracer',
        description: 'Fast, high-quality local vectorization. Good for simple logos.',
        available: vtracerHealthy,
        recommended: false,
        default: false,
        features: [
          'Instant processing (~10ms)',
          'Excellent for simple logos',
          'Clean vector paths with smooth curves',
          'Multiple quality presets',
        ],
      },
      {
        id: 'ai',
        name: 'Replicate AI',
        model: 'recraft-ai/recraft-vectorize',
        description: 'Cloud AI vectorization using Recraft model.',
        available: replicateHealthy,
        recommended: false,
        features: [
          'Cloud-based AI processing',
          'Handles complex illustrations',
          'Requires API token',
          'Slower (~30 seconds)',
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
        imageBuffer = await pdfConverter.pdfToImage(imageBuffer, { page: 1, scale: 2 });
        mimeType = 'image/png';
      }

      const dataUri = replicateService.bufferToDataUri(imageBuffer, mimeType);

      const processedDataUri = await backgroundRemovalService.removeBackground(dataUri, {
        quality,
        threshold
      });

      // Clean up uploaded file (only if using disk storage)
      if (req.file?.path) await fs.unlink(req.file.path).catch(() => {});

      res.json({
        success: true,
        message: 'Background removed successfully',
        image: processedDataUri,
        quality: quality
      });

    } catch (error) {
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
