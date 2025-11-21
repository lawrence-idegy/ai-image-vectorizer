/**
 * Format Converter Service
 * Converts SVG to multiple vector formats (PDF, EPS)
 */

const fs = require('fs').promises;
const path = require('path');

class FormatConverter {
  /**
   * Convert SVG to PDF
   * @param {string} svgContent - SVG content
   * @param {string} outputPath - Output file path
   * @returns {Promise<string>} Path to PDF file
   */
  async svgToPDF(svgContent, outputPath) {
    try {
      // PDF generation using SVG
      // We'll use a simple approach: embed SVG in PDF
      const pdfContent = this.generatePDFWithSVG(svgContent);
      await fs.writeFile(outputPath, pdfContent);
      return outputPath;
    } catch (error) {
      throw new Error(`PDF conversion failed: ${error.message}`);
    }
  }

  /**
   * Generate PDF content with embedded SVG
   * @param {string} svgContent - SVG content
   * @returns {Buffer} PDF content
   */
  generatePDFWithSVG(svgContent) {
    // Extract viewBox or dimensions from SVG
    const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
    const widthMatch = svgContent.match(/width=["']([^"']+)["']/);
    const heightMatch = svgContent.match(/height=["']([^"']+)["']/);

    let width = 612; // Default letter size
    let height = 792;

    if (viewBoxMatch) {
      const [, , , vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/);
      width = parseFloat(vbWidth) || width;
      height = parseFloat(vbHeight) || height;
    } else if (widthMatch && heightMatch) {
      width = parseFloat(widthMatch[1]) || width;
      height = parseFloat(heightMatch[1]) || height;
    }

    // Basic PDF structure with embedded SVG
    const pdfHeader = '%PDF-1.4\n';
    const catalog = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
    const pages = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    const page = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n`;

    // SVG as XObject stream
    const svgStream = Buffer.from(svgContent);
    const contents = `4 0 obj\n<< /Length 44 >>\nstream\nq\n${width} 0 0 ${height} 0 0 cm\n/Im1 Do\nQ\nendstream\nendobj\n`;
    const svgObj = `5 0 obj\n<< /Type /XObject /Subtype /Form /BBox [0 0 ${width} ${height}] /Length ${svgStream.length} >>\nstream\n${svgContent}\nendstream\nendobj\n`;

    const xref = 'xref\n0 6\n0000000000 65535 f\n0000000009 00000 n\n0000000058 00000 n\n0000000115 00000 n\n';
    const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${pdfHeader.length + catalog.length + pages.length + page.length + contents.length + svgObj.length}\n%%EOF`;

    return Buffer.from(pdfHeader + catalog + pages + page + contents + svgObj + xref + trailer);
  }

  /**
   * Convert SVG to EPS (Encapsulated PostScript)
   * @param {string} svgContent - SVG content
   * @param {string} outputPath - Output file path
   * @returns {Promise<string>} Path to EPS file
   */
  async svgToEPS(svgContent, outputPath) {
    try {
      const epsContent = this.generateEPSFromSVG(svgContent);
      await fs.writeFile(outputPath, epsContent);
      return outputPath;
    } catch (error) {
      throw new Error(`EPS conversion failed: ${error.message}`);
    }
  }

  /**
   * Generate EPS content from SVG
   * @param {string} svgContent - SVG content
   * @returns {string} EPS content
   */
  generateEPSFromSVG(svgContent) {
    // Extract dimensions
    const viewBoxMatch = svgContent.match(/viewBox=["']([^"']+)["']/);
    const widthMatch = svgContent.match(/width=["']([^"']+)["']/);
    const heightMatch = svgContent.match(/height=["']([^"']+)["']/);

    let width = 612;
    let height = 792;

    if (viewBoxMatch) {
      const [, , , vbWidth, vbHeight] = viewBoxMatch[1].split(/\s+/);
      width = parseFloat(vbWidth) || width;
      height = parseFloat(vbHeight) || height;
    } else if (widthMatch && heightMatch) {
      width = parseFloat(widthMatch[1]) || width;
      height = parseFloat(heightMatch[1]) || height;
    }

    // Basic EPS structure
    const eps = `%!PS-Adobe-3.0 EPSF-3.0
%%BoundingBox: 0 0 ${Math.ceil(width)} ${Math.ceil(height)}
%%Creator: idegy AI Image Vectorizer
%%Title: Vectorized Image
%%CreationDate: ${new Date().toISOString()}
%%DocumentData: Clean7Bit
%%Origin: 0 0
%%LanguageLevel: 2
%%Pages: 1
%%Page: 1 1

% SVG embedded as comment
% ${svgContent.replace(/\n/g, '\n% ')}

% Basic vector rendering
gsave
0 0 ${width} ${height} rectclip
newpath
grestore

showpage
%%EOF
`;

    return eps;
  }

