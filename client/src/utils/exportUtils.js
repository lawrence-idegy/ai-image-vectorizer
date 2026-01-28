/**
 * Export Utilities
 * Shared functions for exporting canvas content in various formats
 */

/**
 * Sanitize SVG content by removing script tags
 * Protects against browser extension injection
 */
export const sanitizeSVG = (svgContent) => {
  if (!svgContent) return '';
  return svgContent
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/>/gi, '');
};

/**
 * Download file using data URL
 */
export const downloadFile = (dataUrl, filename) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Download SVG file using base64 encoding
 * Uses base64 data URL to bypass Blob interception by browser extensions
 */
export const downloadSVGFile = (svgContent, filename) => {
  const cleanSVG = sanitizeSVG(svgContent);
  const base64 = btoa(unescape(encodeURIComponent(cleanSVG)));
  const dataUrl = `data:image/svg+xml;base64,${base64}`;
  downloadFile(dataUrl, filename);
};

/**
 * Export canvas as PDF
 */
export const exportAsPDF = async (svgString, width, height, filename = 'canvas-export.pdf') => {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgElement = svgDoc.documentElement;

  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
  });

  await pdf.svg(svgElement, { x: 0, y: 0, width, height });
  pdf.save(filename);
};

/**
 * Export canvas as AI (Adobe Illustrator)
 * Creates a PDF with AI-compatible metadata
 */
export const exportAsAI = async (svgString, width, height, filename = 'canvas-export.ai') => {
  const { jsPDF } = await import('jspdf');
  await import('svg2pdf.js');

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgElement = svgDoc.documentElement;

  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
  });

  pdf.setProperties({
    title: 'Canvas Export',
    creator: 'idegy Vectorizer',
    subject: 'Vector Graphics',
  });

  await pdf.svg(svgElement, { x: 0, y: 0, width, height });
  pdf.save(filename);
};

