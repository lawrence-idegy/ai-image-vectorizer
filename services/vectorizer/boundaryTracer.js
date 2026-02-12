/**
 * BOUNDARY TRACER
 *
 * Traces boundaries between color regions using sub-pixel edge data.
 *
 * Uses the pre-built edge chains from EdgeDetector which are already
 * connected sequences of edge pixels. Assigns each chain to colors
 * based on what colors it borders.
 */

class BoundaryTracer {
  constructor(options = {}) {
    // Minimum contour length (points)
    this.minContourLength = options.minContourLength || 4;

    // Simplification tolerance
    this.simplifyTolerance = options.simplifyTolerance || 0.5;

    // Smoothing iterations
    this.smoothIterations = options.smoothIterations || 1;
  }

  /**
   * Trace all region boundaries
   * @param {Object} edgeData - Output from EdgeDetector
   * @returns {Array} Array of { color, contours: [outer, ...holes] }
   */
  trace(edgeData) {
    const { width, height, colors, colorMap, edgeChains } = edgeData;

    console.log('[BoundaryTracer] Tracing boundaries...');
    console.log(`[BoundaryTracer] Input: ${edgeChains.length} edge chains, ${colors.length} colors`);

    // For each color, collect edge chains that border it
    const colorChains = new Map();
    for (const color of colors) {
      colorChains.set(color.hex, []);
    }

    // Assign each edge chain to the colors it borders
    for (const chain of edgeChains) {
      if (chain.length < this.minContourLength) continue;

      // Sample colors along the chain
      const borderingColors = this.findBorderingColors(chain, colorMap, width, height);

      // Add chain to each color it borders
      for (const colorHex of borderingColors) {
        if (colorChains.has(colorHex)) {
          // Convert chain to contour format (just {x, y} points)
          const contour = chain.map(p => ({ x: p.x, y: p.y }));
          colorChains.get(colorHex).push(contour);
        }
      }
    }

    // Build regions from color chains
    const regions = [];
    for (const color of colors) {
      const chains = colorChains.get(color.hex);
      if (!chains || chains.length === 0) continue;

      // Process each chain (simplify, smooth)
      const processedContours = chains.map(contour => {
        let processed = this.simplifyContour(contour, this.simplifyTolerance);
        processed = this.smoothContour(processed, this.smoothIterations);
        return processed;
      }).filter(c => c.length >= this.minContourLength);

      if (processedContours.length > 0) {
        regions.push({
          color: color,
          contours: processedContours
        });
      }
    }

    console.log(`[BoundaryTracer] Traced ${regions.length} color regions`);
    return regions;
  }

  /**
   * Find colors that border an edge chain
   * Samples the colorMap on both sides of edge pixels
   */
  findBorderingColors(chain, colorMap, width, height) {
    const borderingColors = new Set();

    // Sample at intervals along the chain
    const sampleInterval = Math.max(1, Math.floor(chain.length / 20));

    for (let i = 0; i < chain.length; i += sampleInterval) {
      const point = chain[i];
      const direction = point.direction || 0;

      // Sample perpendicular to edge direction
      const perpX = Math.cos(direction + Math.PI / 2);
      const perpY = Math.sin(direction + Math.PI / 2);

      // Sample both sides of the edge
      for (const side of [-1, 1]) {
        const sampleX = Math.round(point.pixelX + side * perpX);
        const sampleY = Math.round(point.pixelY + side * perpY);

        if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height) {
          const color = colorMap[sampleY][sampleX];
          if (color) {
            borderingColors.add(color);
          }
        }
      }
    }

    return borderingColors;
  }

  /**
   * Douglas-Peucker simplification
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

    return [start, end];
  }

  /**
   * Smooth contour using Chaikin's algorithm
   */
  smoothContour(points, iterations) {
    if (points.length < 3 || iterations <= 0) return points;

    let result = points;

    for (let iter = 0; iter < iterations; iter++) {
      const newPoints = [];
      const n = result.length;

      for (let i = 0; i < n - 1; i++) {
        const p0 = result[i];
        const p1 = result[i + 1];

        // Cut corner at 1/4 and 3/4
        newPoints.push({
          x: 0.75 * p0.x + 0.25 * p1.x,
          y: 0.75 * p0.y + 0.25 * p1.y
        });
        newPoints.push({
          x: 0.25 * p0.x + 0.75 * p1.x,
          y: 0.25 * p0.y + 0.75 * p1.y
        });
      }

      // Keep last point for open contours
      newPoints.push(result[n - 1]);

      result = newPoints;
    }

    return result;
  }

  /**
   * Point to line distance
   */
  pointToLineDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    if (len === 0) {
      return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    const t = Math.max(0, Math.min(1,
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (len * len)
    ));

    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }
}

module.exports = BoundaryTracer;
