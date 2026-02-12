/**
 * AI COLOR-PRESERVING VECTORIZER
 *
 * Combines AI vectorization quality with EXACT color preservation:
 * 1. Use Replicate AI (recraft-vectorize) for clean vector shapes
 * 2. For each path, sample the ORIGINAL image to get the exact color
 * 3. Replace each path's color with the sampled color from original
 *
 * This gives you AI-quality smooth edges with pixel-perfect color accuracy.
 */

const sharp = require('sharp');
const replicateService = require('../replicateService');
const { JSDOM } = require('jsdom');

class AIColorPreservingVectorizer {
  constructor(options = {}) {
    this.colorGroupThreshold = options.colorGroupThreshold || 8;
    this.minColorPixels = options.minColorPixels || 50;
    this.edgeThreshold = options.edgeThreshold || 25;
  }

  /**
   * Vectorize with AI while preserving EXACT colors from original
   * @param {Buffer} imageBuffer - Original image
   * @param {Object} options - Options
   * @param {boolean} options.quantizeColors - If true, snap to detected brand colors (good for logos)
   */
  async vectorize(imageBuffer, options = {}) {
    const { quantizeColors = true } = options;

    console.log('[AIColorPreserving] Starting hybrid vectorization...');

    // Step 1: Load original image pixels for color sampling
    const { pixels, width, height } = await this.loadImagePixels(imageBuffer);
    console.log(`[AIColorPreserving] Loaded original image: ${width}x${height}`);

    // Step 2: Extract brand colors if quantizing
    let brandColors = null;
    if (quantizeColors) {
      brandColors = await this.extractBrandColors(imageBuffer);
      console.log(`[AIColorPreserving] Extracted ${brandColors.length} brand colors:`, brandColors.map(c => c.hex).join(', '));
    }

    // Step 3: Prepare image for AI (ensure minimum size)
    let processedBuffer = imageBuffer;
    let scale = 1;
    const minDim = Math.min(width, height);
    if (minDim < 512) {
      scale = 512 / minDim;
      processedBuffer = await sharp(imageBuffer)
        .resize(Math.round(width * scale), Math.round(height * scale))
        .png()
        .toBuffer();
    }

    // Step 4: Vectorize with AI
    console.log('[AIColorPreserving] Running AI vectorization...');
    const dataUri = replicateService.bufferToDataUri(processedBuffer, 'image/png');
    let svgContent = await replicateService.vectorizeImage(dataUri);

    // Handle URL response from Replicate
    if (typeof svgContent === 'string' && svgContent.startsWith('http')) {
      const response = await fetch(svgContent);
      svgContent = await response.text();
    }

    // Step 5: Sample original image to get exact colors for each path
    console.log('[AIColorPreserving] Sampling original image for exact colors...');
    const correctedSvg = await this.correctColorsFromOriginal(svgContent, pixels, width, height, brandColors);

    // Step 6: Update dimensions to match original
    const finalSvg = this.updateDimensions(correctedSvg, width, height);

    console.log('[AIColorPreserving] Vectorization complete');
    return finalSvg;
  }

  /**
   * Load image pixels into a 2D array
   */
  async loadImagePixels(imageBuffer) {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;
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

    return { pixels, width, height };
  }

