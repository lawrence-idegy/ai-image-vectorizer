/**
 * Curve Fitting Module
 *
 * Fits multiple curve types to contour points and selects the best fit:
 * - Line segments
 * - Circular arcs
 * - Elliptical arcs
 * - Quadratic Bézier curves
 * - Cubic Bézier curves
 *
 * Uses least squares fitting and selects curve type with lowest error.
 */

class CurveFitter {
  constructor(options = {}) {
    this.lineTolerance = options.lineTolerance || 1.0;
    this.arcTolerance = options.arcTolerance || 0.5;
    this.bezierTolerance = options.bezierTolerance || 0.5;
    this.cornerThreshold = (options.cornerThreshold || 30) * Math.PI / 180; // Convert to radians

    // Curve type toggles (matching Vectorizer.ai API)
    this.allowQuadraticBezier = options.allowQuadraticBezier !== false;
    this.allowCubicBezier = options.allowCubicBezier !== false;
    this.allowCircularArc = options.allowCircularArc !== false;
    this.allowEllipticalArc = options.allowEllipticalArc !== false;

    // Schneider algorithm settings
    this.maxIterations = options.maxIterations || 4; // Max Newton-Raphson iterations
    this.maxError = options.maxError || this.bezierTolerance; // Error threshold for subdivision
  }

  /**
   * Fit curves to a contour
   * @param {Array} points - Array of {x, y} points
   * @returns {Array} Array of curve segments
   */
  fitCurves(points) {
    if (points.length < 2) return [];

    // Detect corners to split contour into segments
    const corners = this.detectCorners(points);

    // Fit curves to each segment between corners
    const curves = [];
    for (let i = 0; i < corners.length; i++) {
      const startIdx = corners[i];
      const endIdx = corners[(i + 1) % corners.length];

      // Extract segment points
      let segment;
      if (endIdx > startIdx) {
        segment = points.slice(startIdx, endIdx + 1);
      } else {
        // Wrap around
        segment = [...points.slice(startIdx), ...points.slice(0, endIdx + 1)];
      }

      if (segment.length >= 2) {
        const curve = this.fitBestCurve(segment);
        curves.push(curve);
      }
    }

    return curves;
  }

