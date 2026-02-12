/**
 * Palette Manager Module
 *
 * Handles color palette management and snapping:
 * - Predefined color palettes (web-safe, brand colors, etc.)
 * - Tolerance-based color matching
 * - Custom palette support
 * - Color distance calculations (multiple algorithms)
 */

class PaletteManager {
  constructor(options = {}) {
    // Tolerance for color snapping (0-255 range)
    this.tolerance = options.tolerance || 30;
    // Color distance algorithm: 'euclidean', 'weighted', 'ciede2000'
    this.algorithm = options.algorithm || 'weighted';
  }

  /**
   * Predefined palettes
   */
  static get PALETTES() {
    return {
      // Basic web-safe colors
      'web-safe': [
        { r: 0, g: 0, b: 0, a: 255 },       // Black
        { r: 255, g: 255, b: 255, a: 255 }, // White
        { r: 255, g: 0, b: 0, a: 255 },     // Red
        { r: 0, g: 255, b: 0, a: 255 },     // Green
        { r: 0, g: 0, b: 255, a: 255 },     // Blue
        { r: 255, g: 255, b: 0, a: 255 },   // Yellow
        { r: 255, g: 0, b: 255, a: 255 },   // Magenta
        { r: 0, g: 255, b: 255, a: 255 },   // Cyan
        { r: 128, g: 128, b: 128, a: 255 }, // Gray
        { r: 255, g: 165, b: 0, a: 255 },   // Orange
        { r: 128, g: 0, b: 128, a: 255 },   // Purple
        { r: 165, g: 42, b: 42, a: 255 },   // Brown
      ],

      // Material Design colors
      'material': [
        { r: 244, g: 67, b: 54, a: 255 },   // Red
        { r: 233, g: 30, b: 99, a: 255 },   // Pink
        { r: 156, g: 39, b: 176, a: 255 },  // Purple
        { r: 103, g: 58, b: 183, a: 255 },  // Deep Purple
        { r: 63, g: 81, b: 181, a: 255 },   // Indigo
        { r: 33, g: 150, b: 243, a: 255 },  // Blue
        { r: 3, g: 169, b: 244, a: 255 },   // Light Blue
        { r: 0, g: 188, b: 212, a: 255 },   // Cyan
        { r: 0, g: 150, b: 136, a: 255 },   // Teal
        { r: 76, g: 175, b: 80, a: 255 },   // Green
        { r: 139, g: 195, b: 74, a: 255 },  // Light Green
        { r: 205, g: 220, b: 57, a: 255 },  // Lime
        { r: 255, g: 235, b: 59, a: 255 },  // Yellow
        { r: 255, g: 193, b: 7, a: 255 },   // Amber
        { r: 255, g: 152, b: 0, a: 255 },   // Orange
        { r: 255, g: 87, b: 34, a: 255 },   // Deep Orange
        { r: 121, g: 85, b: 72, a: 255 },   // Brown
        { r: 158, g: 158, b: 158, a: 255 }, // Grey
        { r: 96, g: 125, b: 139, a: 255 },  // Blue Grey
        { r: 0, g: 0, b: 0, a: 255 },       // Black
        { r: 255, g: 255, b: 255, a: 255 }, // White
      ],

      // Grayscale
      'grayscale': Array.from({ length: 17 }, (_, i) => ({
        r: Math.round(i * 16),
        g: Math.round(i * 16),
        b: Math.round(i * 16),
        a: 255
      })),

      // Pantone-inspired
      'pantone': [
        { r: 0, g: 82, b: 147, a: 255 },    // Classic Blue
        { r: 155, g: 35, b: 53, a: 255 },   // Marsala
        { r: 221, g: 65, b: 36, a: 255 },   // Tangerine Tango
        { r: 136, g: 176, b: 75, a: 255 },  // Greenery
        { r: 91, g: 94, b: 166, a: 255 },   // Very Peri
        { r: 187, g: 38, b: 73, a: 255 },   // Viva Magenta
        { r: 255, g: 190, b: 152, a: 255 }, // Peach Fuzz
      ],
    };
  }

  /**
   * Get a predefined palette by name
   */
  getPalette(name) {
    return PaletteManager.PALETTES[name] || null;
  }