  /**
   * Correct colors in SVG by sampling the original image
   * @param {string} svgContent - SVG content
   * @param {Array} pixels - 2D array of pixels
   * @param {number} imgWidth - Image width
   * @param {number} imgHeight - Image height
   * @param {Array|null} brandColors - If provided, snap sampled colors to nearest brand color
   */
  async correctColorsFromOriginal(svgContent, pixels, imgWidth, imgHeight, brandColors = null) {
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const doc = dom.window.document;
    const svg = doc.querySelector('svg');

    if (!svg) return svgContent;

    // Get SVG dimensions
    const viewBox = svg.getAttribute('viewBox');
    let svgWidth, svgHeight;
    if (viewBox) {
      const parts = viewBox.split(/\s+/);
      svgWidth = parseFloat(parts[2]);
      svgHeight = parseFloat(parts[3]);
    } else {
      svgWidth = parseFloat(svg.getAttribute('width')) || imgWidth;
      svgHeight = parseFloat(svg.getAttribute('height')) || imgHeight;
    }

    // Scale factors from SVG coords to image coords
    const scaleX = imgWidth / svgWidth;
    const scaleY = imgHeight / svgHeight;

    // Process all elements with fill
    const elements = svg.querySelectorAll('path, rect, circle, ellipse, polygon');

    for (const el of elements) {
      const fill = el.getAttribute('fill');

      // Skip if no fill or transparent
      if (!fill || fill === 'none' || fill === 'transparent') continue;

      // Skip gradient references for now - we'll handle them separately
      if (fill.startsWith('url(')) continue;

      // Get the bounding box center point of this element
      const bbox = this.estimateBoundingBox(el, svgWidth, svgHeight);
      if (!bbox) continue;

      let sampledColor;

      // For background paths, sample corners and use most common color
      if (bbox.isBackground && bbox.samplePoints) {
        const colorVotes = new Map();

        for (const point of bbox.samplePoints) {
          const imgX = Math.round(point.x * scaleX);
          const imgY = Math.round(point.y * scaleY);
          let color = this.sampleColorAt(pixels, imgX, imgY, imgWidth, imgHeight);

          // Snap to brand color if available
          if (color && brandColors) {
            const rgb = this.hexToRgb(color.replace('#', ''));
            if (rgb) {
              color = this.findNearestBrandColor(rgb, brandColors).hex;
            }
          }

          if (color) {
            colorVotes.set(color, (colorVotes.get(color) || 0) + 1);
          }
        }

        // Use the most common corner color
        let maxVotes = 0;
        for (const [color, votes] of colorVotes) {
          if (votes > maxVotes) {
            maxVotes = votes;
            sampledColor = color;
          }
        }
      } else {
        // For normal paths, sample at centroid
        const imgX = Math.round(bbox.centerX * scaleX);
        const imgY = Math.round(bbox.centerY * scaleY);

        sampledColor = this.sampleColorAt(pixels, imgX, imgY, imgWidth, imgHeight);

        // If brand colors provided, snap to nearest
        if (sampledColor && brandColors) {
          const rgb = this.hexToRgb(sampledColor.replace('#', ''));
          if (rgb) {
            sampledColor = this.findNearestBrandColor(rgb, brandColors).hex;
          }
        }
      }

      if (sampledColor) {
        el.setAttribute('fill', sampledColor);
      }
    }

    // Handle gradients - replace with sampled solid colors
    const gradientRefs = svg.querySelectorAll('[fill^="url(#"]');
    for (const el of gradientRefs) {
      const bbox = this.estimateBoundingBox(el, svgWidth, svgHeight);
      if (!bbox) continue;

      const imgX = Math.round(bbox.centerX * scaleX);
      const imgY = Math.round(bbox.centerY * scaleY);
      let sampledColor = this.sampleColorAt(pixels, imgX, imgY, imgWidth, imgHeight);

      // If brand colors provided, snap to nearest
      if (sampledColor && brandColors) {
        const rgb = this.hexToRgb(sampledColor.replace('#', ''));
        if (rgb) {
          sampledColor = this.findNearestBrandColor(rgb, brandColors).hex;
        }
      }

      if (sampledColor) {
        el.setAttribute('fill', sampledColor);
      }
    }

    // Remove gradient definitions
    const defs = svg.querySelector('defs');
    if (defs) {
      defs.remove();
    }

    return svg.outerHTML;
  }

