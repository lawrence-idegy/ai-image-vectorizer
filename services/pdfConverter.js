/**
 * PDF to Image Converter Service
 * Converts PDF files to PNG images for vectorization
 */

const { createCanvas } = require('canvas');
const fs = require('fs').promises;
const path = require('path');

// pdfjs-dist requires special handling for Node.js
let pdfjsLib = null;

async function initPdfJs() {
  if (pdfjsLib) return pdfjsLib;

  // Dynamic import for ES module compatibility
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib = pdfjs;

  return pdfjsLib;
}

/**
 * Convert a PDF buffer to a PNG image buffer
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {Object} options - Conversion options
 * @param {number} options.page - Page number to convert (1-indexed, default: 1)
 * @param {number} options.scale - Scale factor for rendering (default: 2 for high quality)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function pdfToImage(pdfBuffer, options = {}) {
  const { page = 1, scale = 2 } = options;

  const pdfjs = await initPdfJs();

  // Build proper file URL for standard fonts (pdfjs requires URL format)
  const fontsPath = path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts/');
  const fontsUrl = `file:///${fontsPath.replace(/\\/g, '/')}`;

  // Load the PDF document
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    standardFontDataUrl: fontsUrl,
  });

  const pdfDoc = await loadingTask.promise;

  // Get the requested page (1-indexed)
  const pageNum = Math.min(Math.max(1, page), pdfDoc.numPages);
  const pdfPage = await pdfDoc.getPage(pageNum);

  // Get page dimensions at the specified scale
  const viewport = pdfPage.getViewport({ scale });
  const { width, height } = viewport;

  // Create canvas for rendering
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  // Fill with white background (PDFs often have transparent backgrounds)
  context.fillStyle = 'white';
  context.fillRect(0, 0, width, height);

  // Render the PDF page to canvas
  await pdfPage.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  // Convert canvas to PNG buffer
  const pngBuffer = canvas.toBuffer('image/png');

  // Cleanup
  pdfDoc.destroy();

  return pngBuffer;
}

/**
 * Get information about a PDF file
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @returns {Promise<Object>} PDF metadata including page count and dimensions
 */
async function getPdfInfo(pdfBuffer) {
  const pdfjs = await initPdfJs();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // Get first page dimensions
  const firstPage = await pdfDoc.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });

  const info = {
    numPages,
    width: viewport.width,
    height: viewport.height,
  };

  pdfDoc.destroy();

  return info;
}

/**
 * Check if a buffer is a PDF file
 * @param {Buffer} buffer - File buffer
 * @returns {boolean} True if the buffer starts with PDF magic bytes
 */
function isPdf(buffer) {
  // PDF files start with "%PDF-"
  if (buffer.length < 5) return false;
  return buffer[0] === 0x25 && // %
         buffer[1] === 0x50 && // P
         buffer[2] === 0x44 && // D
         buffer[3] === 0x46 && // F
         buffer[4] === 0x2D;   // -
}

module.exports = {
  pdfToImage,
  getPdfInfo,
  isPdf,
};
