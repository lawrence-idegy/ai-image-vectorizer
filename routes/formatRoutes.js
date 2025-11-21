const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const formatConverter = require('../services/formatConverter');

/**
 * GET /api/formats
 * Get available export formats
 */
router.get('/formats', (req, res) => {
  const formats = formatConverter.getAvailableFormats();
  res.json({
    success: true,
    formats
  });
});

/**
 * POST /api/convert/:filename
 * Convert an existing SVG to different format
 */
router.post('/convert/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { format } = req.body;

    if (!format) {
      return res.status(400).json({ error: 'Format parameter is required' });
    }

    // Read SVG file
    const svgPath = path.join(__dirname, '../output', filename);
    const svgContent = await fs.readFile(svgPath, 'utf8');

    // Prepare output path
    const baseName = path.parse(filename).name;
    const formatInfo = formatConverter.getAvailableFormats().find(f => f.id === format);

    if (!formatInfo) {
      return res.status(400).json({ error: 'Invalid format specified' });
    }

    const outputFilename = `${baseName}${formatInfo.extension}`;
    const outputPath = path.join(__dirname, '../output', outputFilename);

    // Convert
    const result = await formatConverter.convertTo(svgContent, format, outputPath);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: 'Conversion failed',
        message: result.error
      });
    }

    res.json({
      success: true,
      message: `Converted to ${format.toUpperCase()} successfully`,
      format: format.toUpperCase(),
      originalFilename: filename,
      outputFilename,
      downloadUrl: `/api/download/${outputFilename}`
    });

  } catch (error) {
    console.error('Format conversion error:', error);
    res.status(500).json({
      success: false,
      error: 'Format conversion failed',
      message: error.message
    });
  }
});

/**
 * POST /api/export-formats
 * Export SVG to multiple formats at once
 */
router.post('/export-formats', async (req, res) => {
  try {
    const { filename, formats } = req.body;

    if (!filename || !formats || !Array.isArray(formats)) {
      return res.status(400).json({
        error: 'filename and formats array are required'
      });
    }

    // Read SVG file
    const svgPath = path.join(__dirname, '../output', filename);
    const svgContent = await fs.readFile(svgPath, 'utf8');

    const baseName = path.parse(filename).name;
    const results = [];

    // Convert to each requested format
    for (const format of formats) {
      const formatInfo = formatConverter.getAvailableFormats().find(f => f.id === format);

      if (!formatInfo) {
        results.push({
          format,
          success: false,
          error: 'Invalid format'
        });
        continue;
      }

      const outputFilename = `${baseName}${formatInfo.extension}`;
      const outputPath = path.join(__dirname, '../output', outputFilename);

      const result = await formatConverter.convertTo(svgContent, format, outputPath);

      results.push({
        format: format.toUpperCase(),
        success: result.success,
        outputFilename: result.success ? outputFilename : null,
        downloadUrl: result.success ? `/api/download/${outputFilename}` : null,
        error: result.error || null
      });
    }

    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      message: `Exported to ${successCount}/${formats.length} formats`,
      results
    });

  } catch (error) {
    console.error('Multi-format export error:', error);
    res.status(500).json({
      success: false,
      error: 'Export failed',
      message: error.message
    });
  }
});

module.exports = router;
