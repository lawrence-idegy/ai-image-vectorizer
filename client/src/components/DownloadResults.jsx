import { useState } from 'react';
import { Icon } from '@iconify/react';
import { downloadSVGFile, exportAsAI, exportAsPDF } from '../utils/exportUtils';

// Auto-naming helper functions
function sanitizeFilename(str) {
  if (!str) return '';
  return str
    .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '_')            // Replace spaces with underscores
    .replace(/_+/g, '_')             // Remove duplicate underscores
    .slice(0, 50);                    // Limit length
}

function generateFilename(clientName, projectName, extension) {
  const client = sanitizeFilename(clientName) || 'Client';
  const project = sanitizeFilename(projectName) || 'Logo';
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') + '_' +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');

  return `${client}_${project}_${timestamp}.${extension}`;
}

function DownloadResults({ svgContent, clientName, projectName, onStartOver }) {
  const [downloading, setDownloading] = useState(null);

  // Parse SVG dimensions for export
  const getSvgDimensions = () => {
    const widthMatch = svgContent.match(/width="(\d+)"/);
    const heightMatch = svgContent.match(/height="(\d+)"/);
    const viewBoxMatch = svgContent.match(/viewBox="[\d\s]+ (\d+) (\d+)"/);

    let width = widthMatch ? parseInt(widthMatch[1]) : 800;
    let height = heightMatch ? parseInt(heightMatch[1]) : 600;

    // Try viewBox if explicit dimensions are missing
    if (!widthMatch && viewBoxMatch) {
      width = parseInt(viewBoxMatch[1]);
      height = parseInt(viewBoxMatch[2]);
    }

    return { width, height };
  };

  const handleDownloadSVG = async () => {
    setDownloading('svg');
    try {
      const filename = generateFilename(clientName, projectName, 'svg');
      downloadSVGFile(svgContent, filename);
    } finally {
      setTimeout(() => setDownloading(null), 500);
    }
  };

  const handleDownloadAI = async () => {
    setDownloading('ai');
    try {
      const { width, height } = getSvgDimensions();
      const filename = generateFilename(clientName, projectName, 'ai');
      await exportAsAI(svgContent, width, height, filename);
    } finally {
      setTimeout(() => setDownloading(null), 500);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading('pdf');
    try {
      const { width, height } = getSvgDimensions();
      const filename = generateFilename(clientName, projectName, 'pdf');
      await exportAsPDF(svgContent, width, height, filename);
    } finally {
      setTimeout(() => setDownloading(null), 500);
    }
  };

  const handleDownloadPNG = async () => {
    setDownloading('png');
    try {
      const filename = generateFilename(clientName, projectName, 'png');

      // Create a canvas to render SVG at high resolution
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const { width, height } = getSvgDimensions();

      // 2x resolution for crisp output
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      ctx.scale(scale, scale);

      // Create an image from SVG
      const img = new Image();
      const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      // DO NOT fill background - keep transparency
      // ctx.fillStyle = 'white';
      // ctx.fillRect(0, 0, width, height);

      // Draw the image (transparency preserved)
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);

      // Download as PNG
      const pngUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = pngUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setTimeout(() => setDownloading(null), 500);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-8 animate-fade-in overflow-y-auto">
      <div className="w-full max-w-2xl">
        {/* Preview */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/30 overflow-hidden mb-8 card-hover">
          <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
            <span className="text-sm text-gray-500 dark:text-gray-400">Preview</span>
          </div>
          <div
            className="p-8 flex items-center justify-center min-h-[300px] bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHZpZXdCb3g9IjAgMCAyMCAyMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiNmM2YzZjMiLz48cmVjdCB4PSIxMCIgeT0iMTAiIHdpZHRoPSIxMCIgaGVpZ2h0PSIxMCIgZmlsbD0iI2YzZjNmMyIvPjwvc3ZnPg==')]"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              className="preview-svg-container"
              dangerouslySetInnerHTML={{ __html: svgContent }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                maxWidth: '100%',
                maxHeight: '400px',
              }}
            />
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full mb-4 animate-success">
            <Icon icon="mdi:check-circle" className="w-5 h-5" />
            Your logo is ready!
          </div>
        </div>

        {/* Download Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {/* AI/EPS Button */}
          <button
            onClick={handleDownloadAI}
            disabled={downloading}
            className="group relative flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-0 p-4 sm:p-6 bg-idegy-navy dark:bg-white text-white dark:text-idegy-navy rounded-2xl hover:bg-idegy-navy-dark dark:hover:bg-gray-100 transition-all shadow-md hover:shadow-lg hover:-translate-y-1 active:scale-[0.98] disabled:opacity-70"
          >
            {downloading === 'ai' ? (
              <Icon icon="mdi:loading" className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Icon icon="mdi:adobe" className="w-8 h-8 sm:mb-2" />
                <div className="text-left sm:text-center">
                  <span className="font-semibold">AI/EPS</span>
                  <span className="text-xs text-white/70 dark:text-idegy-navy/60 sm:mt-1 ml-2 sm:ml-0 sm:block">Illustrator</span>
                </div>
              </>
            )}
          </button>

          {/* PDF Button */}
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="group relative flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-0 p-4 sm:p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl hover:border-idegy-navy dark:hover:border-idegy-blue hover:text-idegy-navy dark:hover:text-idegy-blue transition-all shadow-md hover:shadow-lg dark:shadow-black/30 hover:-translate-y-1 active:scale-[0.98] disabled:opacity-70"
          >
            {downloading === 'pdf' ? (
              <Icon icon="mdi:loading" className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Icon icon="mdi:file-pdf-box" className="w-8 h-8 sm:mb-2" />
                <div className="text-left sm:text-center">
                  <span className="font-semibold">PDF</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 sm:mt-1 ml-2 sm:ml-0 sm:block">Print</span>
                </div>
              </>
            )}
          </button>

          {/* SVG Button */}
          <button
            onClick={handleDownloadSVG}
            disabled={downloading}
            className="group relative flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-0 p-4 sm:p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl hover:border-idegy-navy dark:hover:border-idegy-blue hover:text-idegy-navy dark:hover:text-idegy-blue transition-all shadow-md hover:shadow-lg dark:shadow-black/30 hover:-translate-y-1 active:scale-[0.98] disabled:opacity-70"
          >
            {downloading === 'svg' ? (
              <Icon icon="mdi:loading" className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Icon icon="mdi:vector-triangle" className="w-8 h-8 sm:mb-2" />
                <div className="text-left sm:text-center">
                  <span className="font-semibold">SVG</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 sm:mt-1 ml-2 sm:ml-0 sm:block">Web/Figma</span>
                </div>
              </>
            )}
          </button>

          {/* PNG Button */}
          <button
            onClick={handleDownloadPNG}
            disabled={downloading}
            className="group relative flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-0 p-4 sm:p-6 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 rounded-2xl hover:border-idegy-navy dark:hover:border-idegy-blue hover:text-idegy-navy dark:hover:text-idegy-blue transition-all shadow-md hover:shadow-lg dark:shadow-black/30 hover:-translate-y-1 active:scale-[0.98] disabled:opacity-70"
          >
            {downloading === 'png' ? (
              <Icon icon="mdi:loading" className="w-8 h-8 animate-spin" />
            ) : (
              <>
                <Icon icon="mdi:file-image" className="w-8 h-8 sm:mb-2" />
                <div className="text-left sm:text-center">
                  <span className="font-semibold">PNG</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 sm:mt-1 ml-2 sm:ml-0 sm:block">High-res</span>
                </div>
              </>
            )}
          </button>
        </div>

        {/* File naming preview */}
        <div className="text-center text-sm text-gray-400 dark:text-gray-500 mb-6">
          Files will be named: {generateFilename(clientName, projectName, 'svg').replace('.svg', '.*')}
        </div>

        {/* Start Over Button */}
        <div className="text-center">
          <button
            onClick={onStartOver}
            className="inline-flex items-center gap-2 px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
          >
            <Icon icon="mdi:refresh" className="w-5 h-5" />
            Upload Another
          </button>
        </div>
      </div>
    </div>
  );
}

export default DownloadResults;