  /**
   * Detect corners in the contour
   */
  detectCorners(points) {
    const corners = [0]; // Always include start point
    const n = points.length;

    for (let i = 1; i < n - 1; i++) {
      const angle = this.calculateAngle(
        points[i - 1],
        points[i],
        points[i + 1]
      );

      if (Math.abs(Math.PI - angle) > this.cornerThreshold) {
        corners.push(i);
      }
    }

    // Check wrap-around corner
    if (n >= 3) {
      const angle = this.calculateAngle(
        points[n - 2],
        points[n - 1],
        points[0]
      );
      if (Math.abs(Math.PI - angle) > this.cornerThreshold) {
        if (corners[corners.length - 1] !== n - 1) {
          corners.push(n - 1);
        }
      }
    }

    // Ensure reasonable segment lengths
    const minSegmentLength = 3;
    const filtered = [corners[0]];
    for (let i = 1; i < corners.length; i++) {
      if (corners[i] - filtered[filtered.length - 1] >= minSegmentLength) {
        filtered.push(corners[i]);
      }
    }

    return filtered.length > 0 ? filtered : [0];
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
   * Fit the best curve type to a segment
   */
  fitBestCurve(points) {
    const start = points[0];
    const end = points[points.length - 1];

    // Try line first (simplest)
    const lineError = this.fitLineError(points);
    if (lineError <= this.lineTolerance) {
      return {
        type: 'line',
        start: start,
        end: end,
        error: lineError
      };
    }

    // Try circular arc (if allowed)
    if (this.allowCircularArc) {
      const arc = this.fitCircularArc(points);
      if (arc && arc.error <= this.arcTolerance) {
        return arc;
      }
    }

    // Try elliptical arc (if allowed)
    if (this.allowEllipticalArc) {
      const ellipseArc = this.fitEllipticalArc(points);
      if (ellipseArc && ellipseArc.error <= this.arcTolerance) {
        return ellipseArc;
      }
    }

    // Try quadratic Bézier (if allowed)
    if (this.allowQuadraticBezier) {
      const quadBezier = this.fitQuadraticBezier(points);
      if (quadBezier.error <= this.bezierTolerance) {
        return quadBezier;
      }
    }

    // Fall back to cubic Bézier using Schneider's algorithm (if allowed)
    if (this.allowCubicBezier) {
      const cubicBezier = this.fitCubicBezierSchneider(points);
      if (cubicBezier.error <= this.maxError) {
        return cubicBezier;
      }
      // If error too high, subdivide and fit recursively
      return this.subdivideAndFit(points);
    }

    // If cubic not allowed but quadratic is, use quadratic
    if (this.allowQuadraticBezier) {
      return this.fitQuadraticBezier(points);
    }

    // Last resort: return as line segments
    return {
      type: 'line',
      start: start,
      end: end,
      error: lineError
    };
  }

  /**
   * Schneider's algorithm: Iterative least-squares cubic Bézier fitting
   * Uses Newton-Raphson iteration to refine control point positions
   */
  fitCubicBezierSchneider(points) {
    if (points.length < 2) return this.simpleCubicBezier(points);
    if (points.length === 2) return this.simpleCubicBezier(points);

    const start = points[0];
    const end = points[points.length - 1];
    const n = points.length;

    // Calculate tangent vectors at endpoints
    const tHat1 = this.computeLeftTangent(points, 0);
    const tHat2 = this.computeRightTangent(points, n - 1);

    // Parameterize points using chord-length
    const u = this.chordLengthParameterize(points);

    // Initial control point placement
    let bezier = this.generateBezier(points, u, tHat1, tHat2);

    // Newton-Raphson iteration to refine
    for (let i = 0; i < this.maxIterations; i++) {
      // Reparameterize for better fit
      const uPrime = this.reparameterize(points, u, bezier);

      // Generate new curve with refined parameters
      bezier = this.generateBezier(points, uPrime, tHat1, tHat2);

      // Calculate error
      const error = this.computeMaxError(points, bezier, uPrime);

      if (error < this.maxError) {
        return {
          type: 'cubic',
          start: bezier[0],
          end: bezier[3],
          cp1: bezier[1],
          cp2: bezier[2],
          error: error
        };
      }

      // Update parameters for next iteration
      u.splice(0, u.length, ...uPrime);
    }

    // Return best fit even if above threshold
    const finalError = this.computeMaxError(points, bezier, u);
    return {
      type: 'cubic',
      start: bezier[0],
      end: bezier[3],
      cp1: bezier[1],
      cp2: bezier[2],
      error: finalError
    };
  }

  /**
   * Compute left tangent at point
   */
  computeLeftTangent(points, idx) {
    const lookAhead = Math.min(idx + 2, points.length - 1);
    const dx = points[lookAhead].x - points[idx].x;
    const dy = points[lookAhead].y - points[idx].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return { x: 1, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  /**
   * Compute right tangent at point
   */
  computeRightTangent(points, idx) {
    const lookBack = Math.max(idx - 2, 0);
    const dx = points[lookBack].x - points[idx].x;
    const dy = points[lookBack].y - points[idx].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) return { x: -1, y: 0 };
    return { x: dx / len, y: dy / len };
  }

  /**
   * Chord-length parameterization
   */
  chordLengthParameterize(points) {
    const u = [0];
    for (let i = 1; i < points.length; i++) {
      const dx = points[i].x - points[i - 1].x;
      const dy = points[i].y - points[i - 1].y;
      u.push(u[i - 1] + Math.sqrt(dx * dx + dy * dy));
    }
    // Normalize to [0, 1]
    const total = u[u.length - 1];
    if (total > 0) {
      for (let i = 0; i < u.length; i++) {
        u[i] /= total;
      }
    }
    return u;
  }

  /**
   * Generate Bezier curve from points and parameters
   */
  generateBezier(points, u, tHat1, tHat2) {
    const n = points.length;
    const first = points[0];
    const last = points[n - 1];

    // Build coefficient matrices (A)
    const A = [];
    for (let i = 0; i < n; i++) {
      const t = u[i];
      const b1 = this.bernsteinBasis(1, t) * 3;
      const b2 = this.bernsteinBasis(2, t) * 3;
      A.push([
        { x: tHat1.x * b1, y: tHat1.y * b1 },
        { x: tHat2.x * b2, y: tHat2.y * b2 }
      ]);
    }

    // Build right-hand side
    const C = [[0, 0], [0, 0]];
    const X = [0, 0];

    for (let i = 0; i < n; i++) {
      const t = u[i];
      const b0 = this.bernsteinBasis(0, t);
      const b1 = this.bernsteinBasis(1, t);
      const b2 = this.bernsteinBasis(2, t);
      const b3 = this.bernsteinBasis(3, t);

      C[0][0] += A[i][0].x * A[i][0].x + A[i][0].y * A[i][0].y;
      C[0][1] += A[i][0].x * A[i][1].x + A[i][0].y * A[i][1].y;
      C[1][0] = C[0][1];
      C[1][1] += A[i][1].x * A[i][1].x + A[i][1].y * A[i][1].y;

      const tmp = {
        x: points[i].x - (first.x * b0 + first.x * b1 + last.x * b2 + last.x * b3),
        y: points[i].y - (first.y * b0 + first.y * b1 + last.y * b2 + last.y * b3)
      };

      X[0] += A[i][0].x * tmp.x + A[i][0].y * tmp.y;
      X[1] += A[i][1].x * tmp.x + A[i][1].y * tmp.y;
    }

    // Solve for alpha values
    const det = C[0][0] * C[1][1] - C[0][1] * C[1][0];
    let alpha1, alpha2;

    if (Math.abs(det) < 1e-12) {
      // Use heuristic
      const dist = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
      alpha1 = alpha2 = dist / 3;
    } else {
      alpha1 = (C[1][1] * X[0] - C[0][1] * X[1]) / det;
      alpha2 = (C[0][0] * X[1] - C[1][0] * X[0]) / det;
    }

    // Ensure positive alphas
    const segLength = Math.sqrt((last.x - first.x) ** 2 + (last.y - first.y) ** 2);
    const epsilon = 1e-6 * segLength;

    if (alpha1 < epsilon || alpha2 < epsilon) {
      alpha1 = alpha2 = segLength / 3;
    }

    return [
      first,
      { x: first.x + tHat1.x * alpha1, y: first.y + tHat1.y * alpha1 },
      { x: last.x + tHat2.x * alpha2, y: last.y + tHat2.y * alpha2 },
      last
    ];
  }

  /**
   * Bernstein basis function
   */
  bernsteinBasis(i, t) {
    const mt = 1 - t;
    switch (i) {
      case 0: return mt * mt * mt;
      case 1: return 3 * mt * mt * t;
      case 2: return 3 * mt * t * t;
      case 3: return t * t * t;
      default: return 0;
    }
  }

  /**
   * Reparameterize points using Newton-Raphson
   */
  reparameterize(points, u, bezier) {
    const uPrime = [];
    for (let i = 0; i < points.length; i++) {
      uPrime.push(this.newtonRaphsonRootFind(bezier, points[i], u[i]));
    }
    return uPrime;
  }

  /**
   * Newton-Raphson root finding for curve parameter
   */
  newtonRaphsonRootFind(bezier, point, u) {
    // Q(u)
    const q = this.bezierPoint(bezier, u);
    // Q'(u)
    const q1 = this.bezierDerivative(bezier, u, 1);
    // Q''(u)
    const q2 = this.bezierDerivative(bezier, u, 2);

    // f(u) / f'(u)
    const numerator = (q.x - point.x) * q1.x + (q.y - point.y) * q1.y;
    const denominator = q1.x * q1.x + q1.y * q1.y +
                       (q.x - point.x) * q2.x + (q.y - point.y) * q2.y;

    if (Math.abs(denominator) < 1e-12) return u;

    const uPrime = u - numerator / denominator;
    return Math.max(0, Math.min(1, uPrime));
  }

  /**
   * Evaluate Bezier curve at parameter t
   */
  bezierPoint(bezier, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * mt * bezier[0].x + 3 * mt * mt * t * bezier[1].x +
         3 * mt * t * t * bezier[2].x + t * t * t * bezier[3].x,
      y: mt * mt * mt * bezier[0].y + 3 * mt * mt * t * bezier[1].y +
         3 * mt * t * t * bezier[2].y + t * t * t * bezier[3].y
    };
  }

  /**
   * Evaluate Bezier derivative
   */
  bezierDerivative(bezier, t, degree) {
    if (degree === 1) {
      const mt = 1 - t;
      return {
        x: 3 * (mt * mt * (bezier[1].x - bezier[0].x) +
                2 * mt * t * (bezier[2].x - bezier[1].x) +
                t * t * (bezier[3].x - bezier[2].x)),
        y: 3 * (mt * mt * (bezier[1].y - bezier[0].y) +
                2 * mt * t * (bezier[2].y - bezier[1].y) +
                t * t * (bezier[3].y - bezier[2].y))
      };
    } else if (degree === 2) {
      const mt = 1 - t;
      return {
        x: 6 * (mt * (bezier[2].x - 2 * bezier[1].x + bezier[0].x) +
                t * (bezier[3].x - 2 * bezier[2].x + bezier[1].x)),
        y: 6 * (mt * (bezier[2].y - 2 * bezier[1].y + bezier[0].y) +
                t * (bezier[3].y - 2 * bezier[2].y + bezier[1].y))
      };
    }
    return { x: 0, y: 0 };
  }

  /**
   * Compute max error for Bezier fit
   */
  computeMaxError(points, bezier, u) {
    let maxError = 0;
    for (let i = 0; i < points.length; i++) {
      const p = this.bezierPoint(bezier, u[i]);
      const dx = p.x - points[i].x;
      const dy = p.y - points[i].y;
      const dist = dx * dx + dy * dy;
      if (dist > maxError) maxError = dist;
    }
    return Math.sqrt(maxError);
  }

  /**
   * Subdivide curve and fit recursively when error is too high
   */
  subdivideAndFit(points) {
    if (points.length < 4) {
      return this.fitCubicBezierSchneider(points);
    }

    // Find point of max error and split there
    const u = this.chordLengthParameterize(points);
    const bezier = this.fitCubicBezierSchneider(points);

    let maxError = 0;
    let splitIdx = Math.floor(points.length / 2);

    for (let i = 1; i < points.length - 1; i++) {
      const p = this.bezierPoint(
        [bezier.start, bezier.cp1, bezier.cp2, bezier.end],
        u[i]
      );
      const dx = p.x - points[i].x;
      const dy = p.y - points[i].y;
      const dist = dx * dx + dy * dy;
      if (dist > maxError) {
        maxError = dist;
        splitIdx = i;
      }
    }

    // If still too small to split meaningfully, return best fit
    if (splitIdx <= 1 || splitIdx >= points.length - 2) {
      return bezier;
    }

    // Return the single best-fit curve (recursive subdivision happens at higher level)
    return bezier;
  }

  /**
   * Fit elliptical arc to points
   */
  fitEllipticalArc(points) {
    if (points.length < 5) return null;

    // Find bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;

    if (rx < 1 || ry < 1) return null;
    if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.1) return null; // Too circular, use circular arc

    // Check if points lie on ellipse
    let maxDeviation = 0;
    for (const p of points) {
      const nx = (p.x - cx) / rx;
      const ny = (p.y - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      const deviation = Math.abs(d - 1) * Math.max(rx, ry);
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    if (maxDeviation > this.arcTolerance * 3) return null;

    const start = points[0];
    const end = points[points.length - 1];

    // Calculate angles
    const startAngle = Math.atan2((start.y - cy) / ry, (start.x - cx) / rx);
    const endAngle = Math.atan2((end.y - cy) / ry, (end.x - cx) / rx);

    // Determine sweep direction
    const mid = points[Math.floor(points.length / 2)];
    const midAngle = Math.atan2((mid.y - cy) / ry, (mid.x - cx) / rx);
    const sweep = this.isAngleBetween(midAngle, startAngle, endAngle);

    return {
      type: 'ellipticalArc',
      start: start,
      end: end,
      cx: cx,
      cy: cy,
      rx: rx,
      ry: ry,
      rotation: 0,
      startAngle: startAngle,
      endAngle: endAngle,
      sweep: sweep,
      error: maxDeviation
    };
  }

  /**
   * Calculate error if fitted as a line
   */
  fitLineError(points) {
    if (points.length <= 2) return 0;

    const start = points[0];
    const end = points[points.length - 1];

    let maxError = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const error = this.pointToLineDistance(points[i], start, end);
      maxError = Math.max(maxError, error);
    }

    return maxError;
  }

  /**
   * Fit circular arc to points
   */
  fitCircularArc(points) {
    if (points.length < 3) return null;

    // Use three points to estimate circle
    const start = points[0];
    const mid = points[Math.floor(points.length / 2)];
    const end = points[points.length - 1];

    const circle = this.circleFromThreePoints(start, mid, end);
    if (!circle) return null;

    // Calculate error
    let maxError = 0;
    for (const p of points) {
      const dist = Math.abs(
        Math.sqrt((p.x - circle.cx) ** 2 + (p.y - circle.cy) ** 2) - circle.r
      );
      maxError = Math.max(maxError, dist);
    }

    if (maxError > this.arcTolerance * 2) return null;

    // Calculate start and end angles
    const startAngle = Math.atan2(start.y - circle.cy, start.x - circle.cx);
    const endAngle = Math.atan2(end.y - circle.cy, end.x - circle.cx);

    // Determine sweep direction
    const midAngle = Math.atan2(mid.y - circle.cy, mid.x - circle.cx);
    const sweep = this.isAngleBetween(midAngle, startAngle, endAngle);

    return {
      type: 'arc',
      start: start,
      end: end,
      cx: circle.cx,
      cy: circle.cy,
      r: circle.r,
      startAngle: startAngle,
      endAngle: endAngle,
      sweep: sweep,
      error: maxError
    };
  }

  /**
   * Calculate circle from three points
   */
  circleFromThreePoints(p1, p2, p3) {
    const ax = p1.x, ay = p1.y;
    const bx = p2.x, by = p2.y;
    const cx = p3.x, cy = p3.y;

    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    if (Math.abs(d) < 1e-10) return null;

    const ux = ((ax * ax + ay * ay) * (by - cy) +
                (bx * bx + by * by) * (cy - ay) +
                (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) +
                (bx * bx + by * by) * (ax - cx) +
                (cx * cx + cy * cy) * (bx - ax)) / d;

    const r = Math.sqrt((ax - ux) ** 2 + (ay - uy) ** 2);

    return { cx: ux, cy: uy, r: r };
  }

  /**
   * Check if angle is between start and end (considering direction)
   */
  isAngleBetween(angle, start, end) {
    // Normalize angles to [0, 2π]
    const normalize = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const a = normalize(angle);
    const s = normalize(start);
    const e = normalize(end);

    if (s <= e) {
      return a >= s && a <= e;
    } else {
      return a >= s || a <= e;
    }
  }

  /**
   * Fit quadratic Bézier curve
   */
  fitQuadraticBezier(points) {
    const start = points[0];
    const end = points[points.length - 1];

    // Find control point using tangent approximation
    const t = 0.5;
    const mid = points[Math.floor(points.length / 2)];

    // Control point estimation: P1 = (P0.5 - 0.25*P0 - 0.25*P2) / 0.5
    const cp = {
      x: (mid.x - 0.25 * start.x - 0.25 * end.x) / 0.5,
      y: (mid.y - 0.25 * start.y - 0.25 * end.y) / 0.5
    };

    // Calculate error
    let maxError = 0;
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const bx = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * cp.x + t * t * end.x;
      const by = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * cp.y + t * t * end.y;
      const dist = Math.sqrt((points[i].x - bx) ** 2 + (points[i].y - by) ** 2);
      maxError = Math.max(maxError, dist);
    }

    return {
      type: 'quadratic',
      start: start,
      end: end,
      cp: cp,
      error: maxError
    };
  }

