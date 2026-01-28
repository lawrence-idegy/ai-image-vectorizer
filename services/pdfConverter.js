/**
 * PDF to Image Converter Service
 * Uses Sharp (libvips) for PDF to image conversion
 * Works in Node.js and serverless environments without browser APIs
 */

const sharp = require('sharp');

/**
 * Convert a PDF buffer to a PNG image buffer
 * Uses Sharp which handles PDFs via libvips (poppler/PDFium)
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @param {Object} options - Conversion options
 * @param {number} options.page - Page number to convert (0-indexed internally, 1-indexed API)
 * @param {number} options.scale - Scale factor (density multiplier, default: 2)
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function pdfToImage(pdfBuffer, options = {}) {
  const { page = 1, scale = 2 } = options;

  try {
    // Sharp can read PDFs using libvips
    // density controls DPI (default 72, so scale=2 gives 144 DPI)
    const density = 72 * scale;

    const pngBuffer = await sharp(pdfBuffer, {
      density: density,
      page: page - 1, // Sharp uses 0-indexed pages
    })
      .flatten({ background: { r: 255, g: 255, b: 255 } }) // White background
      .png({ quality: 100 })
      .toBuffer();

    console.log(`PDF page ${page} converted to PNG (density: ${density} DPI)`);
    return pngBuffer;
  } catch (error) {
    console.error('Sharp PDF conversion failed:', error.message);

    // If Sharp can't handle PDFs (no poppler/PDFium support), give clear error
    if (error.message.includes('VipsOperation') || error.message.includes('pdf') || error.message.includes('load')) {
      throw new Error('PDF processing is not supported. Please convert your PDF to a PNG or JPG image before uploading.');
    }

    throw new Error('Failed to convert PDF to image: ' + error.message);
  }
}

/**
 * Get information about a PDF file
 * @param {Buffer} pdfBuffer - The PDF file buffer
 * @returns {Promise<Object>} PDF metadata including page count and dimensions
 */
async function getPdfInfo(pdfBuffer) {
  try {
    const metadata = await sharp(pdfBuffer, { page: 0 }).metadata();

    return {
      numPages: metadata.pages || 1,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    console.error('Failed to get PDF info:', error.message);
    throw new Error('Failed to read PDF: ' + error.message);
  }
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

/**
 * Check if PDF processing is available
 * Sharp's PDF support depends on libvips being compiled with poppler/PDFium
 * @returns {boolean}
 */
function isAvailable() {
  // Sharp is always available, but PDF support depends on libvips config
  // We'll return true and let the actual conversion handle errors gracefully
  return true;
}

module.exports = {
  pdfToImage,
  getPdfInfo,
  isPdf,
  isAvailable,
};
