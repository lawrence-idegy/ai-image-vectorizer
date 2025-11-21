const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const replicateService = require('../services/replicateService');
const potraceService = require('../services/potraceService');
const qualityValidator = require('../services/qualityValidator');
const formatConverter = require('../services/formatConverter');
const backgroundRemovalService = require('../services/backgroundRemovalService');

/**
 * POST /api/vectorize
 * Convert a single image to SVG vector
 */
router.post('/vectorize', async (req, res) => {
  const upload = req.app.get('upload');

  upload.single('image')(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    try {
      const { method = 'ai', removeBackground = 'false', detailLevel = 'medium', ...options } = req.body;
      let imageBuffer = await fs.readFile(req.file.path);

      // Optional: Remove background before vectorization
      if (removeBackground === 'true' && backgroundRemovalService.isAvailable()) {
        console.log('Removing background before vectorization...');
        try {
          const dataUri = replicateService.bufferToDataUri(imageBuffer, req.file.mimetype);
          const processedDataUri = await backgroundRemovalService.removeBackground(dataUri);

          // Convert back to buffer
          const base64Data = processedDataUri.replace(/^data:image\/\w+;base64,/, '');
          imageBuffer = Buffer.from(base64Data, 'base64');
          console.log('Background removed successfully');
        } catch (bgError) {
          console.warn('Background removal failed, continuing with original image:', bgError.message);
        }
      }

      let svgContent;
      let processingMethod;

      if (method === 'ai' || method === 'replicate') {
        // Use Replicate AI (primary method)
        const dataUri = replicateService.bufferToDataUri(imageBuffer, req.file.mimetype);
        svgContent = await replicateService.vectorizeImage(dataUri, options);
        processingMethod = 'Replicate AI (recraft-vectorize)';
      } else if (method === 'potrace' || method === 'fallback') {
        // Use Potrace (fallback method)
        svgContent = await potraceService.vectorizeImage(imageBuffer, options);
        processingMethod = 'Potrace (local)';
      } else {
        // Default to AI with Potrace fallback on error
        try {
          const dataUri = replicateService.bufferToDataUri(imageBuffer, req.file.mimetype);
          svgContent = await replicateService.vectorizeImage(dataUri, options);
          processingMethod = 'Replicate AI (recraft-vectorize)';
        } catch (aiError) {
          console.warn('AI vectorization failed, falling back to Potrace:', aiError.message);
          svgContent = await potraceService.vectorizeImage(imageBuffer, options);
          processingMethod = 'Potrace (fallback)';
        }
      }

      // Save SVG to output directory
      const outputFilename = `${path.parse(req.file.filename).name}.svg`;
      const outputPath = path.join(__dirname, '../output', outputFilename);

      // Handle different output formats from Replicate
      let svgToSave = svgContent;

      // Replicate returns a URL string or object with uri property
      if (typeof svgContent === 'string' && svgContent.startsWith('http')) {
        // If it's a URL string, fetch the actual SVG content
        const response = await fetch(svgContent);
        svgToSave = await response.text();
      } else if (typeof svgContent === 'object' && svgContent.uri) {
        // If Replicate returns a URI in an object, fetch the content
        const response = await fetch(svgContent.uri);
        svgToSave = await response.text();
      } else if (typeof svgContent !== 'string') {
        svgToSave = String(svgContent);
      }

      await fs.writeFile(outputPath, svgToSave);

      // Validate quality
      const qualityMetrics = qualityValidator.validateSVG(svgToSave);

      // Get source image info for comparison
      const imageMetadata = await sharp(imageBuffer).metadata();
      const sourceComparison = qualityValidator.compareWithSource(imageMetadata, qualityMetrics);

      // Get method-specific recommendations
      const recommendations = qualityValidator.getMethodRecommendations(method, qualityMetrics);

      // Clean up uploaded file
      await fs.unlink(req.file.path).catch(console.error);

      res.json({
        success: true,
        message: 'Image vectorized successfully',
        method: processingMethod,
        originalFilename: req.file.originalname,
        outputFilename,
        downloadUrl: `/api/download/${outputFilename}`,
        svgContent: svgToSave,
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
          recommendations: [...sourceComparison.recommendations, ...recommendations]
        }
      });

    } catch (error) {
      console.error('Vectorization error:', error);

      // Clean up uploaded file
      if (req.file) {
        await fs.unlink(req.file.path).catch(console.error);
      }

      res.status(500).json({
        success: false,
        error: 'Vectorization failed',
        message: error.message
      });
    }
  });
});