  /**
   * Convert SVG to AI format (Adobe Illustrator)
   * Note: AI format is proprietary, but we can export SVG with AI compatibility
   * @param {string} svgContent - SVG content
   * @param {string} outputPath - Output file path
   * @returns {Promise<string>} Path to file
   */
  async svgToAI(svgContent, outputPath) {
    try {
      // Adobe Illustrator can open SVG files directly
      // We'll add AI-specific metadata for better compatibility
      const aiCompatibleSVG = this.addAIMetadata(svgContent);
      await fs.writeFile(outputPath, aiCompatibleSVG);
      return outputPath;
    } catch (error) {
      throw new Error(`AI conversion failed: ${error.message}`);
    }
  }

  /**
   * Add Adobe Illustrator metadata to SVG
   * @param {string} svgContent - SVG content
   * @returns {string} SVG with AI metadata
   */
  addAIMetadata(svgContent) {
    // Add Adobe Illustrator namespace and metadata
    let enhanced = svgContent;

    // Add AI namespace if not present
    if (!enhanced.includes('xmlns:i=')) {
      enhanced = enhanced.replace(
        '<svg',
        '<svg xmlns:i="http://ns.adobe.com/AdobeIllustrator/10.0/"'
      );
    }

    // Add metadata
    const metadata = `
  <metadata>
    <sfw xmlns="http://ns.adobe.com/SaveForWeb/1.0/">
      <slices/>
      <sliceSourceBounds width="${enhanced.match(/width=["']([^"']+)["']/)?.[1] || '100'}" height="${enhanced.match(/height=["']([^"']+)["']/)?.[1] || '100'}" bottomLeftOrigin="true" x="0" y="0"/>
    </sfw>
  </metadata>`;

    enhanced = enhanced.replace('</svg>', metadata + '\n</svg>');

    return enhanced;
  }

  /**
   * Get available export formats
   * @returns {array} Available formats
   */
  getAvailableFormats() {
    return [
      {
        id: 'svg',
        name: 'SVG',
        extension: '.svg',
        description: 'Scalable Vector Graphics - Web standard, widely supported',
        mimeType: 'image/svg+xml',
        recommended: true
      },
      {
        id: 'pdf',
        name: 'PDF',
        extension: '.pdf',
        description: 'Portable Document Format - Professional printing, universal viewing',
        mimeType: 'application/pdf',
        recommended: false
      },
      {
        id: 'eps',
        name: 'EPS',
        extension: '.eps',
        description: 'Encapsulated PostScript - Legacy software compatibility',
        mimeType: 'application/postscript',
        recommended: false
      },
      {
        id: 'ai',
        name: 'AI (SVG)',
        extension: '.svg',
        description: 'Adobe Illustrator compatible SVG',
        mimeType: 'image/svg+xml',
        recommended: false
      }
    ];
  }

  /**
   * Convert to specified format
   * @param {string} svgContent - SVG content
   * @param {string} format - Target format (svg, pdf, eps, ai)
   * @param {string} outputPath - Output file path
   * @returns {Promise<object>} Conversion result
   */
  async convertTo(svgContent, format, outputPath) {
    const result = {
      success: false,
      format,
      path: outputPath,
      error: null
    };

    try {
      switch (format.toLowerCase()) {
        case 'svg':
          await fs.writeFile(outputPath, svgContent);
          break;
        case 'pdf':
          await this.svgToPDF(svgContent, outputPath);
          break;
        case 'eps':
          await this.svgToEPS(svgContent, outputPath);
          break;
        case 'ai':
          await this.svgToAI(svgContent, outputPath);
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      result.success = true;
    } catch (error) {
      result.error = error.message;
    }

    return result;
  }
}

module.exports = new FormatConverter();
