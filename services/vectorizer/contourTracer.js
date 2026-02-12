/**
 * Contour Tracing Module
 *
 * Uses Marching Squares algorithm to extract contours with sub-pixel precision.
 * Handles:
 * - Outer contours (positive loops)
 * - Inner contours / holes (negative loops)
 * - Sub-pixel boundary positioning from anti-aliasing
 */

class ContourTracer {
  constructor(options = {}) {
    this.simplifyTolerance = options.simplifyTolerance || 1.0;
    // Chaikin smoothing iterations (0 = disabled, 2-3 recommended)
    this.chaikinIterations = options.chaikinIterations !== undefined ? options.chaikinIterations : 2;
    // Sub-pixel extraction using alpha values
    this.subPixelPrecision = options.subPixelPrecision !== false;
    // Alpha data for sub-pixel extraction (set externally)
    this.alphaData = null;
    this.imageWidth = 0;
    this.imageHeight = 0;
  }

  /**
   * Set alpha data for sub-pixel extraction
   */
  setAlphaData(alphaData, width, height) {
    this.alphaData = alphaData;
    this.imageWidth = width;
    this.imageHeight = height;
  }

  /**
   * Trace all contours for a region
   * @param {Object} region - Region with pixels array
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @returns {Array} Array of contours, each is array of {x, y} points
   */
  trace(region, width, height) {
    // Create binary mask for this region
    const mask = this.createMask(region.pixels, width, height);

    // Find all contours using marching squares
    const contours = this.marchingSquares(mask, width, height);

    // Process contours: simplify, then smooth
    const processed = contours.map(contour => {
      // Step 1: Apply sub-pixel refinement if enabled
      let refined = this.subPixelPrecision && this.alphaData
        ? this.refineSubPixel(contour)
        : contour;

      // Step 2: Douglas-Peucker simplification
      let simplified = this.simplifyContour(refined, this.simplifyTolerance);

      // Step 3: Apply Chaikin corner cutting for smooth curves
      if (this.chaikinIterations > 0 && simplified.length >= 3) {
        simplified = this.chaikinSmooth(simplified, this.chaikinIterations);
      }

      return simplified;
    }).filter(c => c.length >= 3);

    return processed;
  }

  /**
   * Chaikin's corner cutting algorithm for curve smoothing
   * Creates smooth curves by iteratively cutting corners
   * @param {Array} points - Array of {x, y} points
   * @param {number} iterations - Number of smoothing iterations
   * @returns {Array} Smoothed points
   */
  chaikinSmooth(points, iterations) {
    if (points.length < 3 || iterations <= 0) return points;

    let result = points;

    for (let iter = 0; iter < iterations; iter++) {
      const newPoints = [];
      const n = result.length;

      for (let i = 0; i < n; i++) {
        const p0 = result[i];
        const p1 = result[(i + 1) % n];

        // Cut corner at 1/4 and 3/4 points
        const q = {
          x: 0.75 * p0.x + 0.25 * p1.x,
          y: 0.75 * p0.y + 0.25 * p1.y
        };
        const r = {
          x: 0.25 * p0.x + 0.75 * p1.x,
          y: 0.25 * p0.y + 0.75 * p1.y
        };

        newPoints.push(q, r);
      }

      result = newPoints;
    }

    return result;
  }

