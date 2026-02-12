/**
 * Color Segmentation Module
 *
 * Handles:
 * - Automatic color palette detection
 * - K-means clustering for color quantization
 * - Region segmentation by color
 * - Sub-pixel precision from anti-aliasing analysis
 */

const sharp = require('sharp');

class ColorSegmenter {
  constructor(options = {}) {
    this.maxColors = options.maxColors || 256;
    this.colorTolerance = options.colorTolerance || 0.02;
    this.minArea = options.minArea || 2;
    // Gaussian blur for anti-aliasing smoothing (0 = disabled, 0.5-1.0 recommended)
    this.blurSigma = options.blurSigma !== undefined ? options.blurSigma : 0.7;
    // Palette snapping options
    this.palette = options.palette || null; // Predefined palette to snap to
    this.paletteTolerance = options.paletteTolerance || 30; // Color distance threshold for snapping
  }

  /**
   * Segment image into color regions
   * @param {Buffer} imageBuffer
   * @returns {Promise<{width, height, regions, palette}>}
   */
  async segment(imageBuffer) {
    // Get raw pixel data with optional preprocessing
    let image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    // Apply Gaussian blur to smooth anti-aliased edges before quantization
    // This reduces color fringing and produces cleaner region boundaries
    if (this.blurSigma > 0) {
      image = image.blur(this.blurSigma);
    }

    // Get RGBA pixel data
    const { data } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Step 1: Build color histogram
    const colorCounts = this.buildColorHistogram(data, width, height);

    // Step 2: Quantize to palette (or use predefined palette)
    let palette;
    if (this.palette && this.palette.length > 0) {
      // Use predefined palette with snapping
      palette = this.snapToPalette(colorCounts, this.palette, this.paletteTolerance);
      console.log(`[ColorSegmenter] Snapped to ${palette.length} colors from predefined palette`);
    } else {
      palette = this.quantizeColors(colorCounts, this.maxColors);
      console.log(`[ColorSegmenter] Quantized to ${palette.length} colors`);
    }

    // Step 3: Map each pixel to nearest palette color
    const pixelMap = this.mapPixelsToPalette(data, width, height, palette);

    // Step 4: Extract connected regions for each color
    const regions = this.extractRegions(pixelMap, width, height, palette);

    return { width, height, regions, palette };
  }

