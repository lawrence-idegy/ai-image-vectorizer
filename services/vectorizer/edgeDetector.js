/**
 * GRADIENT-BASED EDGE DETECTOR
 *
 * Detects edges with sub-pixel precision by analyzing color gradients.
 *
 * Key insight: Anti-aliased edges contain information about the TRUE edge position.
 * A pixel that's 50% red + 50% white tells us the edge passes through its CENTER.
 * A pixel that's 75% red + 25% white tells us the edge is at the 75% position.
 *
 * This module:
 * 1. Analyzes color transitions between adjacent pixels
 * 2. Identifies edge pixels (where significant color change occurs)
 * 3. Computes sub-pixel edge position using color interpolation
 * 4. Outputs precise edge points for contour tracing
 */

const sharp = require('sharp');

class EdgeDetector {
  constructor(options = {}) {
    // Minimum color difference to consider an edge (LAB distance)
    this.edgeThreshold = options.edgeThreshold || 10;

    // Color distance for grouping similar colors
    this.colorGroupThreshold = options.colorGroupThreshold || 15;
  }

  /**
   * Detect edges in image with sub-pixel precision
   * @param {Buffer} imageBuffer - Input image
   * @returns {Object} { width, height, edges, colorRegions }
   */
  async detect(imageBuffer) {
    console.log('[EdgeDetector] Starting edge detection...');

    // Get raw pixel data
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
    console.log(`[EdgeDetector] Image: ${width}x${height}`);

    // Step 1: Build pixel color array for fast access
    const pixels = this.buildPixelArray(data, width, height, channels);

    // Step 2: Compute gradient magnitude at each pixel
    const gradients = this.computeGradients(pixels, width, height);

    // Step 3: Find edge pixels and compute sub-pixel positions
    const edgePixels = this.findEdgePixels(pixels, gradients, width, height);
    console.log(`[EdgeDetector] Found ${edgePixels.length} edge pixels`);

    // Step 4: Extract unique colors (non-edge pixels only for accuracy)
    const colors = this.extractColors(pixels, gradients, width, height);
    console.log(`[EdgeDetector] Found ${colors.length} distinct colors`);

    // Step 5: Assign each pixel to nearest color (for region building)
    const colorMap = this.buildColorMap(pixels, colors, width, height);

    // Step 6: Build edge chains (connected edge pixels)
    const edgeChains = this.buildEdgeChains(edgePixels, width, height);
    console.log(`[EdgeDetector] Built ${edgeChains.length} edge chains`);

    return {
      width,
      height,
      pixels,
      gradients,
      edgePixels,
      edgeChains,
      colors,
      colorMap
    };
  }

  /**
   * Build 2D pixel array for fast access
   */
  buildPixelArray(data, width, height, channels) {
    const pixels = new Array(height);

    for (let y = 0; y < height; y++) {
      pixels[y] = new Array(width);
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

    return pixels;
  }

  /**
   * Compute color gradient magnitude at each pixel
   * Uses Sobel-like operator for smooth gradients
   */
  computeGradients(pixels, width, height) {
    const gradients = new Array(height);

    for (let y = 0; y < height; y++) {
      gradients[y] = new Array(width);

      for (let x = 0; x < width; x++) {
        // Skip fully transparent pixels
        if (pixels[y][x].a < 10) {
          gradients[y][x] = { magnitude: 0, direction: 0 };
          continue;
        }

        // Compute gradient using neighboring pixels
        const gx = this.computeGradientX(pixels, x, y, width, height);
        const gy = this.computeGradientY(pixels, x, y, width, height);

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        const direction = Math.atan2(gy, gx);

        gradients[y][x] = { magnitude, direction, gx, gy };
      }
    }

    return gradients;
  }

  /**
   * Compute horizontal gradient (Sobel-like)
   * Only considers opaque pixels for gradient computation
   */
  computeGradientX(pixels, x, y, width, height) {
    const current = pixels[y][x];
    const left = x > 0 ? pixels[y][x - 1] : null;
    const right = x < width - 1 ? pixels[y][x + 1] : null;

    // Check for edge between current pixel and neighbors (handling transparency)
    let maxDist = 0;

    // Compare current to left (if left is opaque)
    if (left && left.a >= 10) {
      maxDist = Math.max(maxDist, this.colorDistance(current, left));
    } else if (left && left.a < 10 && current.a >= 10) {
      // Edge between opaque and transparent - treat as edge
      maxDist = Math.max(maxDist, 255); // Strong edge
    }

    // Compare current to right (if right is opaque)
    if (right && right.a >= 10) {
      maxDist = Math.max(maxDist, this.colorDistance(current, right));
    } else if (right && right.a < 10 && current.a >= 10) {
      // Edge between opaque and transparent - treat as edge
      maxDist = Math.max(maxDist, 255); // Strong edge
    }

    return maxDist;
  }

  /**
   * Compute vertical gradient (Sobel-like)
   * Only considers opaque pixels for gradient computation
   */
  computeGradientY(pixels, x, y, width, height) {
    const current = pixels[y][x];
    const top = y > 0 ? pixels[y - 1][x] : null;
    const bottom = y < height - 1 ? pixels[y + 1][x] : null;

    let maxDist = 0;

    // Compare current to top (if top is opaque)
    if (top && top.a >= 10) {
      maxDist = Math.max(maxDist, this.colorDistance(current, top));
    } else if (top && top.a < 10 && current.a >= 10) {
      // Edge between opaque and transparent - treat as edge
      maxDist = Math.max(maxDist, 255); // Strong edge
    }

    // Compare current to bottom (if bottom is opaque)
    if (bottom && bottom.a >= 10) {
      maxDist = Math.max(maxDist, this.colorDistance(current, bottom));
    } else if (bottom && bottom.a < 10 && current.a >= 10) {
      // Edge between opaque and transparent - treat as edge
      maxDist = Math.max(maxDist, 255); // Strong edge
    }

    return maxDist;
  }

  /**
   * Find edge pixels and compute their sub-pixel positions
   */
  findEdgePixels(pixels, gradients, width, height) {
    const edgePixels = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const grad = gradients[y][x];

        // Is this an edge pixel?
        if (grad.magnitude >= this.edgeThreshold) {
          // Compute sub-pixel position based on gradient
          const subPixel = this.computeSubPixelPosition(
            pixels, gradients, x, y, width, height
          );

          edgePixels.push({
            x: x,
            y: y,
            subX: subPixel.x,
            subY: subPixel.y,
            magnitude: grad.magnitude,
            direction: grad.direction
          });
        }
      }
    }

