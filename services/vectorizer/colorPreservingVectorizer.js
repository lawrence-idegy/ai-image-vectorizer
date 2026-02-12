/**
 * COLOR-PRESERVING VECTORIZER
 *
 * Uses Potrace for smooth bezier curves with proper layer ordering:
 * 1. Extract exact brand colors from the image (handles anti-aliasing)
 * 2. For each color, create a binary mask and trace with Potrace
 * 3. Order layers from largest area to smallest (background to foreground)
 * 4. Build SVG with proper layer stacking
 *
 * This preserves original brand colors while producing smooth vector output.
 */

const sharp = require('sharp');
const potrace = require('potrace');
const { promisify } = require('util');

const potraceTrace = promisify(potrace.trace);

class ColorPreservingVectorizer {
  constructor(options = {}) {
    // Color extraction settings
    this.edgeThreshold = options.edgeThreshold || 25; // Higher = less edge pixels = more colors captured
    this.colorGroupThreshold = options.colorGroupThreshold || 12; // Balance between preserving distinct colors and merging JPEG variants
    this.minColorPixels = options.minColorPixels || 10; // Capture small details but filter noise

    // Potrace settings for smooth curves while preserving detail
    this.potraceOptions = {
      turnPolicy: potrace.Potrace.TURNPOLICY_MINORITY,
      turdSize: 0, // Don't remove any small features (important for text)
      optCurve: true,
      alphaMax: 1.0,
      optTolerance: 0.2,
    };
  }

  /**
   * Vectorize an image while preserving exact colors
   */
  async vectorize(imageBuffer) {
    console.log('[ColorPreserving] Starting vectorization...');

    // Step 1: Extract exact colors from the image
    const { colors, width, height, pixels } = await this.extractColors(imageBuffer);
    console.log(`[ColorPreserving] Found ${colors.length} distinct colors: ${colors.map(c => c.hex).join(', ')}`);

    if (colors.length === 0) {
      throw new Error('No colors found in image');
    }

    // Step 2: Determine background color
    const bgColor = this.findBackgroundColor(colors, pixels, width, height);
    console.log(`[ColorPreserving] Background color: ${bgColor ? bgColor.hex : 'transparent'}`);

    // Step 3: Get foreground colors (non-background)
    const fgColors = colors.filter(c => {
      if (!bgColor) return true;
      return this.colorDistanceLab(c, bgColor) >= 5;
    });

    // Step 4: Trace each color with Potrace
    const colorLayers = [];

    // Include background color in "other colors" list for mask calculation
    const allColors = bgColor ? [...fgColors, bgColor] : fgColors;

    for (const color of fgColors) {
      console.log(`[ColorPreserving] Tracing color ${color.hex}...`);

      // Get other colors to avoid bleeding into
      const otherColors = allColors.filter(c => c !== color);

      // Create binary mask for this color (avoiding other colors)
      const mask = await this.createColorMask(pixels, color, width, height, otherColors);

      // Trace with Potrace
      const pathData = await this.traceWithPotrace(mask, width, height);

      if (pathData) {
        colorLayers.push({
          color: color.hex,
          path: pathData,
          pixelCount: color.count
        });
      }
    }

    // Step 5: Sort layers for proper stacking order
    // Heuristic: light colors (fills) on bottom, dark colors (outlines) on top
    colorLayers.sort((a, b) => {
      const brightnessA = this.getColorBrightness(a.color);
      const brightnessB = this.getColorBrightness(b.color);

      // Light colors go first (bottom layer), dark colors last (top layer)
      // For similar brightness, sort by pixel count (larger areas below)
      if (Math.abs(brightnessA - brightnessB) > 50) {
        return brightnessB - brightnessA; // Lighter colors first
      }
      return b.pixelCount - a.pixelCount;
    });

    // Step 6: Build final SVG
    const svg = this.buildSvg(width, height, colorLayers, bgColor);
    console.log(`[ColorPreserving] Generated SVG with ${colorLayers.length} color layers`);

    return svg;
  }