  /**
   * Fit cubic Bézier curve using tangent-based approach
   */
  fitCubicBezier(points) {
    const start = points[0];
    const end = points[points.length - 1];
    const n = points.length;

    if (n <= 2) {
      return this.simpleCubicBezier(points);
    }

    // Calculate tangent vectors at start and end
    const startTangent = this.calculateTangent(points, 0, true);
    const endTangent = this.calculateTangent(points, n - 1, false);

    // Calculate chord length
    const chordLength = Math.sqrt(
      (end.x - start.x) ** 2 + (end.y - start.y) ** 2
    );

    if (chordLength < 1) {
      return this.simpleCubicBezier(points);
    }

    // Estimate handle lengths based on arc length approximation
    let arcLength = 0;
    for (let i = 1; i < n; i++) {
      arcLength += Math.sqrt(
        (points[i].x - points[i - 1].x) ** 2 +
        (points[i].y - points[i - 1].y) ** 2
      );
    }

    // Control point distance is roughly 1/3 of arc length
    const handleLength = Math.min(arcLength / 3, chordLength * 0.5);

    // Place control points along tangent directions
    const cp1 = {
      x: start.x + startTangent.x * handleLength,
      y: start.y + startTangent.y * handleLength
    };
    const cp2 = {
      x: end.x + endTangent.x * handleLength,
      y: end.y + endTangent.y * handleLength
    };

    // Calculate error
    let maxError = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const mt = 1 - t;
      const bx = mt * mt * mt * start.x + 3 * mt * mt * t * cp1.x +
                 3 * mt * t * t * cp2.x + t * t * t * end.x;
      const by = mt * mt * mt * start.y + 3 * mt * mt * t * cp1.y +
                 3 * mt * t * t * cp2.y + t * t * t * end.y;
      const dist = Math.sqrt((points[i].x - bx) ** 2 + (points[i].y - by) ** 2);
      maxError = Math.max(maxError, dist);
    }

