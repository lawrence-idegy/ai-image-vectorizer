/**
 * Color Extraction Module
 *
 * Extracts and preserves EXACT colors from images.
 *
 * Philosophy:
 * - Brand colors must be preserved pixel-perfect
 * - Only merge colors that are TRUE duplicates (anti-aliasing artifacts)
 * - Never quantize to arbitrary palette (loses brand identity)
 *
 * Process:
 * 1. Extract all unique colors from image
 * 2. Identify "core" colors (appear in significant areas)
 * 3. Map anti-aliased pixels to nearest core color
 * 4. Build color regions (connected pixels of same color)
 */

const sharp = require('sharp');

class ColorExtractor {
  constructor(options = {}) {
    // Anti-aliasing merge threshold (LAB color distance)
    // Low value = only merge nearly identical colors
    // This preserves brand colors while cleaning anti-aliasing
    this.antiAliasingThreshold = options.antiAliasingThreshold || 8;

    // Minimum region size (pixels) to be considered a "core" color
    // Smaller regions might be anti-aliasing artifacts
    this.minCoreColorPixels = options.minCoreColorPixels || 10;

    // Minimum region area to keep (prevents noise)
    this.minRegionArea = options.minRegionArea || 4;
  }

  /**
   * Extract colors and regions from image
   * @param {Buffer} imageBuffer - Input image
   * @returns {Object} { width, height, colors, regions, pixelMap }
   */
  async extract(imageBuffer) {
    console.log('[ColorExtractor] Starting extraction...');

    // Get raw pixel data
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    console.log(`[ColorExtractor] Image: ${width}x${height}, ${channels} channels`);

    // Step 1: Count all unique colors
    const colorCounts = this.countColors(data, width, height, channels);
    console.log(`[ColorExtractor] Found ${colorCounts.size} unique colors`);

    // Step 2: Identify core colors (significant coverage)
    const coreColors = this.identifyCoreColors(colorCounts);
    console.log(`[ColorExtractor] Identified ${coreColors.length} core colors`);

    // Step 3: Build color mapping (anti-aliased pixels → nearest core color)
    const colorMapping = this.buildColorMapping(colorCounts, coreColors);

    // Step 4: Create pixel map with mapped colors
    const pixelMap = this.createPixelMap(data, width, height, channels, colorMapping);

    // Step 5: Extract connected regions for each color
    const regions = this.extractRegions(pixelMap, width, height, coreColors);
    console.log(`[ColorExtractor] Extracted ${regions.length} regions`);

    // Log the color palette
    console.log('[ColorExtractor] Color palette:');
    coreColors.forEach((color, i) => {
      const hex = this.rgbToHex(color.r, color.g, color.b);
      console.log(`  ${i + 1}. ${hex} (${color.count} pixels, ${(color.coverage * 100).toFixed(1)}%)`);
    });

    return {
      width,
      height,
      colors: coreColors,
      regions,
      pixelMap
    };
  }

  /**
   * Count occurrences of each unique color
   */
  countColors(data, width, height, channels) {
    const colorCounts = new Map();
    const totalPixels = width * height;

    for (let i = 0; i < data.length; i += channels) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = channels === 4 ? data[i + 3] : 255;

      // Skip fully transparent pixels
      if (a < 10) continue;

      const key = `${r},${g},${b}`;
      const existing = colorCounts.get(key);

      if (existing) {
        existing.count++;
      } else {
        colorCounts.set(key, {
          r, g, b,
          count: 1,
          key
        });
      }
    }

    // Calculate coverage percentage
    for (const color of colorCounts.values()) {
      color.coverage = color.count / totalPixels;
    }