  /**
   * Find the background color by sampling edge pixels of the image
   */
  findBackgroundColor(colors, pixels, width, height) {
    // First check for significant transparency
    let transparentCount = 0;
    const totalPixels = width * height;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (pixels[y][x].a < 128) {
          transparentCount++;
        }
      }
    }

    // If more than 10% transparent, treat as transparent background
    if (transparentCount > totalPixels * 0.1) {
      return null;
    }

    // Sample pixels from the edges of the image (corners and borders)
    const edgeSamples = [];
    const sampleCount = Math.min(20, Math.floor(width / 10));

    // Top edge
    for (let i = 0; i < sampleCount; i++) {
      const x = Math.floor(i * width / sampleCount);
      if (pixels[0][x].a >= 128) edgeSamples.push(pixels[0][x]);
    }
    // Bottom edge
    for (let i = 0; i < sampleCount; i++) {
      const x = Math.floor(i * width / sampleCount);
      if (pixels[height - 1][x].a >= 128) edgeSamples.push(pixels[height - 1][x]);
    }
    // Left edge
    for (let i = 0; i < sampleCount; i++) {
      const y = Math.floor(i * height / sampleCount);
      if (pixels[y][0].a >= 128) edgeSamples.push(pixels[y][0]);
    }
    // Right edge
    for (let i = 0; i < sampleCount; i++) {
      const y = Math.floor(i * height / sampleCount);
      if (pixels[y][width - 1].a >= 128) edgeSamples.push(pixels[y][width - 1]);
    }
    // Corners
    const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
    for (const [cx, cy] of corners) {
      if (pixels[cy][cx].a >= 128) edgeSamples.push(pixels[cy][cx]);
    }

    if (edgeSamples.length === 0) {
      return null;
    }

    // Find which color from our extracted colors best matches the edge samples
    // Count how many edge samples match each color
    const colorMatchCounts = new Map();

    for (const sample of edgeSamples) {
      for (const color of colors) {
        const dist = this.colorDistanceLab(sample, color);
        if (dist < 25) { // Close enough to be considered this color
          const key = color.hex || this.rgbToHex(color.r, color.g, color.b);
          colorMatchCounts.set(key, (colorMatchCounts.get(key) || 0) + 1);
        }
      }
    }

    // Find the color that matches the most edge samples
    let bestColor = null;
    let bestCount = 0;

    for (const color of colors) {
      const key = color.hex || this.rgbToHex(color.r, color.g, color.b);
      const count = colorMatchCounts.get(key) || 0;
      // Must match at least 60% of edge samples to be considered background
      if (count > bestCount && count >= edgeSamples.length * 0.6) {
        bestCount = count;
        bestColor = color;
      }
    }

    return bestColor;
  }

  /**
   * Create a binary mask for a specific color
   * Uses "closest color wins" approach to prevent bleeding between similar colors
   * @param {Array} otherColors - Other colors to compare against
   */
  async createColorMask(pixels, targetColor, width, height, otherColors = []) {
    const maskData = Buffer.alloc(width * height);

    // Maximum distance to consider a pixel as belonging to this color
    const maxThreshold = 35;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];
        const i = y * width + x;

        if (pixel.a < 128) {
          maskData[i] = 255; // Transparent = white (not this color)
          continue;
        }

        const distToTarget = this.colorDistanceLab(pixel, targetColor);

        // Check if this pixel is closer to target than to any other color
        let isClosestToTarget = distToTarget < maxThreshold;

        if (isClosestToTarget && otherColors.length > 0) {
          for (const other of otherColors) {
            const distToOther = this.colorDistanceLab(pixel, other);
            if (distToOther < distToTarget) {
              isClosestToTarget = false;
              break;
            }
          }
        }

        maskData[i] = isClosestToTarget ? 0 : 255;
      }
    }

    return sharp(maskData, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
  }

  /**
   * Trace a binary mask with Potrace
   */
  async traceWithPotrace(maskBuffer, width, height) {
    try {
      const svg = await potraceTrace(maskBuffer, this.potraceOptions);

      // Extract path data from Potrace output
      const pathMatch = svg.match(/<path[^>]*d="([^"]+)"/);
      if (pathMatch) {
        return pathMatch[1];
      }
      return null;
    } catch (e) {
      console.warn('[ColorPreserving] Potrace error:', e.message);
      return null;
    }
  }

  /**
   * Build the final SVG from traced paths
   */
  buildSvg(width, height, layers, bgColor) {
    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg version="1.1" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;

    // Add background if not transparent
    if (bgColor) {
      svg += `  <rect width="100%" height="100%" fill="${bgColor.hex}"/>\n`;
    }

    // Add each color layer (ordered from largest to smallest)
    for (const layer of layers) {
      svg += `  <path d="${layer.path}" fill="${layer.color}" fill-rule="evenodd"/>\n`;
    }

    svg += `</svg>`;
    return svg;
  }

  /**
   * Extract distinct colors from image (ignoring anti-aliasing)
   */
  async extractColors(imageBuffer) {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Build pixel array
    const pixels = [];
    for (let y = 0; y < height; y++) {
      pixels[y] = [];
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * channels;
        pixels[y][x] = {
          r: data[i],
          g: data[i + 1],
          b: data[i + 2],
          a: data[i + 3]
        };
      }
    }

    // Compute edge map
    const isEdgePixel = this.computeEdgeMap(pixels, width, height);

    // Count colors from ALL pixels (not just non-edges)
    // This ensures we capture thin outlines and small features
    const colorCounts = new Map();
    const edgeColorCounts = new Map(); // Separate count for edge pixels

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];

        if (pixel.a < 128) continue;

        // Quantize to buckets of 4 (finer than 8) to preserve more color detail
        const key = `${Math.round(pixel.r / 4) * 4},${Math.round(pixel.g / 4) * 4},${Math.round(pixel.b / 4) * 4}`;

        // Count in main map (non-edge pixels get full weight)
        if (!isEdgePixel[y][x]) {
          const existing = colorCounts.get(key);
          if (existing) {
            existing.count++;
            existing.sumR += pixel.r;
            existing.sumG += pixel.g;
            existing.sumB += pixel.b;
          } else {
            colorCounts.set(key, {
              count: 1,
              sumR: pixel.r,
              sumG: pixel.g,
              sumB: pixel.b
            });
          }
        }

        // Also count edge pixels separately (for features that are mostly edges)
        if (isEdgePixel[y][x]) {
          const existing = edgeColorCounts.get(key);
          if (existing) {
            existing.count++;
            existing.sumR += pixel.r;
            existing.sumG += pixel.g;
            existing.sumB += pixel.b;
          } else {
            edgeColorCounts.set(key, {
              count: 1,
              sumR: pixel.r,
              sumG: pixel.g,
              sumB: pixel.b
            });
          }
        }
      }
    }

    // Convert to color list - first from non-edge pixels
    let colors = [];
    for (const [key, data] of colorCounts) {
      if (data.count < this.minColorPixels) continue;

      colors.push({
        r: Math.round(data.sumR / data.count),
        g: Math.round(data.sumG / data.count),
        b: Math.round(data.sumB / data.count),
        count: data.count,
        source: 'core'
      });
    }

    // Add colors from edge pixels that weren't found in core pixels
    // This captures thin outlines and small features, but edge colors need to be MORE distinct
    // to avoid picking up anti-aliasing artifacts
    const edgeDistinctThreshold = this.colorGroupThreshold * 3; // 30 LAB units for edge colors

    for (const [key, data] of edgeColorCounts) {
      if (data.count < this.minColorPixels * 2) continue;

      const edgeColor = {
        r: Math.round(data.sumR / data.count),
        g: Math.round(data.sumG / data.count),
        b: Math.round(data.sumB / data.count)
      };

      // Check if this edge color is significantly distinct from existing colors
      let isDistinct = true;
      for (const existing of colors) {
        if (this.colorDistanceLab(edgeColor, existing) < edgeDistinctThreshold) {
          isDistinct = false;
          break;
        }
      }

      if (isDistinct) {
        colors.push({
          r: edgeColor.r,
          g: edgeColor.g,
          b: edgeColor.b,
          count: data.count,
          source: 'edge'
        });
      }
    }

    // Merge similar colors
    colors = this.mergeColors(colors);

    // Remove transitional colors (anti-aliasing artifacts that are blends of two other colors)
    colors = this.removeTransitionalColors(colors);

    // Sort by pixel count
    colors.sort((a, b) => b.count - a.count);

    // Add hex values
    colors.forEach(c => {
      c.hex = this.rgbToHex(c.r, c.g, c.b);
    });

    return { colors, width, height, pixels };
  }

  /**
   * Compute which pixels are on edges
   */
  computeEdgeMap(pixels, width, height) {
    const isEdge = [];

    for (let y = 0; y < height; y++) {
      isEdge[y] = [];
      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];

        if (pixel.a < 128) {
          isEdge[y][x] = false;
          continue;
        }

        let maxGradient = 0;
        const neighbors = [
          [x - 1, y], [x + 1, y],
          [x, y - 1], [x, y + 1]
        ];

        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const neighbor = pixels[ny][nx];
            if (neighbor.a >= 128) {
              const gradient = this.colorDistance(pixel, neighbor);
              maxGradient = Math.max(maxGradient, gradient);
            }
          }
        }

        isEdge[y][x] = maxGradient > this.edgeThreshold;
      }
    }

    return isEdge;
  }

  /**
   * Merge similar colors
   */
  mergeColors(colors) {
    const merged = [];

    for (const color of colors) {
      let foundMatch = false;

      for (const existing of merged) {
        const dist = this.colorDistanceLab(color, existing);
        if (dist < this.colorGroupThreshold) {
          const totalCount = existing.count + color.count;
          existing.r = Math.round((existing.r * existing.count + color.r * color.count) / totalCount);
          existing.g = Math.round((existing.g * existing.count + color.g * color.count) / totalCount);
          existing.b = Math.round((existing.b * existing.count + color.b * color.count) / totalCount);
          existing.count = totalCount;
          foundMatch = true;
          break;
        }
      }

      if (!foundMatch) {
        merged.push({ ...color });
      }
    }

    return merged;
  }

  /**
   * Remove transitional colors (anti-aliasing artifacts) and JPEG variants
   */
  removeTransitionalColors(colors) {
    if (colors.length <= 2) return colors;

    // Sort by pixel count (most prominent first)
    const sorted = [...colors].sort((a, b) => b.count - a.count);
    const kept = [];

    for (const color of sorted) {
      // Always keep the top colors (most prominent)
      if (kept.length < 2) {
        kept.push(color);
        continue;
      }

      // Check if this color is too similar to an existing kept color
      // (JPEG compression creates similar color variants)
      let isTooSimilar = false;
      for (const existing of kept) {
        const dist = this.colorDistanceLab(color, existing);
        // If very similar to an existing color AND has significantly fewer pixels, skip it
        // Use threshold of 8 to preserve distinct light colors (white vs beige = ~12.8 LAB distance)
        if (dist < 8 && color.count < existing.count * 0.3) {
          isTooSimilar = true;
          break;
        }
      }

      if (isTooSimilar) continue;

      // For edge-sourced colors, also check if they're transitional (midpoint blends)
      let isTransitional = false;
      if (color.source === 'edge') {
        for (let i = 0; i < kept.length && !isTransitional; i++) {
          for (let j = i + 1; j < kept.length && !isTransitional; j++) {
            const c1 = kept[i];
            const c2 = kept[j];

            // Calculate the midpoint of c1 and c2
            const midpoint = {
              r: (c1.r + c2.r) / 2,
              g: (c1.g + c2.g) / 2,
              b: (c1.b + c2.b) / 2
            };

            // Check if this color is close to the midpoint
            const distToMidpoint = this.colorDistanceLab(color, midpoint);
            const distBetweenColors = this.colorDistanceLab(c1, c2);

            // Remove if clearly a midpoint blend with low pixel count
            if (distToMidpoint < 15 && distBetweenColors > 30 && color.count < c1.count * 0.15) {
              isTransitional = true;
            }
          }
        }
      }

      if (!isTransitional) {
        kept.push(color);
      }
    }

    return kept;
  }

  colorDistance(c1, c2) {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  colorDistanceLab(c1, c2) {
    const lab1 = this.rgbToLab(c1.r, c1.g, c1.b);
    const lab2 = this.rgbToLab(c2.r, c2.g, c2.b);

    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;

    return Math.sqrt(dL * dL + da * da + db * db);
  }

  rgbToLab(r, g, b) {
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

    let xx = x / 95.047;
    let yy = y / 100.000;
    let zz = z / 108.883;

    xx = xx > 0.008856 ? Math.pow(xx, 1 / 3) : (7.787 * xx) + (16 / 116);
    yy = yy > 0.008856 ? Math.pow(yy, 1 / 3) : (7.787 * yy) + (16 / 116);
    zz = zz > 0.008856 ? Math.pow(zz, 1 / 3) : (7.787 * zz) + (16 / 116);

    return {
      L: (116 * yy) - 16,
      a: 500 * (xx - yy),
      b: 200 * (yy - zz)
    };
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
  }

  /**
   * Get perceived brightness of a hex color (0-255)
   */
  getColorBrightness(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    // Perceived brightness formula
    return (r * 299 + g * 587 + b * 114) / 1000;
  }
}

module.exports = ColorPreservingVectorizer;