  /**
   * Parse a custom palette from various formats
   * @param {Array|string} input - Array of colors or CSS color string
   * @returns {Array} Normalized palette array
   */
  parsePalette(input) {
    if (Array.isArray(input)) {
      return input.map(color => this.parseColor(color));
    }
    if (typeof input === 'string') {
      // Parse comma-separated hex colors
      return input.split(',').map(c => this.parseColor(c.trim()));
    }
    return [];
  }

  /**
   * Parse a single color from various formats
   */
  parseColor(color) {
    if (typeof color === 'object' && 'r' in color) {
      return {
        r: color.r,
        g: color.g,
        b: color.b,
        a: color.a !== undefined ? color.a : 255
      };
    }

    if (typeof color === 'string') {
      // Hex color
      if (color.startsWith('#')) {
        const hex = color.slice(1);
        if (hex.length === 3) {
          return {
            r: parseInt(hex[0] + hex[0], 16),
            g: parseInt(hex[1] + hex[1], 16),
            b: parseInt(hex[2] + hex[2], 16),
            a: 255
          };
        }
        if (hex.length === 6) {
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: 255
          };
        }
        if (hex.length === 8) {
          return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
            a: parseInt(hex.slice(6, 8), 16)
          };
        }
      }

      // RGB/RGBA
      const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbMatch) {
        return {
          r: parseInt(rgbMatch[1]),
          g: parseInt(rgbMatch[2]),
          b: parseInt(rgbMatch[3]),
          a: rgbMatch[4] ? Math.round(parseFloat(rgbMatch[4]) * 255) : 255
        };
      }
    }

    // Default to black
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  /**
   * Snap a color to the nearest palette color
   * @param {Object} color - Color to snap {r, g, b, a}
   * @param {Array} palette - Array of palette colors
   * @returns {Object} { color: snapped color, distance: color distance, matched: boolean }
   */
  snapColor(color, palette) {
    if (!palette || palette.length === 0) {
      return { color, distance: 0, matched: false };
    }

    let minDist = Infinity;
    let closestColor = null;

    for (const paletteColor of palette) {
      const dist = this.colorDistance(color, paletteColor);
      if (dist < minDist) {
        minDist = dist;
        closestColor = paletteColor;
      }
    }

    const matched = minDist <= this.tolerance;
    return {
      color: matched ? closestColor : color,
      distance: minDist,
      matched
    };
  }

  /**
   * Snap all colors in a palette to target palette
   * @param {Array} sourceColors - Colors to snap
   * @param {Array} targetPalette - Palette to snap to
   * @returns {Array} Snapped colors
   */
  snapPalette(sourceColors, targetPalette) {
    return sourceColors.map(color => this.snapColor(color, targetPalette).color);
  }

  /**
   * Calculate color distance using selected algorithm
   */
  colorDistance(c1, c2) {
    switch (this.algorithm) {
      case 'euclidean':
        return this.euclideanDistance(c1, c2);
      case 'ciede2000':
        return this.ciede2000Distance(c1, c2);
      case 'weighted':
      default:
        return this.weightedDistance(c1, c2);
    }
  }

  /**
   * Simple Euclidean RGB distance
   */
  euclideanDistance(c1, c2) {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /**
   * Weighted RGB distance (approximates human perception)
   */
  weightedDistance(c1, c2) {
    const rmean = (c1.r + c2.r) / 2;
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;

    // Weighted formula based on human color perception
    const weightR = 2 + rmean / 256;
    const weightG = 4;
    const weightB = 2 + (255 - rmean) / 256;

    return Math.sqrt(weightR * dr * dr + weightG * dg * dg + weightB * db * db);
  }

  /**
   * CIEDE2000 color distance (most accurate but slower)
   * Converts to Lab color space for perceptually uniform comparison
   */
  ciede2000Distance(c1, c2) {
    // Convert RGB to Lab
    const lab1 = this.rgbToLab(c1);
    const lab2 = this.rgbToLab(c2);

    // Simplified CIEDE2000 (without full parametric factors)
    const dL = lab2.L - lab1.L;
    const dA = lab2.a - lab1.a;
    const dB = lab2.b - lab1.b;

    const c1Lab = Math.sqrt(lab1.a * lab1.a + lab1.b * lab1.b);
    const c2Lab = Math.sqrt(lab2.a * lab2.a + lab2.b * lab2.b);
    const dC = c2Lab - c1Lab;

    const dH = Math.sqrt(Math.max(0, dA * dA + dB * dB - dC * dC));

    const sL = 1;
    const sC = 1 + 0.045 * c1Lab;
    const sH = 1 + 0.015 * c1Lab;

    const deltaE = Math.sqrt(
      (dL / sL) ** 2 +
      (dC / sC) ** 2 +
      (dH / sH) ** 2
    );

    // Scale to approximate 0-255 range for consistency
    return deltaE * 2.55;
  }

  /**
   * Convert RGB to Lab color space
   */
  rgbToLab(rgb) {
    // RGB to XYZ
    let r = rgb.r / 255;
    let g = rgb.g / 255;
    let b = rgb.b / 255;

    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
    const y = (r * 0.2126 + g * 0.7152 + b * 0.0722) / 1.00000;
    const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;

    // XYZ to Lab
    const fx = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    const fy = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    const fz = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

    return {
      L: (116 * fy) - 16,
      a: 500 * (fx - fy),
      b: 200 * (fy - fz)
    };
  }

  /**
   * Reduce colors in palette to specified count
   * Uses k-means clustering
   */
  reducePalette(colors, targetCount) {
    if (colors.length <= targetCount) return colors;

    // Initialize centroids using k-means++
    const centroids = [colors[Math.floor(Math.random() * colors.length)]];

    while (centroids.length < targetCount) {
      // Calculate distances to nearest centroid
      const distances = colors.map(c => {
        let minDist = Infinity;
        for (const centroid of centroids) {
          const dist = this.colorDistance(c, centroid);
          minDist = Math.min(minDist, dist);
        }
        return minDist * minDist;
      });

      // Weighted random selection
      const totalDist = distances.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalDist;
      for (let i = 0; i < distances.length; i++) {
        random -= distances[i];
        if (random <= 0) {
          centroids.push(colors[i]);
          break;
        }
      }
    }

    // K-means iterations
    const maxIterations = 20;
    for (let iter = 0; iter < maxIterations; iter++) {
      // Assign colors to clusters
      const clusters = Array.from({ length: targetCount }, () => []);
      for (const color of colors) {
        let minDist = Infinity;
        let closestIdx = 0;
        for (let i = 0; i < centroids.length; i++) {
          const dist = this.colorDistance(color, centroids[i]);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = i;
          }
        }
        clusters[closestIdx].push(color);
      }

      // Update centroids
      let changed = false;
      for (let i = 0; i < centroids.length; i++) {
        if (clusters[i].length === 0) continue;

        const newCentroid = {
          r: Math.round(clusters[i].reduce((s, c) => s + c.r, 0) / clusters[i].length),
          g: Math.round(clusters[i].reduce((s, c) => s + c.g, 0) / clusters[i].length),
          b: Math.round(clusters[i].reduce((s, c) => s + c.b, 0) / clusters[i].length),
          a: 255
        };

        if (this.colorDistance(newCentroid, centroids[i]) > 1) {
          centroids[i] = newCentroid;
          changed = true;
        }
      }

      if (!changed) break;
    }

    return centroids;
  }

  /**
   * Sort palette by luminance
   */
  sortByLuminance(palette) {
    return [...palette].sort((a, b) => {
      const lumA = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
      const lumB = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
      return lumA - lumB;
    });
  }

  /**
   * Sort palette by hue
   */
  sortByHue(palette) {
    return [...palette].sort((a, b) => {
      const hueA = this.rgbToHue(a);
      const hueB = this.rgbToHue(b);
      return hueA - hueB;
    });
  }

  /**
   * Convert RGB to hue (0-360)
   */
  rgbToHue(rgb) {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    if (delta === 0) return 0;

    let hue;
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }

    hue *= 60;
    if (hue < 0) hue += 360;

    return hue;
  }
}

module.exports = PaletteManager;
