/**
 * Shape Classification Module
 *
 * Determines whether a contour represents a geometric primitive or organic shape.
 *
 * Philosophy:
 * - Only classify as geometric if there's HIGH CONFIDENCE
 * - When in doubt, preserve the original shape (trace as curves)
 * - Geometric shapes: circle, ellipse, rectangle, line, polygon with straight edges
 * - Organic shapes: everything else (curves, complex paths)
 *
 * This ensures we don't incorrectly force a complex logo element into a circle
 * when it's actually a stylized organic shape.
 */

class ShapeClassifier {
  constructor(options = {}) {
    // Confidence threshold for geometric classification
    // Higher = more conservative (less likely to classify as geometric)
    this.confidenceThreshold = options.confidenceThreshold || 0.92;

    // Tolerance for shape fitting (as fraction of shape size)
    this.fitTolerance = options.fitTolerance || 0.02; // 2% of size

    // Minimum points to attempt shape detection
    this.minPoints = options.minPoints || 8;

    // Corner detection angle threshold (degrees)
    this.cornerAngle = (options.cornerAngle || 25) * Math.PI / 180;
  }

  /**
   * Classify a contour and return shape info
   * @param {Array} points - Contour points [{x, y}, ...]
   * @returns {Object} { type, confidence, params, isGeometric }
   */
  classify(points) {
    if (!points || points.length < this.minPoints) {
      return { type: 'path', isGeometric: false, confidence: 0 };
    }

    // Calculate basic metrics
    const bounds = this.getBounds(points);
    const centroid = this.getCentroid(points);
    const corners = this.detectCorners(points);

    // Try each shape type in order of specificity
    const candidates = [];

    // 1. Try line (if very thin)
    const lineResult = this.tryLine(points, bounds);
    if (lineResult.confidence > 0.8) {
      candidates.push(lineResult);
    }

    // 2. Try circle
    const circleResult = this.tryCircle(points, centroid, bounds);
    if (circleResult.confidence > 0.5) {
      candidates.push(circleResult);
    }

    // 3. Try ellipse (only if not circular)
    if (circleResult.confidence < 0.9) {
      const ellipseResult = this.tryEllipse(points, centroid, bounds);
      if (ellipseResult.confidence > 0.5) {
        candidates.push(ellipseResult);
      }
    }

    // 4. Try rectangle (if has 4 corners)
    if (corners.length >= 4 && corners.length <= 6) {
      const rectResult = this.tryRectangle(points, corners, bounds);
      if (rectResult.confidence > 0.5) {
        candidates.push(rectResult);
      }
    }

    // 5. Try polygon (if has clear corners)
    if (corners.length >= 3 && corners.length <= 12) {
      const polyResult = this.tryPolygon(points, corners);
      if (polyResult.confidence > 0.5) {
        candidates.push(polyResult);
      }
    }

    // Select best candidate
    if (candidates.length === 0) {
      return { type: 'path', isGeometric: false, confidence: 0 };
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];

    // Only return as geometric if confidence exceeds threshold
    if (best.confidence >= this.confidenceThreshold) {
      return {
        ...best,
        isGeometric: true
      };
    }

    return { type: 'path', isGeometric: false, confidence: best.confidence, suggestedShape: best };
  }

  /**
   * Try to fit as a line
   */
  tryLine(points, bounds) {
    const aspectRatio = bounds.width / bounds.height;
    const inverseAspect = bounds.height / bounds.width;

    // Check if very thin (aspect ratio > 10:1)
    if (aspectRatio < 10 && inverseAspect < 10) {
      return { type: 'line', confidence: 0 };
    }

    // Calculate line endpoints
    let start, end;
    if (aspectRatio > inverseAspect) {
      // Horizontal-ish line
      start = { x: bounds.minX, y: bounds.minY + bounds.height / 2 };
      end = { x: bounds.maxX, y: bounds.minY + bounds.height / 2 };
    } else {
      // Vertical-ish line
      start = { x: bounds.minX + bounds.width / 2, y: bounds.minY };
      end = { x: bounds.minX + bounds.width / 2, y: bounds.maxY };
    }

    // Calculate fit error
    let maxError = 0;
    for (const p of points) {
      const error = this.pointToLineDistance(p, start, end);
      maxError = Math.max(maxError, error);
    }

    const size = Math.max(bounds.width, bounds.height);
    const normalizedError = maxError / size;

    const confidence = normalizedError < this.fitTolerance ? 0.95 : 0;

    return {
      type: 'line',
      confidence,
      params: { start, end, strokeWidth: Math.min(bounds.width, bounds.height) }
    };
  }

