/**
 * SMOOTHING VECTORIZER
 *
 * Uses traditional bitmap tracing for exact color regions,
 * then applies curve smoothing for cleaner edges.
 *
 * Approach:
 * 1. Upscale image for better tracing resolution
 * 2. Trace with imagetracerjs
 * 3. Apply Bezier curve fitting to smooth jagged edges
 * 4. Preserve exact brand colors
 */

const sharp = require('sharp');
const ImageTracer = require('imagetracerjs');

class SmoothingVectorizer {
  constructor(options = {}) {
    this.upscaleFactor = options.upscaleFactor || 3; // Upscale before tracing
    this.colorGroupThreshold = options.colorGroupThreshold || 8;
    this.minColorPixels = options.minColorPixels || 50;
    this.edgeThreshold = options.edgeThreshold || 25;
  }

  async vectorize(imageBuffer, options = {}) {
    const { quantizeColors = true, colorCount = 64 } = options;

    console.log('[SmoothingVectorizer] Starting...');

    // Get original dimensions
    const meta = await sharp(imageBuffer).metadata();
    const origWidth = meta.width;
    const origHeight = meta.height;
    console.log(`[SmoothingVectorizer] Original: ${origWidth}x${origHeight}`);

    // Extract brand colors if quantizing
    let brandColors = null;
    if (quantizeColors) {
      brandColors = await this.extractBrandColors(imageBuffer);
      console.log(`[SmoothingVectorizer] Brand colors: ${brandColors.map(c => c.hex).join(', ')}`);
    }

    // Upscale for better tracing
    const upscaledWidth = origWidth * this.upscaleFactor;
    const upscaledHeight = origHeight * this.upscaleFactor;
    const upscaledBuffer = await sharp(imageBuffer)
      .resize(upscaledWidth, upscaledHeight, {
        kernel: 'lanczos3',
        withoutEnlargement: false
      })
      .png()
      .toBuffer();
    console.log(`[SmoothingVectorizer] Upscaled to: ${upscaledWidth}x${upscaledHeight}`);

    // Get raw RGBA for imagetracer
    const { data, info } = await sharp(upscaledBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const imageData = {
      width: info.width,
      height: info.height,
      data: new Uint8ClampedArray(data)
    };

    // Trace with smoothed settings
    console.log('[SmoothingVectorizer] Tracing...');
    const traceOptions = {
      // Core tracing
      colorsampling: 2,   // Deterministic color sampling
      numberofcolors: Math.min(colorCount, 64),
      mincolorratio: 0.01,
      colorquantcycles: 5,

      // Path generation - key for smoothness
      ltres: 0.5,        // Line threshold - lower = more detail but smoother
      qtres: 0.5,        // Quadratic spline threshold
      pathomit: 4,       // Omit paths smaller than this

      // Blur for anti-alias handling
      blurradius: 1,
      blurdelta: 15,

      // Output
      strokewidth: 0,
      scale: 1,
      roundcoords: 2,
      desc: false,
      viewbox: true,
      linefilter: true
    };

    const svgContent = ImageTracer.imagedataToSVG(imageData, traceOptions);

    // Apply path smoothing
    console.log('[SmoothingVectorizer] Smoothing paths...');
    let smoothedSvg = this.smoothPaths(svgContent);

    // Snap colors to brand colors if available
    if (brandColors && brandColors.length > 0) {
      console.log('[SmoothingVectorizer] Snapping to brand colors...');
      smoothedSvg = this.snapToBrandColors(smoothedSvg, brandColors);
    }

    // Clean up SVG for Adobe Illustrator compatibility
    console.log('[SmoothingVectorizer] Cleaning up for Illustrator...');
    smoothedSvg = this.cleanupForIllustrator(smoothedSvg);

    // Update viewBox to original dimensions (paths stay in upscaled coords, viewBox scales them)
    smoothedSvg = this.updateViewBox(smoothedSvg, origWidth, origHeight);

    console.log('[SmoothingVectorizer] Done');
    return smoothedSvg;
  }

  /**
   * Smooth SVG paths by converting to Bezier curves
   */
  smoothPaths(svgContent) {
    // Extract all path d attributes and smooth them
    return svgContent.replace(/ d="([^"]+)"/g, (match, d) => {
      const smoothed = this.smoothPathData(d);
      return ` d="${smoothed}"`;
    });
  }

  /**
   * Smooth a single path's d attribute
   * Converts polylines to smooth Bezier curves
   */
  smoothPathData(d) {
    // Parse the path into segments
    const commands = [];
    const regex = /([MLQCZHV])([^MLQCZHV]*)/gi;
    let match;

    while ((match = regex.exec(d)) !== null) {
      const cmd = match[1].toUpperCase();
      const args = match[2].trim().split(/[\s,]+/).filter(s => s).map(parseFloat);
      commands.push({ cmd, args });
    }

    if (commands.length < 3) return d;

    // Collect points from the path
    const points = [];
    let currentX = 0, currentY = 0;

    for (const { cmd, args } of commands) {
      if (cmd === 'M' || cmd === 'L') {
        for (let i = 0; i < args.length; i += 2) {
          currentX = args[i];
          currentY = args[i + 1];
          points.push({ x: currentX, y: currentY, cmd: cmd === 'M' ? 'M' : 'L' });
        }
      } else if (cmd === 'Q') {
        for (let i = 0; i < args.length; i += 4) {
          currentX = args[i + 2];
          currentY = args[i + 3];
          points.push({
            x: currentX,
            y: currentY,
            cmd: 'Q',
            cx: args[i],
            cy: args[i + 1]
          });
        }
      } else if (cmd === 'Z') {
        points.push({ cmd: 'Z' });
      }
    }

    // Generate smooth Bezier curves
    return this.generateSmoothPath(points);
  }

  /**
   * Generate smooth path from points using Catmull-Rom to Bezier conversion
   */
  generateSmoothPath(points) {
    if (points.length < 2) return '';

    const result = [];
    let started = false;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      if (p.cmd === 'Z') {
        result.push('Z');
        started = false;
        continue;
      }

      if (p.cmd === 'M' || !started) {
        result.push(`M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
        started = true;
        continue;
      }

      // For each line segment, convert to a smooth curve
      const prev = points[i - 1];
      if (prev.cmd === 'Z') {
        result.push(`M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
        continue;
      }

      // If already a quadratic curve, keep it
      if (p.cmd === 'Q') {
        result.push(`Q ${p.cx.toFixed(2)} ${p.cy.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
        continue;
      }

      // For short segments, just use line
      const dist = Math.sqrt(Math.pow(p.x - prev.x, 2) + Math.pow(p.y - prev.y, 2));
      if (dist < 3) {
        result.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
        continue;
      }

      // Get surrounding points for curve calculation
      const prevPrev = i >= 2 && points[i-2].cmd !== 'Z' && points[i-2].cmd !== 'M' ? points[i-2] : prev;
      const next = i < points.length - 1 && points[i+1].cmd !== 'Z' ? points[i+1] : p;

      // Calculate control points using Catmull-Rom
      const tension = 0.5;
      const cp1x = prev.x + (p.x - prevPrev.x) * tension / 3;
      const cp1y = prev.y + (p.y - prevPrev.y) * tension / 3;
      const cp2x = p.x - (next.x - prev.x) * tension / 3;
      const cp2y = p.y - (next.y - prev.y) * tension / 3;

      result.push(`C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
    }

    return result.join(' ');
  }

  /**
   * Snap all colors in SVG to nearest brand colors
   */
  snapToBrandColors(svgContent, brandColors) {
    // Replace fill colors
    svgContent = svgContent.replace(/fill="([^"]+)"/g, (match, color) => {
      if (color === 'none' || color === 'transparent') return match;
      const rgb = this.parseColor(color);
      if (!rgb) return match;
      const nearest = this.findNearestBrandColor(rgb, brandColors);
      return `fill="${nearest.hex}"`;
    });

    // Replace stroke colors
    svgContent = svgContent.replace(/stroke="([^"]+)"/g, (match, color) => {
      if (color === 'none' || color === 'transparent') return match;
      const rgb = this.parseColor(color);
      if (!rgb) return match;
      const nearest = this.findNearestBrandColor(rgb, brandColors);
      return `stroke="${nearest.hex}"`;
    });

    return svgContent;
  }

  parseColor(color) {
    // Hex
    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    }
    // RGB
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3])
      };
    }
    return null;
  }

  findNearestBrandColor(rgb, brandColors) {
    let nearest = brandColors[0];
    let minDist = Infinity;

    for (const brand of brandColors) {
      const dist = this.colorDistanceLab(rgb, brand);
      if (dist < minDist) {
        minDist = dist;
        nearest = brand;
      }
    }
    return nearest;
  }

  /**
   * Clean up SVG for Adobe Illustrator compatibility
   * Removes problematic attributes that cause selection/visibility issues
   */
  cleanupForIllustrator(svgContent) {
    // Remove opacity="0" which makes paths invisible/unselectable
    svgContent = svgContent.replace(/ opacity="0"/g, '');

    // Remove stroke-width="0" (unnecessary)
    svgContent = svgContent.replace(/ stroke-width="0"/g, '');

    // Remove stroke that matches fill (redundant for filled shapes)
    svgContent = svgContent.replace(/ stroke="([^"]+)"([^>]*fill="\1")/g, '$2');
    svgContent = svgContent.replace(/(fill="([^"]+)"[^>]*) stroke="\2"/g, '$1');

    // Remove empty/redundant attributes
    svgContent = svgContent.replace(/ stroke="none"/g, '');
    svgContent = svgContent.replace(/ opacity="1"/g, '');

    return svgContent;
  }

  updateViewBox(svgContent, width, height) {
    // Set display size and viewBox
    svgContent = svgContent.replace(/<svg[^>]*>/, (match) => {
      // Remove existing dimensions
      let svg = match.replace(/width="[^"]*"/g, '');
      svg = svg.replace(/height="[^"]*"/g, '');
      svg = svg.replace(/viewBox="[^"]*"/g, '');

      // Insert new dimensions before closing >
      const insertPos = svg.lastIndexOf('>');
      const upW = width * this.upscaleFactor;
      const upH = height * this.upscaleFactor;
      return svg.slice(0, insertPos) +
        ` width="${width}" height="${height}" viewBox="0 0 ${upW} ${upH}"` +
        svg.slice(insertPos);
    });
    return svgContent;
  }

  // Brand color extraction (same as AIColorPreservingVectorizer)
  async extractBrandColors(imageBuffer) {
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

    const isEdgePixel = this.computeEdgeMap(pixels, width, height);
    const colorCounts = new Map();

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixel = pixels[y][x];
        if (pixel.a < 128 || isEdgePixel[y][x]) continue;

        const key = `${Math.round(pixel.r / 4) * 4},${Math.round(pixel.g / 4) * 4},${Math.round(pixel.b / 4) * 4}`;
        const existing = colorCounts.get(key);
        if (existing) {
          existing.count++;
          existing.sumR += pixel.r;
          existing.sumG += pixel.g;
          existing.sumB += pixel.b;
        } else {
          colorCounts.set(key, { count: 1, sumR: pixel.r, sumG: pixel.g, sumB: pixel.b });
        }
      }
    }

    let colors = [];
    for (const [, data] of colorCounts) {
      if (data.count < this.minColorPixels) continue;
      colors.push({
        r: Math.round(data.sumR / data.count),
        g: Math.round(data.sumG / data.count),
        b: Math.round(data.sumB / data.count),
        count: data.count
      });
    }

    colors = this.mergeColors(colors);
    colors.sort((a, b) => b.count - a.count);
    colors.forEach(c => {
      c.hex = this.rgbToHex(c.r, c.g, c.b);
    });

    return colors;
  }

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
      if (!foundMatch) merged.push({ ...color });
    }
    return merged;
  }

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
}

module.exports = SmoothingVectorizer;