    return colorCounts;
  }

  /**
   * Identify core colors (colors with significant coverage)
   * These are the "real" colors, not anti-aliasing artifacts
   */
  identifyCoreColors(colorCounts) {
    // Sort by count (most common first)
    const sorted = Array.from(colorCounts.values())
      .sort((a, b) => b.count - a.count);

    const coreColors = [];

    for (const color of sorted) {
      // Skip colors with too few pixels
      if (color.count < this.minCoreColorPixels) continue;

      // Check if this color is too similar to an existing core color
      const isSimilar = coreColors.some(core =>
        this.colorDistance(color, core) < this.antiAliasingThreshold
      );

      if (!isSimilar) {
        coreColors.push({
          ...color,
          hex: this.rgbToHex(color.r, color.g, color.b)
        });
      }
    }

    return coreColors;
  }

  /**
   * Build mapping from all colors to nearest core color
   */
  buildColorMapping(colorCounts, coreColors) {
    const mapping = new Map();

    for (const color of colorCounts.values()) {
      // Find nearest core color
      let nearestCore = coreColors[0];
      let minDistance = Infinity;

      for (const core of coreColors) {
        const distance = this.colorDistance(color, core);
        if (distance < minDistance) {
          minDistance = distance;
          nearestCore = core;
        }
      }

      mapping.set(color.key, nearestCore);
    }

    return mapping;
  }

  /**
   * Create pixel map with colors mapped to core colors
   */
  createPixelMap(data, width, height, channels, colorMapping) {
    const pixelMap = new Array(height);

    for (let y = 0; y < height; y++) {
      pixelMap[y] = new Array(width);

      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = channels === 4 ? data[i + 3] : 255;

        if (a < 10) {
          // Transparent pixel
          pixelMap[y][x] = null;
        } else {
          const key = `${r},${g},${b}`;
          const mappedColor = colorMapping.get(key);
          pixelMap[y][x] = mappedColor ? mappedColor.hex : null;
        }
      }
    }

    return pixelMap;
  }

  /**
   * Extract connected regions for each color using flood fill
   */
  extractRegions(pixelMap, width, height, coreColors) {
    const visited = new Array(height).fill(null).map(() => new Array(width).fill(false));
    const regions = [];

    // Process each color separately to maintain proper layering
    for (const color of coreColors) {
      const colorRegions = this.extractRegionsForColor(
        pixelMap, width, height, color.hex, visited
      );
      regions.push(...colorRegions);
    }

    // Sort regions by area (largest first) for proper layering
    regions.sort((a, b) => b.area - a.area);

    return regions;
  }

  /**
   * Extract all connected regions of a specific color
   */
  extractRegionsForColor(pixelMap, width, height, colorHex, visited) {
    const regions = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (visited[y][x]) continue;
        if (pixelMap[y][x] !== colorHex) continue;

        // Found unvisited pixel of this color, flood fill to get region
        const region = this.floodFill(pixelMap, width, height, x, y, colorHex, visited);

        if (region.pixels.length >= this.minRegionArea) {
          regions.push(region);
        }
      }
    }

    return regions;
  }

  /**
   * Flood fill to extract connected region
   */
  floodFill(pixelMap, width, height, startX, startY, colorHex, visited) {
    const pixels = [];
    const stack = [[startX, startY]];

    let minX = startX, maxX = startX;
    let minY = startY, maxY = startY;

    while (stack.length > 0) {
      const [x, y] = stack.pop();

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      if (visited[y][x]) continue;
      if (pixelMap[y][x] !== colorHex) continue;

      visited[y][x] = true;
      pixels.push({ x, y });

      // Update bounding box
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Add 4-connected neighbors
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }

    return {
      color: colorHex,
      pixels,
      area: pixels.length,
      bounds: {
        minX, maxX, minY, maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
      }
    };
  }

  /**
   * Calculate perceptual color distance (CIE76 approximation)
   * Uses LAB color space for perceptually uniform distance
   */
  colorDistance(c1, c2) {
    // Convert to LAB
    const lab1 = this.rgbToLab(c1.r, c1.g, c1.b);
    const lab2 = this.rgbToLab(c2.r, c2.g, c2.b);

    // Euclidean distance in LAB space
    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;

    return Math.sqrt(dL * dL + da * da + db * db);
  }

  /**
   * Convert RGB to LAB color space
   */
  rgbToLab(r, g, b) {
    // RGB to XYZ
    let rr = r / 255;
    let gg = g / 255;
    let bb = b / 255;

    rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
    gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
    bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

    rr *= 100;
    gg *= 100;
    bb *= 100;

    const x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
    const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
    const z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;

    // XYZ to LAB (D65 illuminant)
    let xx = x / 95.047;
    let yy = y / 100.000;
    let zz = z / 108.883;

    xx = xx > 0.008856 ? Math.pow(xx, 1/3) : (7.787 * xx) + (16 / 116);
    yy = yy > 0.008856 ? Math.pow(yy, 1/3) : (7.787 * yy) + (16 / 116);
    zz = zz > 0.008856 ? Math.pow(zz, 1/3) : (7.787 * zz) + (16 / 116);

    return {
      L: (116 * yy) - 16,
      a: 500 * (xx - yy),
      b: 200 * (yy - zz)
    };
  }

  /**
   * Convert RGB to hex
   */
  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
  }
}

module.exports = ColorExtractor;