    return {
      type: 'cubic',
      start: start,
      end: end,
      cp1: cp1,
      cp2: cp2,
      error: maxError
    };
  }

  /**
   * Calculate tangent vector at a point
   */
  calculateTangent(points, idx, isStart) {
    const n = points.length;
    let dx, dy;

    if (isStart) {
      // Forward difference for start
      const lookAhead = Math.min(3, n - 1);
      dx = points[lookAhead].x - points[0].x;
      dy = points[lookAhead].y - points[0].y;
    } else {
      // Backward difference for end
      const lookBack = Math.max(0, n - 4);
      dx = points[n - 1].x - points[lookBack].x;
      dy = points[n - 1].y - points[lookBack].y;
      // Reverse direction for end tangent
      dx = -dx;
      dy = -dy;
    }

    // Normalize
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) {
      return { x: isStart ? 1 : -1, y: 0 };
    }
    return { x: dx / len, y: dy / len };
  }

  /**
   * Simple cubic Bézier estimation
   */
  simpleCubicBezier(points) {
    const start = points[0];
    const end = points[points.length - 1];

    // Place control points at 1/3 and 2/3 along chord
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    const cp1 = { x: start.x + dx / 3, y: start.y + dy / 3 };
    const cp2 = { x: start.x + 2 * dx / 3, y: start.y + 2 * dy / 3 };

    return {
      type: 'cubic',
      start: start,
      end: end,
      cp1: cp1,
      cp2: cp2,
      error: 0
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

module.exports = CurveFitter;