  /**
   * Refine contour points to sub-pixel precision using alpha values
   * Interpolates boundary position based on alpha gradient
   * @param {Array} points - Array of {x, y} points
   * @returns {Array} Refined points with sub-pixel precision
   */
  refineSubPixel(points) {
    if (!this.alphaData || points.length < 2) return points;

    return points.map(point => {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);

      // Get alpha values around this point
      const alpha = this.getAlpha(x, y);
      const alphaLeft = this.getAlpha(x - 1, y);
      const alphaRight = this.getAlpha(x + 1, y);
      const alphaUp = this.getAlpha(x, y - 1);
      const alphaDown = this.getAlpha(x, y + 1);

      // Calculate sub-pixel offset based on alpha gradient
      let dx = 0, dy = 0;

      // Horizontal interpolation
      if (alphaLeft !== alpha || alphaRight !== alpha) {
        const gradX = (alphaRight - alphaLeft) / 510; // Normalize to [-0.5, 0.5]
        dx = -gradX * 0.5;
      }

      // Vertical interpolation
      if (alphaUp !== alpha || alphaDown !== alpha) {
        const gradY = (alphaDown - alphaUp) / 510;
        dy = -gradY * 0.5;
      }

      return {
        x: point.x + dx,
        y: point.y + dy
      };
    });
  }

  /**
   * Get alpha value at pixel coordinates
   */
  getAlpha(x, y) {
    if (!this.alphaData) return 255;
    if (x < 0 || x >= this.imageWidth || y < 0 || y >= this.imageHeight) return 0;
    // Alpha is every 4th byte in RGBA data
    return this.alphaData[(y * this.imageWidth + x) * 4 + 3];
  }

  /**
   * Create binary mask from pixels
   */
  createMask(pixels, width, height) {
    const mask = new Uint8Array(width * height);
    for (const p of pixels) {
      mask[p.y * width + p.x] = 1;
    }
    return mask;
  }

  /**
   * Marching Squares algorithm for contour extraction
   */
  marchingSquares(mask, width, height) {
    const contours = [];
    const visited = new Set();

    // Scan for contour start points
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Look for edge: pixel is set but left neighbor is not
        if (mask[idx] && (x === 0 || !mask[idx - 1])) {
          const key = `${x},${y}`;
          if (visited.has(key)) continue;

          const contour = this.traceContour(mask, width, height, x, y, visited);
          if (contour.length >= 3) {
            contours.push(contour);
          }
        }
      }
    }

    return contours;
  }

  /**
   * Trace a single contour starting from given point
   */
  traceContour(mask, width, height, startX, startY, visited) {
    const contour = [];
    let x = startX;
    let y = startY;
    let dir = 0; // 0=right, 1=down, 2=left, 3=up

    // Direction vectors
    const dx = [1, 0, -1, 0];
    const dy = [0, 1, 0, -1];

    const getPixel = (px, py) => {
      if (px < 0 || px >= width || py < 0 || py >= height) return 0;
      return mask[py * width + px];
    };

    let steps = 0;
    const maxSteps = width * height * 4;

    do {
      // Add current point to contour
      contour.push({ x: x + 0.5, y: y + 0.5 }); // Center of pixel
      visited.add(`${x},${y}`);

      // Find next direction (turn right, go straight, turn left, turn back)
      const rightDir = (dir + 3) % 4;
      const straightDir = dir;
      const leftDir = (dir + 1) % 4;
      const backDir = (dir + 2) % 4;

      // Check pixels in order: right, straight, left, back
      const rightX = x + dx[rightDir];
      const rightY = y + dy[rightDir];
      const straightX = x + dx[straightDir];
      const straightY = y + dy[straightDir];
      const leftX = x + dx[leftDir];
      const leftY = y + dy[leftDir];

      if (getPixel(rightX, rightY)) {
        x = rightX;
        y = rightY;
        dir = rightDir;
      } else if (getPixel(straightX, straightY)) {
        x = straightX;
        y = straightY;
        dir = straightDir;
      } else if (getPixel(leftX, leftY)) {
        x = leftX;
        y = leftY;
        dir = leftDir;
      } else {
        // Turn back
        dir = backDir;
      }

      steps++;
    } while ((x !== startX || y !== startY) && steps < maxSteps);

    return contour;
  }

  /**
   * Douglas-Peucker line simplification
   */
  simplifyContour(points, tolerance) {
    if (points.length <= 2) return points;

    // Find point with maximum distance from line
    let maxDist = 0;
    let maxIdx = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.pointToLineDistance(points[i], start, end);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    // If max distance is greater than tolerance, recursively simplify
    if (maxDist > tolerance) {
      const left = this.simplifyContour(points.slice(0, maxIdx + 1), tolerance);
      const right = this.simplifyContour(points.slice(maxIdx), tolerance);
      return [...left.slice(0, -1), ...right];
    }

    // Otherwise, return just start and end
    return [start, end];
  }

  /**
   * Calculate perpendicular distance from point to line
   */
  pointToLineDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) {
      return Math.sqrt(
        (point.x - lineStart.x) ** 2 +
        (point.y - lineStart.y) ** 2
      );
    }

    const t = Math.max(0, Math.min(1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)
    ));

    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }
}

module.exports = ContourTracer;
