/**
 * Client-side PDF to Image Converter
 * Uses pdfjs-dist in the browser where Canvas, DOMMatrix, and Web Workers are natively available.
 * This avoids server-side PDF processing issues on Vercel (no poppler/PDFium, no DOMMatrix).
 */

import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker - use CDN for reliability in production (Vercel)
// This avoids bundling issues with Vite and ensures the worker loads correctly
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/build/pdf.worker.mjs';

/**
 * Convert a PDF file to a PNG image (first page)
 * @param {File} pdfFile - The PDF file to convert
 * @param {Object} options - Conversion options
 * @param {number} options.scale - Scale factor (default: 2 for good quality)
 * @param {number} options.page - Page number to convert (1-indexed, default: 1)
 * @returns {Promise<File>} A PNG File object ready for upload
 */
export async function convertPdfToImage(pdfFile, options = {}) {
  const { scale = 2, page = 1 } = options;

  // Read the PDF file as ArrayBuffer
  const arrayBuffer = await pdfFile.arrayBuffer();

  // Load the PDF document
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    cMapUrl: 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.530/cmaps/',
    cMapPacked: true,
  }).promise;

  console.log(`[pdfToImage] PDF loaded: ${pdf.numPages} page(s)`);

  // Get the requested page
  const pageNum = Math.min(page, pdf.numPages);
  const pdfPage = await pdf.getPage(pageNum);

  // Get viewport at the desired scale
  const viewport = pdfPage.getViewport({ scale });

  // Create a canvas to render the PDF page
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');

  // Fill with white background
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Render the PDF page to canvas
  await pdfPage.render({
    canvasContext: context,
    viewport: viewport,
  }).promise;

  console.log(`[pdfToImage] Page ${pageNum} rendered: ${canvas.width}x${canvas.height}`);

  // Convert canvas to PNG blob
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/png', 1.0);
  });

  // Create a new File object with the original name but .png extension
  const pngName = pdfFile.name.replace(/\.pdf$/i, '.png');
  const pngFile = new File([blob], pngName, { type: 'image/png' });

  console.log(`[pdfToImage] Converted "${pdfFile.name}" to "${pngName}" (${(pngFile.size / 1024).toFixed(1)} KB)`);

  // Clean up
  pdf.destroy();

  return pngFile;
}

/**
 * Check if a file is a PDF
 * @param {File} file - The file to check
 * @returns {boolean}
 */
export function isPdfFile(file) {
  return file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');
}