  /**
   * Estimate bounding box and sample points of an SVG element
   * Returns centerX, centerY, and optionally samplePoints for large shapes
   */
  estimateBoundingBox(el, svgWidth, svgHeight) {
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'rect') {
      const x = parseFloat(el.getAttribute('x')) || 0;
      const y = parseFloat(el.getAttribute('y')) || 0;
      const w = parseFloat(el.getAttribute('width')) || 0;
      const h = parseFloat(el.getAttribute('height')) || 0;

      // Check if this is a large background rectangle
      const isBackground = w >= svgWidth * 0.9 && h >= svgHeight * 0.9;
      if (isBackground) {
        return {
          centerX: x + w/2,
          centerY: y + h/2,
          isBackground: true,
          samplePoints: [
            { x: x + 10, y: y + 10 },              // top-left corner
            { x: x + w - 10, y: y + 10 },          // top-right corner
            { x: x + 10, y: y + h - 10 },          // bottom-left corner
            { x: x + w - 10, y: y + h - 10 }       // bottom-right corner
          ]
        };
      }
      return { centerX: x + w/2, centerY: y + h/2 };
    }

    if (tagName === 'circle') {
      const cx = parseFloat(el.getAttribute('cx')) || 0;
      const cy = parseFloat(el.getAttribute('cy')) || 0;
      return { centerX: cx, centerY: cy };
    }

    if (tagName === 'ellipse') {
      const cx = parseFloat(el.getAttribute('cx')) || 0;
      const cy = parseFloat(el.getAttribute('cy')) || 0;
      return { centerX: cx, centerY: cy };
    }

    if (tagName === 'path') {
      // Parse path to find approximate center
      const d = el.getAttribute('d');
      if (!d) return null;

      const points = this.extractPathPoints(d);
      if (points.length === 0) return null;

      // Calculate bounding box
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const bboxWidth = maxX - minX;
      const bboxHeight = maxY - minY;

      // Check if this is a large background path
      const isBackground = bboxWidth >= svgWidth * 0.9 && bboxHeight >= svgHeight * 0.9;
      if (isBackground) {
        return {
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
          isBackground: true,
          samplePoints: [
            { x: minX + 10, y: minY + 10 },              // top-left corner
            { x: maxX - 10, y: minY + 10 },              // top-right corner
            { x: minX + 10, y: maxY - 10 },              // bottom-left corner
            { x: maxX - 10, y: maxY - 10 }               // bottom-right corner
          ]
        };
      }

      // Calculate centroid for normal paths
      let sumX = 0, sumY = 0;
      for (const p of points) {
        sumX += p.x;
        sumY += p.y;
      }
      return { centerX: sumX / points.length, centerY: sumY / points.length };
    }

    if (tagName === 'polygon') {
      const pointsAttr = el.getAttribute('points');
      if (!pointsAttr) return null;

      const points = pointsAttr.trim().split(/\s+/).map(p => {
        const [x, y] = p.split(',').map(parseFloat);
        return { x, y };
      });

      let sumX = 0, sumY = 0;
      for (const p of points) {
        sumX += p.x;
        sumY += p.y;
      }
      return { centerX: sumX / points.length, centerY: sumY / points.length };
    }

