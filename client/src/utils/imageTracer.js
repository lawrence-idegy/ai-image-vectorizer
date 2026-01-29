import { potrace, init as initPotrace } from 'esm-potrace-wasm';

let potraceReady = false;

/**
 * Trace a raster image to SVG client-side using Potrace (via WASM).
 * Potrace produces mathematically smooth Bezier curves - the same algorithm
 * used by Inkscape and Google's SVGcode. This preserves detail faithfully
 * rather than AI-based vectorization which reinterprets the image.
 *
 * @param {File} file - Image file to trace
 * @param {object} options - Tracing options override
 * @returns {Promise<string>} SVG string
 */
export async function traceImageToSvg(file, options = {}) {
  // Initialize Potrace WASM once
  if (!potraceReady) {
    await initPotrace();
    potraceReady = true;
  }

  // Load image file into an Image element
  const img = await loadImageFromFile(file);

  // Draw to canvas (Potrace accepts HTMLCanvasElement)
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // Upscale small images for smoother trace curves
  let scale = 1;
  const minDim = 800;
  if (width < minDim && height < minDim) {
    scale = 2;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // Cap at 4096px to avoid memory issues
  const maxDim = 4096;
  if (width > maxDim || height > maxDim) {
    const downscale = maxDim / Math.max(width, height);
    width = Math.round(width * downscale);
    height = Math.round(height * downscale);
  }

  canvas.width = width;
  canvas.height = height;

  // Fill with white background (for images with transparency)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // High-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  // Configure Potrace options for logo/graphic tracing
  const potraceOptions = {
    turdsize: 2,                  // Suppress speckles up to this size
    turnpolicy: 4,                // TURNPOLICY_MINORITY - good for logos
    alphamax: 1,                  // Corner threshold (1 = smooth curves)
    opticurve: 1,                 // Enable curve optimization
    opttolerance: 0.2,            // Curve optimization tolerance
    pathonly: false,               // Full SVG (not just paths)
    extractcolors: true,          // Extract actual colors from image
    posterizelevel: 6,            // Color layers (higher = more colors captured)
    posterizationalgorithm: 0,    // Simple posterization (better for flat colors)
    ...options,
  };

  // Run Potrace on the canvas
  const svgString = await potrace(canvas, potraceOptions);

  return svgString;
}

/**
 * Load an image File into an HTMLImageElement
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