    return edgePixels;
  }

  /**
   * Compute sub-pixel edge position using color interpolation
   *
   * The key insight: If a pixel is a blend of two colors,
   * the edge position can be estimated from the blend ratio.
   */
  computeSubPixelPosition(pixels, gradients, x, y, width, height) {
    const grad = gradients[y][x];
    const pixel = pixels[y][x];

    // Direction perpendicular to gradient (along the edge)
    const edgeDir = grad.direction + Math.PI / 2;

    // Get pixels on either side of this one (along gradient direction)
    const dx = Math.cos(grad.direction);
    const dy = Math.sin(grad.direction);

    // Sample colors on either side
    const x1 = Math.max(0, Math.min(width - 1, Math.round(x - dx)));
    const y1 = Math.max(0, Math.min(height - 1, Math.round(y - dy)));
    const x2 = Math.max(0, Math.min(width - 1, Math.round(x + dx)));
    const y2 = Math.max(0, Math.min(height - 1, Math.round(y + dy)));

    const colorBefore = pixels[y1][x1];
    const colorAfter = pixels[y2][x2];
    const colorCurrent = pixel;

    // Estimate blend ratio: how much of colorBefore vs colorAfter
    const distToBefore = this.colorDistanceLAB(colorCurrent, colorBefore);
    const distToAfter = this.colorDistanceLAB(colorCurrent, colorAfter);
    const totalDist = distToBefore + distToAfter;

    let offset = 0;
    if (totalDist > 0.001) {
      // offset: 0 = at colorBefore, 1 = at colorAfter
      // Subtract 0.5 to center: -0.5 to +0.5
      offset = (distToBefore / totalDist) - 0.5;
    }

    // Apply offset along gradient direction
    const subX = x + 0.5 + offset * dx;
    const subY = y + 0.5 + offset * dy;

    return { x: subX, y: subY };
  }

  /**
   * Extract distinct colors from non-edge pixels
   * Edge pixels are blends, so we look at "interior" pixels for true colors
   */
  extractColors(pixels, gradients, width, height) {
    const colorCounts = new Map();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];
        const grad = gradients[y][x];

        // Skip transparent pixels
        if (pixel.a < 10) continue;

        // Skip edge pixels (they're blends)
        if (grad.magnitude >= this.edgeThreshold * 0.5) continue;

        // Quantize to reduce noise
        const key = `${Math.round(pixel.r / 4) * 4},${Math.round(pixel.g / 4) * 4},${Math.round(pixel.b / 4) * 4}`;

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
    }

    // Convert to color list, averaging the actual values
    const colors = [];
    for (const [key, data] of colorCounts) {
      if (data.count < 10) continue; // Skip noise

      colors.push({
        r: Math.round(data.sumR / data.count),
        g: Math.round(data.sumG / data.count),
        b: Math.round(data.sumB / data.count),
        count: data.count,
        hex: this.rgbToHex(
          Math.round(data.sumR / data.count),
          Math.round(data.sumG / data.count),
          Math.round(data.sumB / data.count)
        )
      });
    }

    // Merge similar colors
    const merged = this.mergeColors(colors);

    // Sort by count (most common first)
    merged.sort((a, b) => b.count - a.count);

    return merged;
  }

  /**
   * Merge colors that are too similar
   */
  mergeColors(colors) {
    const merged = [];

    for (const color of colors) {
      let foundMatch = false;

      for (const existing of merged) {
        const dist = this.colorDistanceLAB(color, existing);
        if (dist < this.colorGroupThreshold) {
          // Merge into existing (weighted average)
          const totalCount = existing.count + color.count;
          existing.r = Math.round((existing.r * existing.count + color.r * color.count) / totalCount);
          existing.g = Math.round((existing.g * existing.count + color.g * color.count) / totalCount);
          existing.b = Math.round((existing.b * existing.count + color.b * color.count) / totalCount);
          existing.count = totalCount;
          existing.hex = this.rgbToHex(existing.r, existing.g, existing.b);
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
   * Build color map: assign each pixel to nearest color
   */
  buildColorMap(pixels, colors, width, height) {
    const colorMap = new Array(height);

    for (let y = 0; y < height; y++) {
      colorMap[y] = new Array(width);

      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];

        if (pixel.a < 10) {
          colorMap[y][x] = null; // Transparent
          continue;
        }

        // Find nearest color
        let minDist = Infinity;
        let nearestColor = null;

        for (const color of colors) {
          const dist = this.colorDistanceLAB(pixel, color);
          if (dist < minDist) {
            minDist = dist;
            nearestColor = color;
          }
        }

        colorMap[y][x] = nearestColor ? nearestColor.hex : null;
      }
    }

    return colorMap;
  }

  /**
   * Build connected edge chains
   * Groups edge pixels into continuous chains (contours)
   */
  buildEdgeChains(edgePixels, width, height) {
    // Create lookup for fast neighbor finding
    const edgeMap = new Map();
    for (const edge of edgePixels) {
      const key = `${edge.x},${edge.y}`;
      edgeMap.set(key, edge);
    }

    const visited = new Set();
    const chains = [];

    // Find chains starting from each unvisited edge pixel
    for (const startEdge of edgePixels) {
      const startKey = `${startEdge.x},${startEdge.y}`;
      if (visited.has(startKey)) continue;

      // Trace chain in both directions
      const chain = this.traceEdgeChain(startEdge, edgeMap, visited);

      if (chain.length >= 3) {
        chains.push(chain);
      }
    }

    return chains;
  }

  /**
   * Trace a connected chain of edge pixels
   */
  traceEdgeChain(startEdge, edgeMap, visited) {
    const chain = [];
    const queue = [startEdge];

    // 8-connectivity neighbors
    const neighbors = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],          [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    while (queue.length > 0) {
      const edge = queue.shift();
      const key = `${edge.x},${edge.y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      chain.push({
        x: edge.subX,
        y: edge.subY,
        pixelX: edge.x,
        pixelY: edge.y,
        direction: edge.direction
      });

      // Find unvisited neighbors
      for (const [dx, dy] of neighbors) {
        const nx = edge.x + dx;
        const ny = edge.y + dy;
        const nkey = `${nx},${ny}`;

        if (!visited.has(nkey) && edgeMap.has(nkey)) {
          queue.push(edgeMap.get(nkey));
        }
      }
    }

    return chain;
  }

  /**
   * Simple color distance (Euclidean RGB)
   */
  colorDistance(c1, c2) {
    const dr = c1.r - c2.r;
    const dg = c1.g - c2.g;
    const db = c1.b - c2.b;
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  /**
   * Perceptual color distance (LAB)
   */
  colorDistanceLAB(c1, c2) {
    const lab1 = this.rgbToLab(c1.r, c1.g, c1.b);
    const lab2 = this.rgbToLab(c2.r, c2.g, c2.b);

    const dL = lab1.L - lab2.L;
    const da = lab1.a - lab2.a;
    const db = lab1.b - lab2.b;

    return Math.sqrt(dL * dL + da * da + db * db);
  }

  /**
   * Convert RGB to LAB
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

    // XYZ to LAB
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
      const hex = Math.max(0, Math.min(255, x)).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('').toUpperCase();
  }
}

module.exports = EdgeDetector;
