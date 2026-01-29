import ImageTracer from 'imagetracerjs';

/**
 * Trace a raster image to SVG client-side using imagetracerjs.
 * This produces a faithful bitmap trace (like Illustrator's Image Trace)
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

  // Use the image's natural dimensions (or scale for very large images)
  let width = img.naturalWidth;
  let height = img.naturalHeight;

  // Cap at 4096px on longest side to avoid memory issues
  const maxDim = 4096;
  if (width > maxDim || height > maxDim) {
    const scale = maxDim / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  canvas.width = width;
  canvas.height = height;

  // Fill with white background first (for images with transparency)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Draw the image
  ctx.drawImage(img, 0, 0, width, height);

  // Get ImageData
  const imageData = ctx.getImageData(0, 0, width, height);

  // Configure tracing options optimized for logos/graphics
  const traceOptions = {
    // Tracing - low thresholds for maximum detail preservation
    ltres: 0.1,                // Line threshold (lower = more detail)
    qtres: 0.1,                // Quadratic spline threshold (lower = more detail)
    pathomit: 4,               // Remove paths smaller than this (reduces noise)
    rightangleenhance: true,   // Enhance right angles (good for logos/text)

    // Color quantization
    numberofcolors: 24,        // Good balance for logos with solid colors
    colorsampling: 2,          // Deterministic square sampling
    colorquantcycles: 3,       // Multiple passes for better color detection
    mincolorratio: 0,          // Keep all colors

    // Layering
    layering: 0,               // Sequential (0) works better for cleanup editor

    // SVG rendering
    strokewidth: 0,            // No strokes, fills only
    linefilter: false,         // Keep all lines
    scale: 1,                  // 1:1 scale
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