  /**
   * Build histogram of colors in the image
   */
  buildColorHistogram(data, width, height) {
    const colorCounts = new Map();

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Skip semi-transparent and transparent pixels
      // This gives cleaner vectorization by ignoring anti-aliased edges
      if (a < 128) continue;

      // Quantize to reduce unique colors (5-bit per channel initially)
      const qr = Math.round(r / 8) * 8;
      const qg = Math.round(g / 8) * 8;
      const qb = Math.round(b / 8) * 8;
      // Treat all pixels as fully opaque for clean regions
      const qa = 255;

      const key = `${qr},${qg},${qb},${qa}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }

    return colorCounts;
  }

  /**
   * Quantize colors using median cut algorithm
   */
  quantizeColors(colorCounts, maxColors) {
    // Convert to array of [color, count]
    const colors = [];
    for (const [key, count] of colorCounts) {
      const [r, g, b, a] = key.split(',').map(Number);
      colors.push({ r, g, b, a, count });
    }

    // If already under limit, return as-is
    if (colors.length <= maxColors) {
      return colors.map(c => ({ r: c.r, g: c.g, b: c.b, a: c.a }));
    }

    // Median cut algorithm
    const buckets = [colors];

    while (buckets.length < maxColors) {
      // Find bucket with largest range
      let maxRange = -1;
      let maxBucketIdx = 0;
      let splitChannel = 'r';

      for (let i = 0; i < buckets.length; i++) {
        const bucket = buckets[i];
        if (bucket.length < 2) continue;

        for (const channel of ['r', 'g', 'b']) {
          const values = bucket.map(c => c[channel]);
          const range = Math.max(...values) - Math.min(...values);
          if (range > maxRange) {
            maxRange = range;
            maxBucketIdx = i;
            splitChannel = channel;
          }
        }
      }

      if (maxRange <= 0) break;

      // Split the bucket
      const bucket = buckets[maxBucketIdx];
      bucket.sort((a, b) => a[splitChannel] - b[splitChannel]);
      const mid = Math.floor(bucket.length / 2);

      buckets.splice(maxBucketIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    // Compute average color for each bucket
    const palette = buckets.map(bucket => {
      if (bucket.length === 0) return null;

      let totalWeight = 0;
      let r = 0, g = 0, b = 0, a = 0;

      for (const color of bucket) {
        const weight = color.count;
        totalWeight += weight;
        r += color.r * weight;
        g += color.g * weight;
        b += color.b * weight;
        a += color.a * weight;
      }

      return {
        r: Math.round(r / totalWeight),
        g: Math.round(g / totalWeight),
        b: Math.round(b / totalWeight),
        a: Math.round(a / totalWeight)
      };
    }).filter(c => c !== null);

    return palette;
  }

  /**
   * Snap detected colors to a predefined palette
   * @param {Map} colorCounts - Histogram of detected colors
   * @param {Array} predefinedPalette - Array of {r, g, b, a} colors
   * @param {number} tolerance - Maximum color distance for snapping
   * @returns {Array} Colors from predefined palette that match detected colors
   */
  snapToPalette(colorCounts, predefinedPalette, tolerance) {
    const usedColors = new Set();

    // For each detected color, find closest in predefined palette
    for (const [key, count] of colorCounts) {
      const [r, g, b, a] = key.split(',').map(Number);

      let minDist = Infinity;
      let closestIdx = -1;

      for (let i = 0; i < predefinedPalette.length; i++) {
        const pc = predefinedPalette[i];
        const dist = this.colorDistanceRGB(r, g, b, pc.r, pc.g, pc.b);
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      // Only include if within tolerance
      if (minDist <= tolerance && closestIdx >= 0) {
        usedColors.add(closestIdx);
      }
    }

    // Return only the palette colors that were matched
    return Array.from(usedColors).map(idx => ({
      r: predefinedPalette[idx].r,
      g: predefinedPalette[idx].g,
      b: predefinedPalette[idx].b,
      a: predefinedPalette[idx].a !== undefined ? predefinedPalette[idx].a : 255
    }));
  }

  /**
   * Map each pixel to its nearest palette color
   */
  mapPixelsToPalette(data, width, height, palette) {
    // Use 65535 as "transparent" marker
    const TRANSPARENT = 65535;
    const pixelMap = new Uint16Array(width * height);
    pixelMap.fill(TRANSPARENT);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        // Skip semi-transparent pixels (consistent with histogram building)
        if (a < 128) continue;

        // Find nearest palette color (ignoring alpha since all are 255)
        let minDist = Infinity;
        let nearestIdx = 0;

        for (let p = 0; p < palette.length; p++) {
          const pc = palette[p];
          const dist = this.colorDistanceRGB(r, g, b, pc.r, pc.g, pc.b);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = p;
          }
        }

        pixelMap[y * width + x] = nearestIdx;
      }
    }

    return pixelMap;
  }

  /**
   * Calculate RGB color distance (no alpha)
   */
  colorDistanceRGB(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /**
   * Calculate color distance (weighted Euclidean)
   */
  colorDistance(r1, g1, b1, a1, r2, g2, b2, a2) {
    // Weight alpha heavily - transparent vs opaque is important
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    const da = (a1 - a2) * 2; // Double weight for alpha

    return Math.sqrt(dr * dr + dg * dg + db * db + da * da);
  }

  /**
   * Extract connected regions for each color using flood fill
   */
  extractRegions(pixelMap, width, height, palette) {
    const TRANSPARENT = 65535;
    const visited = new Uint8Array(width * height);
    const regions = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const colorIdx = pixelMap[idx];

        // Skip transparent pixels
        if (colorIdx === TRANSPARENT) {
          visited[idx] = 1;
          continue;
        }

        const pixels = this.floodFill(pixelMap, visited, x, y, width, height, colorIdx);

        if (pixels.length >= this.minArea) {
          regions.push({
            color: palette[colorIdx],
            colorIndex: colorIdx,
            pixels: pixels,
            bounds: this.calculateBounds(pixels)
          });
        }
      }
    }

    // Sort regions by size (largest first) for proper stacking
    regions.sort((a, b) => b.pixels.length - a.pixels.length);

    return regions;
  }

  /**
   * Flood fill to find connected pixels of same color
   */
  floodFill(pixelMap, visited, startX, startY, width, height, targetColor) {
    const pixels = [];
    const stack = [[startX, startY]];

    while (stack.length > 0) {
      const [x, y] = stack.pop();

      if (x < 0 || x >= width || y < 0 || y >= height) continue;

      const idx = y * width + x;
      if (visited[idx]) continue;
      if (pixelMap[idx] !== targetColor) continue;

      visited[idx] = 1;
      pixels.push({ x, y });

      // 4-connected neighbors
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }

    return pixels;
  }

  /**
   * Calculate bounding box for a set of pixels
   */
  calculateBounds(pixels) {
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of pixels) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
}

module.exports = ColorSegmenter;