    return null;
  }

  /**
   * Extract points from SVG path data
   */
  extractPathPoints(d) {
    const points = [];
    const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];

    let currentX = 0, currentY = 0;

    for (const cmd of commands) {
      const type = cmd[0].toUpperCase();
      const isRelative = cmd[0] === cmd[0].toLowerCase();
      const nums = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

      switch (type) {
        case 'M':
        case 'L':
          for (let i = 0; i < nums.length; i += 2) {
            if (isRelative) {
              currentX += nums[i] || 0;
              currentY += nums[i + 1] || 0;
            } else {
              currentX = nums[i] || 0;
              currentY = nums[i + 1] || 0;
            }
            points.push({ x: currentX, y: currentY });
          }
          break;
        case 'H':
          for (const n of nums) {
            currentX = isRelative ? currentX + n : n;
            points.push({ x: currentX, y: currentY });
          }
          break;
        case 'V':
          for (const n of nums) {
            currentY = isRelative ? currentY + n : n;
            points.push({ x: currentX, y: currentY });
          }
          break;
        case 'C':
          for (let i = 0; i < nums.length; i += 6) {
            const x = isRelative ? currentX + nums[i + 4] : nums[i + 4];
            const y = isRelative ? currentY + nums[i + 5] : nums[i + 5];
            currentX = x;
            currentY = y;
            points.push({ x: currentX, y: currentY });
          }
          break;
        case 'Q':
          for (let i = 0; i < nums.length; i += 4) {
            const x = isRelative ? currentX + nums[i + 2] : nums[i + 2];
            const y = isRelative ? currentY + nums[i + 3] : nums[i + 3];
            currentX = x;
            currentY = y;
            points.push({ x: currentX, y: currentY });
          }
          break;
      }
    }

    return points;
  }

  /**
   * Sample color from original image at given coordinates
   * Uses area sampling for better accuracy
   */
  sampleColorAt(pixels, x, y, width, height) {
    // Clamp coordinates
    x = Math.max(0, Math.min(width - 1, x));
    y = Math.max(0, Math.min(height - 1, y));

    // Sample a small area around the point for more stable color
    const radius = 2;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const sx = Math.max(0, Math.min(width - 1, x + dx));
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        const pixel = pixels[sy][sx];

        if (pixel.a > 128) {
          sumR += pixel.r;
          sumG += pixel.g;
          sumB += pixel.b;
          count++;
        }
      }
    }

    if (count === 0) {
      // Fallback to single pixel
      const pixel = pixels[y][x];
      return this.rgbToHex(pixel.r, pixel.g, pixel.b);
    }

    return this.rgbToHex(
      Math.round(sumR / count),
      Math.round(sumG / count),
      Math.round(sumB / count)
    );
  }

  /**
   * Extract brand colors from image
   */
  async extractBrandColors(imageBuffer) {
    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const { width, height, channels } = info;

    // Build pixel array and detect edges
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

    // Count colors (excluding edge pixels to avoid anti-aliasing)
    const colorCounts = new Map();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];
        if (pixel.a < 128 || isEdgePixel[y][x]) continue;

        // Quantize to buckets of 4
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

    // Convert to color list
    let colors = [];
    for (const [key, data] of colorCounts) {
      if (data.count < this.minColorPixels) continue;
      colors.push({
        r: Math.round(data.sumR / data.count),
        g: Math.round(data.sumG / data.count),
        b: Math.round(data.sumB / data.count),
        count: data.count
      });
    }

    // Merge similar colors
    colors = this.mergeColors(colors);

    // Sort by count and add hex
    colors.sort((a, b) => b.count - a.count);
    colors.forEach(c => {
      c.hex = this.rgbToHex(c.r, c.g, c.b);
    });

    return colors;
  }

  /**
   * Compute edge map for anti-aliasing detection
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
        const neighbors = [[x-1, y], [x+1, y], [x, y-1], [x, y+1]];
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
          const total = existing.count + color.count;
          existing.r = Math.round((existing.r * existing.count + color.r * color.count) / total);
          existing.g = Math.round((existing.g * existing.count + color.g * color.count) / total);
          existing.b = Math.round((existing.b * existing.count + color.b * color.count) / total);
          existing.count = total;
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
   * Remap all colors in SVG to nearest brand color
   */
  remapColors(svgContent, brandColors) {
    if (brandColors.length === 0) return svgContent;

    // Replace hex colors: #RGB or #RRGGBB
    svgContent = svgContent.replace(/#([0-9A-Fa-f]{3,6})\b/g, (match, hex) => {
      const rgb = this.hexToRgb(hex);
      if (!rgb) return match;
      return this.findNearestBrandColor(rgb, brandColors).hex;
    });

    // Replace rgb() colors: rgb(r,g,b)
    svgContent = svgContent.replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/g, (match, r, g, b) => {
      const rgb = { r: parseInt(r), g: parseInt(g), b: parseInt(b) };
      return this.findNearestBrandColor(rgb, brandColors).hex;
    });

    // Replace gradient references with the dominant color from the gradient
    // First, extract gradient definitions and their colors
    const gradientColors = new Map();
    const gradientPattern = /<(linearGradient|radialGradient)[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g;
    let gradientMatch;
    while ((gradientMatch = gradientPattern.exec(svgContent)) !== null) {
      const gradientId = gradientMatch[2];
      const gradientBody = gradientMatch[3];

      // Find stop colors in the gradient
      const stopPattern = /stop-color="([^"]+)"/g;
      let stopMatch;
      const stops = [];
      while ((stopMatch = stopPattern.exec(gradientBody)) !== null) {
        stops.push(stopMatch[1]);
      }

      // Use the first stop color as the representative
      if (stops.length > 0) {
        gradientColors.set(gradientId, stops[0]);
      }
    }

    // Replace gradient references with solid colors
    for (const [gradientId, color] of gradientColors) {
      const rgb = this.hexToRgb(color.replace('#', ''));
      if (rgb) {
        const brandColor = this.findNearestBrandColor(rgb, brandColors);
        svgContent = svgContent.replace(new RegExp(`url\\(#${gradientId}\\)`, 'g'), brandColor.hex);
      }
    }

    // Remove gradient definitions (they're no longer needed)
    svgContent = svgContent.replace(/<defs>[\s\S]*?<\/defs>/g, '');

    return svgContent;
  }

  /**
   * Find the nearest brand color to a given RGB color
   */
  findNearestBrandColor(rgb, brandColors) {
    let nearestColor = brandColors[0];
    let minDist = Infinity;

    for (const brand of brandColors) {
      const dist = this.colorDistanceLab(rgb, brand);
      if (dist < minDist) {
        minDist = dist;
        nearestColor = brand;
      }
    }

    return nearestColor;
  }

  /**
   * Update SVG dimensions to match original
   * IMPORTANT: Only update width/height for display size, NOT viewBox
   * The viewBox defines the coordinate system that path data uses
   */
  updateDimensions(svgContent, width, height) {
    // Update width attribute for display size
    svgContent = svgContent.replace(/width="[^"]*"/, `width="${width}"`);
    // Update height attribute for display size
    svgContent = svgContent.replace(/height="[^"]*"/, `height="${height}"`);
    // DO NOT change viewBox - it defines the coordinate space for the paths
    // The paths are in viewBox coordinates, changing viewBox would break rendering

    return svgContent;
  }

  // Color utility functions
  colorDistance(c1, c2) {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }

  colorDistanceLab(c1, c2) {
    const lab1 = this.rgbToLab(c1.r, c1.g, c1.b);
    const lab2 = this.rgbToLab(c2.r, c2.g, c2.b);
    return Math.sqrt(
      Math.pow(lab1.l - lab2.l, 2) +
      Math.pow(lab1.a - lab2.a, 2) +
      Math.pow(lab1.b - lab2.b, 2)
    );
  }

  rgbToLab(r, g, b) {
    let x = r / 255, y = g / 255, z = b / 255;
    x = x > 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;
    y = y > 0.04045 ? Math.pow((y + 0.055) / 1.055, 2.4) : y / 12.92;
    z = z > 0.04045 ? Math.pow((z + 0.055) / 1.055, 2.4) : z / 12.92;

    x = (x * 0.4124 + y * 0.3576 + z * 0.1805) / 0.95047;
    y = (x * 0.2126 + y * 0.7152 + z * 0.0722) / 1.00000;
    z = (x * 0.0193 + y * 0.1192 + z * 0.9505) / 1.08883;

    x = x > 0.008856 ? Math.pow(x, 1/3) : (7.787 * x) + 16/116;
    y = y > 0.008856 ? Math.pow(y, 1/3) : (7.787 * y) + 16/116;
    z = z > 0.008856 ? Math.pow(z, 1/3) : (7.787 * z) + 16/116;

    return { l: (116 * y) - 16, a: 500 * (x - y), b: 200 * (y - z) };
  }

  rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    if (hex.length !== 6) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }
}

module.exports = AIColorPreservingVectorizer;