/**
 * POST /api/vectorize/batch
 * Convert multiple images to SVG vectors
 */
router.post('/vectorize/batch', async (req, res) => {
  const upload = req.app.get('upload');

  upload.array('images', 20)(req, res, async (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No image files provided' });
    }

    try {
      const { method = 'ai', ...options } = req.body;
      const results = [];

      console.log(`Processing batch of ${req.files.length} images...`);

      if (method === 'ai' || method === 'replicate') {
        // Process with Replicate AI
        const images = await Promise.all(
          req.files.map(async (file) => ({
            buffer: await fs.readFile(file.path),
            mimetype: file.mimetype,
            filename: file.originalname
          }))
        );

        const batchResults = await replicateService.vectorizeBatch(images, options);

        // Save results and prepare response
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const file = req.files[i];

          if (result.success) {
            const outputFilename = `${path.parse(file.filename).name}.svg`;
            const outputPath = path.join(__dirname, '../output', outputFilename);

            let svgToSave = result.result;

            // Handle URL string or object with uri
            if (typeof svgToSave === 'string' && svgToSave.startsWith('http')) {
              const response = await fetch(svgToSave);
              svgToSave = await response.text();
            } else if (typeof svgToSave === 'object' && svgToSave.uri) {
              const response = await fetch(svgToSave.uri);
              svgToSave = await response.text();
            }

            await fs.writeFile(outputPath, svgToSave);

            results.push({
              success: true,
              originalFilename: file.originalname,
              outputFilename,
              downloadUrl: `/api/download/${outputFilename}`
            });
          } else {
            results.push({
              success: false,
              originalFilename: file.originalname,
              error: result.error
            });
          }

          // Clean up uploaded file
          await fs.unlink(file.path).catch(console.error);
        }

      } else {
        // Process with Potrace
        const images = await Promise.all(
          req.files.map(async (file) => ({
            buffer: await fs.readFile(file.path),
            filename: file.originalname
          }))
        );

        const batchResults = await potraceService.vectorizeBatch(images, options);

        // Save results and prepare response
        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const file = req.files[i];

          if (result.success) {
            const outputFilename = `${path.parse(file.filename).name}.svg`;
            const outputPath = path.join(__dirname, '../output', outputFilename);
            await fs.writeFile(outputPath, result.result);

            results.push({
              success: true,
              originalFilename: file.originalname,
              outputFilename,
              downloadUrl: `/api/download/${outputFilename}`
            });
          } else {
            results.push({
              success: false,
              originalFilename: file.originalname,
              error: result.error
            });
          }

          // Clean up uploaded file
          await fs.unlink(file.path).catch(console.error);
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Batch processing completed: ${successCount}/${req.files.length} images vectorized`,
        method: method === 'ai' ? 'Replicate AI' : 'Potrace',
        results
      });

    } catch (error) {
      console.error('Batch vectorization error:', error);

      // Clean up uploaded files
      if (req.files) {
        for (const file of req.files) {
          await fs.unlink(file.path).catch(console.error);
        }
      }

      res.status(500).json({
        success: false,
        error: 'Batch vectorization failed',
        message: error.message
      });
    }
  });
});

/**
 * GET /api/download/:filename
 * Download a vectorized SVG file
 */
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../output', filename);

    // Check if file exists
    await fs.access(filePath);

    // Set headers for download
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const content = await fs.readFile(filePath);
    res.send(content);

  } catch (error) {
    console.error('Download error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * GET /api/preview/:filename
 * Preview a vectorized SVG file (inline display)
 */
router.get('/preview/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../output', filename);

    // Check if file exists
    await fs.access(filePath);

    // Set headers for inline display
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Content-Disposition', 'inline');

    const content = await fs.readFile(filePath);
    res.send(content);

  } catch (error) {
    console.error('Preview error:', error);
    res.status(404).json({ error: 'File not found' });
  }
});

/**
 * GET /api/methods
 * Get available vectorization methods and their info
 */
router.get('/methods', async (req, res) => {
  try {
    const replicateHealthy = await replicateService.checkHealth();
    const potraceInfo = potraceService.getInfo();

    res.json({
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
            'Compatible with Adobe Illustrator, Figma, Sketch'
          ]
        },
        {
          id: 'potrace',
          name: 'Potrace',
          ...potraceInfo,
          available: true,
          recommended: false
        }
      ]
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
