/**
 * Mask utility functions for manipulation operations
 */

/**
 * Feather (blur) the mask edges
 * @param {Uint8Array} mask - The mask data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} radius - Feather radius in pixels
 * @returns {Uint8Array} - New feathered mask
 */
export function featherMask(mask, width, height, radius = 3) {
  const result = new Uint8Array(mask.length);
  const kernel = createGaussianKernel(radius);
  const kernelSize = kernel.length;
  const halfKernel = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;

      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const px = x + kx - halfKernel;
          const py = y + ky - halfKernel;

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = py * width + px;
            const weight = kernel[ky][kx];
            sum += mask[idx] * weight;
            weightSum += weight;
          }
        }
      }

      const idx = y * width + x;
      result[idx] = Math.round(sum / weightSum);
    }
  }

  return result;
}

/**
 * Create a Gaussian kernel for blurring
 */
function createGaussianKernel(radius) {
  const size = radius * 2 + 1;
  const kernel = [];
  const sigma = radius / 3;
  const sigma2 = 2 * sigma * sigma;

  for (let y = 0; y < size; y++) {
    kernel[y] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - radius;
      const dy = y - radius;
      kernel[y][x] = Math.exp(-(dx * dx + dy * dy) / sigma2);
    }
  }

  return kernel;
}

/**
 * Grow (dilate) the mask selection
 * @param {Uint8Array} mask - The mask data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} pixels - Number of pixels to grow
 * @returns {Uint8Array} - New grown mask
 */
export function growMask(mask, width, height, pixels = 2) {
  let result = new Uint8Array(mask);

  for (let i = 0; i < pixels; i++) {
    const temp = new Uint8Array(result);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        if (result[idx] > 127) continue;

        // Check 8-connected neighbors
        const neighbors = [
          y > 0 ? result[(y - 1) * width + x] : 0,
          y < height - 1 ? result[(y + 1) * width + x] : 0,
          x > 0 ? result[y * width + (x - 1)] : 0,
          x < width - 1 ? result[y * width + (x + 1)] : 0,
          y > 0 && x > 0 ? result[(y - 1) * width + (x - 1)] : 0,
          y > 0 && x < width - 1 ? result[(y - 1) * width + (x + 1)] : 0,
          y < height - 1 && x > 0 ? result[(y + 1) * width + (x - 1)] : 0,
          y < height - 1 && x < width - 1 ? result[(y + 1) * width + (x + 1)] : 0
        ];

        if (neighbors.some(n => n > 127)) {
          temp[idx] = 255;
        }
      }
    }

    result = temp;
  }

  return result;
}

/**
 * Shrink (erode) the mask selection
 * @param {Uint8Array} mask - The mask data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} pixels - Number of pixels to shrink
 * @returns {Uint8Array} - New shrunk mask
 */
export function shrinkMask(mask, width, height, pixels = 2) {
  let result = new Uint8Array(mask);

  for (let i = 0; i < pixels; i++) {
    const temp = new Uint8Array(result);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        if (result[idx] <= 127) continue;

        // Check 4-connected neighbors
        const neighbors = [
          y > 0 ? result[(y - 1) * width + x] : 0,
          y < height - 1 ? result[(y + 1) * width + x] : 0,
          x > 0 ? result[y * width + (x - 1)] : 0,
          x < width - 1 ? result[y * width + (x + 1)] : 0
        ];

        if (neighbors.some(n => n <= 127)) {
          temp[idx] = 0;
        }
      }
    }

    result = temp;
  }

  return result;
}

/**
 * Invert the mask
 * @param {Uint8Array} mask - The mask data
 * @returns {Uint8Array} - Inverted mask
 */
export function invertMask(mask) {
  const result = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    result[i] = 255 - mask[i];
  }
  return result;
}

/**
 * Check if mask has any selection
 * @param {Uint8Array} mask - The mask data
 * @returns {boolean} - True if any pixels are selected
 */
export function hasSelection(mask) {
  if (!mask) return false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0) return true;
  }
  return false;
}

/**
 * Get selection bounds
 * @param {Uint8Array} mask - The mask data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {Object} - Bounding box { minX, minY, maxX, maxY }
 */
export function getSelectionBounds(mask, width, height) {
  let minX = width, minY = height, maxX = 0, maxY = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (mask[idx] > 127) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Apply mask to create transparent image
 * @param {ImageData} imageData - Source image data
 * @param {Uint8Array} mask - The mask data (255 = remove, 0 = keep)
 * @returns {ImageData} - New image data with transparency
 */
export function applyMaskToImage(imageData, mask) {
  const result = new ImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height
  );

  for (let i = 0; i < mask.length; i++) {
    const idx = i * 4;
    // Apply mask to alpha channel (255 in mask = transparent)
    result.data[idx + 3] = Math.max(0, result.data[idx + 3] - mask[i]);
  }

  return result;
}

/**
 * Convert mask to PNG data URL
 * @param {Uint8Array} mask - The mask data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} - Data URL of mask as grayscale PNG
 */
export function maskToDataURL(mask, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.createImageData(width, height);

  for (let i = 0; i < mask.length; i++) {
    const idx = i * 4;
    imgData.data[idx] = mask[i];
    imgData.data[idx + 1] = mask[i];
    imgData.data[idx + 2] = mask[i];
    imgData.data[idx + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