  /**
   * Try to fit as a circle
   */
  tryCircle(points, centroid, bounds) {
    // Calculate average radius from centroid
    let sumR = 0;
    const radii = [];

    for (const p of points) {
      const r = Math.sqrt((p.x - centroid.x) ** 2 + (p.y - centroid.y) ** 2);
      radii.push(r);
      sumR += r;
    }

    const avgR = sumR / points.length;

    // Calculate variance
    let maxDeviation = 0;
    let sumDeviation = 0;

    for (const r of radii) {
      const deviation = Math.abs(r - avgR) / avgR;
      maxDeviation = Math.max(maxDeviation, deviation);
      sumDeviation += deviation;
    }

    const avgDeviation = sumDeviation / radii.length;

    // Check aspect ratio (should be close to 1:1)
    const aspectRatio = bounds.width / bounds.height;
    const aspectScore = 1 - Math.abs(1 - aspectRatio);

    // Calculate confidence
    const radiusScore = 1 - maxDeviation;
    const confidence = Math.min(radiusScore, aspectScore);

    return {
      type: 'circle',
      confidence,
      params: {
        cx: centroid.x,
        cy: centroid.y,
        r: avgR
      }
    };
  }

  /**
   * Try to fit as an ellipse
   */
  tryEllipse(points, centroid, bounds) {
    const rx = bounds.width / 2;
    const ry = bounds.height / 2;

    // Calculate fit error
    let maxDeviation = 0;

    for (const p of points) {
      // Normalized distance from center
      const nx = (p.x - centroid.x) / rx;
      const ny = (p.y - centroid.y) / ry;

      // Distance to unit circle (should be 1 for perfect ellipse)
      const d = Math.sqrt(nx * nx + ny * ny);
      const deviation = Math.abs(d - 1);
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    const confidence = maxDeviation < this.fitTolerance * 3 ? (1 - maxDeviation / 0.1) : 0;

    return {
      type: 'ellipse',
      confidence: Math.max(0, Math.min(1, confidence)),
      params: {
        cx: centroid.x,
        cy: centroid.y,
        rx,
        ry
      }
    };
  }

  /**
   * Try to fit as a rectangle
   */
  tryRectangle(points, corners, bounds) {
    if (corners.length < 4) {
      return { type: 'rect', confidence: 0 };
    }

    // Check if corners form roughly 90-degree angles
    let rightAngleCount = 0;

    for (let i = 0; i < corners.length; i++) {
      const prev = corners[(i - 1 + corners.length) % corners.length];
      const curr = corners[i];
      const next = corners[(i + 1) % corners.length];

      const angle = this.calculateAngle(prev.point, curr.point, next.point);
      const angleDeg = Math.abs(angle * 180 / Math.PI);

      // Check if close to 90 degrees
      if (Math.abs(angleDeg - 90) < 15) {
        rightAngleCount++;
      }
    }

    // Need at least 4 right angles
    if (rightAngleCount < 4) {
      return { type: 'rect', confidence: 0 };
    }

    // Calculate fit error (how well points lie on rectangle boundary)
    let onBoundary = 0;
    const tolerance = Math.max(bounds.width, bounds.height) * this.fitTolerance * 2;

    for (const p of points) {
      const onLeft = Math.abs(p.x - bounds.minX) <= tolerance;
      const onRight = Math.abs(p.x - bounds.maxX) <= tolerance;
      const onTop = Math.abs(p.y - bounds.minY) <= tolerance;
      const onBottom = Math.abs(p.y - bounds.maxY) <= tolerance;

      if (onLeft || onRight || onTop || onBottom) {
        onBoundary++;
      }
    }

    const boundaryRatio = onBoundary / points.length;
    const confidence = boundaryRatio >= 0.85 ? boundaryRatio : 0;

    return {
      type: 'rect',
      confidence,
      params: {
        x: bounds.minX,
        y: bounds.minY,
        width: bounds.width,
        height: bounds.height
      }
    };
  }

  /**
   * Try to fit as a polygon with straight edges
   */
  tryPolygon(points, corners) {
    if (corners.length < 3) {
      return { type: 'polygon', confidence: 0 };
    }

    // Extract corner points
    const vertices = corners.map(c => c.point);

    // Check if all points lie close to polygon edges
    let maxError = 0;
    let sumError = 0;

    for (const p of points) {
      let minDist = Infinity;

      // Find distance to nearest edge
      for (let i = 0; i < vertices.length; i++) {
        const v1 = vertices[i];
        const v2 = vertices[(i + 1) % vertices.length];
        const dist = this.pointToLineDistance(p, v1, v2);
        minDist = Math.min(minDist, dist);
      }

      maxError = Math.max(maxError, minDist);
      sumError += minDist;
    }

    // Calculate size-normalized error
    const bounds = this.getBounds(vertices);
    const size = Math.max(bounds.width, bounds.height);
    const normalizedError = maxError / size;

    const confidence = normalizedError < this.fitTolerance * 2 ? (1 - normalizedError / 0.1) : 0;

    return {
      type: 'polygon',
      confidence: Math.max(0, Math.min(1, confidence)),
      params: {
        vertices
      }
    };
  }

  /**
   * Detect corners in contour
   */
  detectCorners(points) {
    const corners = [];
    const n = points.length;

    // Use a window to smooth angle calculation
    const windowSize = Math.max(3, Math.floor(n / 20));

    for (let i = 0; i < n; i++) {
      const prevIdx = (i - windowSize + n) % n;
      const nextIdx = (i + windowSize) % n;

      const prev = points[prevIdx];
      const curr = points[i];
      const next = points[nextIdx];

      const angle = this.calculateAngle(prev, curr, next);

      // Check if this is a sharp corner
      if (Math.abs(Math.PI - angle) > this.cornerAngle) {
        corners.push({
          index: i,
          point: curr,
          angle: angle * 180 / Math.PI
        });
      }
    }

    // Merge nearby corners
    return this.mergeNearbyCorners(corners, points.length);
  }

  /**
   * Merge corners that are too close together
   */
  mergeNearbyCorners(corners, totalPoints) {
    if (corners.length < 2) return corners;

    const minDistance = Math.floor(totalPoints / 20);
    const merged = [corners[0]];

    for (let i = 1; i < corners.length; i++) {
      const last = merged[merged.length - 1];
      const curr = corners[i];

      if (curr.index - last.index >= minDistance) {
        merged.push(curr);
      } else if (Math.abs(curr.angle - 90) < Math.abs(last.angle - 90)) {
        // Keep the one closer to 90 degrees
        merged[merged.length - 1] = curr;
      }
    }

    return merged;
  }

  /**
   * Calculate angle at point B in A-B-C
   */
  calculateAngle(a, b, c) {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const cross = v1.x * v2.y - v1.y * v2.x;

    return Math.atan2(Math.abs(cross), dot);
  }

  /**
   * Get bounding box
   */
  getBounds(points) {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    return {
      minX, maxX, minY, maxY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  /**
   * Get centroid of points
   */
  getCentroid(points) {
    let sumX = 0, sumY = 0;

    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
    }

    return {
      x: sumX / points.length,
      y: sumY / points.length
    };
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

module.exports = ShapeClassifier;
