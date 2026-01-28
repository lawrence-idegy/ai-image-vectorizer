/**
 * PDF to Image Converter Service
 * Converts PDF files to PNG images for vectorization
 * Properly configured for Node.js/serverless environments
 */

const { createCanvas } = require('canvas');
const path = require('path');

// Polyfill browser APIs required by pdfjs-dist for Node.js
class NodeDOMMatrix {
  constructor(init) {
    this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
    if (init && Array.isArray(init) && init.length === 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
    } else if (init && typeof init === 'object') {
      Object.assign(this, init);
    }
  }

  // Required methods for pdfjs
  multiply(other) {
    const result = new NodeDOMMatrix();
    result.a = this.a * other.a + this.c * other.b;
    result.b = this.b * other.a + this.d * other.b;
    result.c = this.a * other.c + this.c * other.d;
    result.d = this.b * other.c + this.d * other.d;
    result.e = this.a * other.e + this.c * other.f + this.e;
    result.f = this.b * other.e + this.d * other.f + this.f;
    return result;
  }

  inverse() {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) return new NodeDOMMatrix();
    const result = new NodeDOMMatrix();
    result.a = this.d / det;
    result.b = -this.b / det;
    result.c = -this.c / det;
    result.d = this.a / det;
    result.e = (this.c * this.f - this.d * this.e) / det;
    result.f = (this.b * this.e - this.a * this.f) / det;
    return result;
  }

  translate(tx, ty) {
    return this.multiply(new NodeDOMMatrix([1, 0, 0, 1, tx, ty]));
  }

  scale(sx, sy) {
    return this.multiply(new NodeDOMMatrix([sx, 0, 0, sy || sx, 0, 0]));
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return this.multiply(new NodeDOMMatrix([cos, sin, -sin, cos, 0, 0]));
  }

  transformPoint(point) {
    return {
      x: this.a * point.x + this.c * point.y + this.e,
      y: this.b * point.x + this.d * point.y + this.f
    };
  }
}

// Set up global polyfills before importing pdfjs
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = NodeDOMMatrix;
}

// Path2D polyfill (minimal implementation for pdfjs)
if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2D {
    constructor() { this.commands = []; }
    moveTo(x, y) { this.commands.push({ type: 'moveTo', x, y }); }
    lineTo(x, y) { this.commands.push({ type: 'lineTo', x, y }); }
    bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y) {
      this.commands.push({ type: 'bezierCurveTo', cp1x, cp1y, cp2x, cp2y, x, y });
    }
    quadraticCurveTo(cpx, cpy, x, y) {
      this.commands.push({ type: 'quadraticCurveTo', cpx, cpy, x, y });
    }
    closePath() { this.commands.push({ type: 'closePath' }); }
    rect(x, y, w, h) { this.commands.push({ type: 'rect', x, y, w, h }); }
  };
}

// pdfjs-dist requires special handling for Node.js
let pdfjsLib = null;
let pdfJsAvailable = true;
let initError = null;

/**
 * Custom canvas factory for pdfjs-dist in Node.js
 */
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return { canvas, context };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

async function initPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  if (initError) throw initError;

  try {
    // Dynamic import for ES module compatibility
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

    // Disable worker to avoid module loading issues on serverless
    // This runs PDF processing in the main thread which is fine for serverless
    if (pdfjs.GlobalWorkerOptions) {
      pdfjs.GlobalWorkerOptions.workerSrc = '';
    }

    pdfjsLib = pdfjs;
    console.log('pdfjs-dist initialized successfully (worker disabled)');
    return pdfjsLib;
  } catch (error) {
    console.error('Failed to initialize pdfjs-dist:', error.message);
    pdfJsAvailable = false;
    initError = new Error('PDF processing is not available: ' + error.message);
    throw initError;
  }
}

/**
 * Check if PDF processing is available
 * @returns {boolean}
 */
function isAvailable() {
  return pdfJsAvailable;
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

  // Build proper file URL for standard fonts
  const fontsPath = path.join(__dirname, '../node_modules/pdfjs-dist/standard_fonts/');
  const fontsUrl = `file:///${fontsPath.replace(/\\/g, '/')}`;

  // Create canvas factory for Node.js
  const canvasFactory = new NodeCanvasFactory();

  // Load the PDF document (worker disabled for serverless compatibility)
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: true,
    standardFontDataUrl: fontsUrl,
    canvasFactory: canvasFactory,
    isEvalSupported: false,
    disableWorker: true,
    useWorkerFetch: false,
  });

  const pdfDoc = await loadingTask.promise;

  // Get the requested page (1-indexed)
  const pageNum = Math.min(Math.max(1, page), pdfDoc.numPages);
  const pdfPage = await pdfDoc.getPage(pageNum);

  // Get page dimensions at the specified scale
  const viewport = pdfPage.getViewport({ scale });
  const { width, height } = viewport;

  // Create canvas for rendering
  const canvas = createCanvas(Math.ceil(width), Math.ceil(height));
  const context = canvas.getContext('2d');

  // Fill with white background (PDFs often have transparent backgrounds)
  context.fillStyle = 'white';
  context.fillRect(0, 0, width, height);

  // Render the PDF page to canvas
  const renderContext = {
    canvasContext: context,
    viewport: viewport,
    canvasFactory: canvasFactory,
  };

  await pdfPage.render(renderContext).promise;

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

  const canvasFactory = new NodeCanvasFactory();

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    canvasFactory: canvasFactory,
    disableWorker: true,
    useWorkerFetch: false,
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
  isAvailable,
};
