import ImageTracer from 'imagetracerjs';

/**
 * Trace a raster image to SVG client-side using imagetracerjs.
 * This produces a faithful bitmap trace (preserves actual shapes)
 * rather than AI-based vectorization which reinterprets the image.
 *
 * @param {File} file - Image file to trace
 * @param {object} options - Tracing options
 * @returns {Promise<string>} SVG string
 */
export async function traceImageToSvg(file, options = {}) {
  // Load image file into an Image element
  const img = await loadImageFromFile(file);

  // Draw to canvas to get ImageData
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // Track scale factor for SVG output
  let svgScale = 1;

  // Upscale small images for smoother trace curves
  // Small images produce jagged paths; tracing at 2x gives smoother output
  const minDim = 800;
  if (width < minDim && height < minDim) {
    svgScale = 0.5; // Scale SVG coordinates back to original size
    width = Math.round(width * 2);
    height = Math.round(height * 2);
  }

  // Cap at 4096px on longest side to avoid memory issues
  const maxDim = 4096;
  if (width > maxDim || height > maxDim) {
    const downscale = maxDim / Math.max(width, height);
    width = Math.round(width * downscale);
    height = Math.round(height * downscale);
    svgScale = 1;
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

  // Get ImageData
  const imageData = ctx.getImageData(0, 0, width, height);

  // Configure tracing options optimized for logos/graphics
  const traceOptions = {
    // Tracing - default thresholds for smooth curves
    ltres: 1,                  // Line threshold (higher = smoother lines)
    qtres: 1,                  // Curve threshold (higher = smoother curves)
    pathomit: 8,               // Remove tiny noise paths
    rightangleenhance: true,   // Enhance right angles (good for logos/text)

    // Color quantization - 48 colors captures all color areas
    // including small details like red elements on logos
    numberofcolors: 48,
    colorsampling: 2,          // Deterministic square sampling
    colorquantcycles: 3,       // Multiple passes for better color detection
    mincolorratio: 0,          // Keep all colors

    // Layering
    layering: 0,               // Sequential layering (better for cleanup editor)

    // SVG rendering
    strokewidth: 0,            // No strokes, fills only
    linefilter: false,         // Keep all lines
    scale: svgScale,           // Scale back if we upscaled the input
    roundcoords: 2,            // 2 decimal places
    viewbox: true,             // Use viewBox for scalability
    desc: false,               // No description metadata

    // Blur
    blurradius: 0,             // No blur - preserve sharp edges
    blurdelta: 20,

    // Allow overrides
    ...options,
  };

  // Run the trace
  const svgString = ImageTracer.imagedataToSVG(imageData, traceOptions);

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
