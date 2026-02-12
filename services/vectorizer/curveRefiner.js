/**
 * Curve Refiner Module
 *
 * Post-processing refinements for production-quality curves:
 * - Tangent matching (G1 continuity)
 * - Curvature matching (G2 continuity)
 * - Curve fairing (energy minimization)
 * - Corner cleanup and optimization
 *
 * These refinements are essential for achieving Vectorizer.ai quality output.
 */

class CurveRefiner {
  constructor(options = {}) {
    // Tangent matching parameters
    this.tangentThreshold = options.tangentThreshold || 0.1; // Max angle difference (radians)
    this.curvatureThreshold = options.curvatureThreshold || 0.05;

    // Curve fairing parameters
    this.fairingIterations = options.fairingIterations || 3;
    this.fairingWeight = options.fairingWeight || 0.3;
    this.smoothnessWeight = options.smoothnessWeight || 0.5;
    this.fidelityWeight = options.fidelityWeight || 0.5;

    // Corner parameters
    this.cornerAngleThreshold = (options.cornerAngleThreshold || 30) * Math.PI / 180;
    this.cornerSharpness = options.cornerSharpness || 0.9; // 0 = rounded, 1 = sharp
  }

  /**
   * Refine all curves in a path
   * @param {Array} curves - Array of curve segments
   * @returns {Array} Refined curves
   */
  refine(curves) {
    if (!curves || curves.length < 2) return curves;

    let refined = [...curves];

    // Step 1: Ensure tangent continuity (G1)
    refined = this.enforceTangentContinuity(refined);

    // Step 2: Apply curve fairing
    refined = this.applyCurveFairing(refined);

    // Step 3: Optimize corners
    refined = this.optimizeCorners(refined);

    // Step 4: Enforce curvature continuity (G2) where appropriate
    refined = this.enforceCurvatureContinuity(refined);

    return refined;
  }

  /**
   * Enforce G1 (tangent) continuity between adjacent curves
   */
  enforceTangentContinuity(curves) {
    const result = [...curves];

    for (let i = 0; i < result.length; i++) {
      const curr = result[i];
      const next = result[(i + 1) % result.length];

      if (!curr.end || !next.start) continue;

      // Get tangent vectors at junction
      const currTangent = this.getEndTangent(curr);
      const nextTangent = this.getStartTangent(next);

      // Calculate angle between tangents
      const angle = this.angleBetweenVectors(currTangent, nextTangent);

      // If angle is small, enforce continuity
      if (angle < this.tangentThreshold * 3) {
        // Average the tangent directions
        const avgTangent = this.normalizeVector({
          x: currTangent.x + nextTangent.x,
          y: currTangent.y + nextTangent.y
        });

        // Adjust control points
        this.adjustEndTangent(curr, avgTangent);
        this.adjustStartTangent(next, avgTangent);
      }
    }

    return result;
  }

  /**
   * Get tangent vector at end of curve
   */
  getEndTangent(curve) {
    switch (curve.type) {
      case 'line':
        return this.normalizeVector({
          x: curve.end.x - curve.start.x,
          y: curve.end.y - curve.start.y
        });

      case 'quadratic':
        return this.normalizeVector({
          x: curve.end.x - curve.cp.x,
          y: curve.end.y - curve.cp.y
        });

      case 'cubic':
        return this.normalizeVector({
          x: curve.end.x - curve.cp2.x,
          y: curve.end.y - curve.cp2.y
        });

      case 'arc':
        // Tangent is perpendicular to radius at end point
        const endAngle = curve.endAngle;
        return {
          x: -Math.sin(endAngle) * (curve.sweep ? 1 : -1),
          y: Math.cos(endAngle) * (curve.sweep ? 1 : -1)
        };

      default:
        return { x: 1, y: 0 };
    }
  }

  /**
   * Get tangent vector at start of curve
   */
  getStartTangent(curve) {
    switch (curve.type) {
      case 'line':
        return this.normalizeVector({
          x: curve.end.x - curve.start.x,
          y: curve.end.y - curve.start.y
        });

      case 'quadratic':
        return this.normalizeVector({
          x: curve.cp.x - curve.start.x,
          y: curve.cp.y - curve.start.y
        });

      case 'cubic':
        return this.normalizeVector({
          x: curve.cp1.x - curve.start.x,
          y: curve.cp1.y - curve.start.y
        });

      case 'arc':
        const startAngle = curve.startAngle;
        return {
          x: -Math.sin(startAngle) * (curve.sweep ? 1 : -1),
          y: Math.cos(startAngle) * (curve.sweep ? 1 : -1)
        };

      default:
        return { x: 1, y: 0 };
    }
  }

  /**
   * Adjust end control point to match target tangent
   */
  adjustEndTangent(curve, targetTangent) {
    if (curve.type === 'cubic' && curve.cp2) {
      const dist = this.distance(curve.cp2, curve.end);
      curve.cp2 = {
        x: curve.end.x - targetTangent.x * dist,
        y: curve.end.y - targetTangent.y * dist
      };
    } else if (curve.type === 'quadratic' && curve.cp) {
      // For quadratic, adjust control point while maintaining curve shape
      const dist = this.distance(curve.cp, curve.end) * 0.5;
      curve.cp = {
        x: curve.cp.x + (curve.end.x - targetTangent.x * dist - curve.cp.x) * 0.3,
        y: curve.cp.y + (curve.end.y - targetTangent.y * dist - curve.cp.y) * 0.3
      };
    }
  }

  /**
   * Adjust start control point to match target tangent
   */
  adjustStartTangent(curve, targetTangent) {
    if (curve.type === 'cubic' && curve.cp1) {
      const dist = this.distance(curve.cp1, curve.start);
      curve.cp1 = {
        x: curve.start.x + targetTangent.x * dist,
        y: curve.start.y + targetTangent.y * dist
      };
    } else if (curve.type === 'quadratic' && curve.cp) {
      const dist = this.distance(curve.cp, curve.start) * 0.5;
      curve.cp = {
        x: curve.cp.x + (curve.start.x + targetTangent.x * dist - curve.cp.x) * 0.3,
        y: curve.cp.y + (curve.start.y + targetTangent.y * dist - curve.cp.y) * 0.3
      };
    }
  }

  /**
   * Apply curve fairing using energy minimization
   * Minimizes curvature variation while maintaining fidelity to original
   */
  applyCurveFairing(curves) {
    const result = [...curves];

    for (let iter = 0; iter < this.fairingIterations; iter++) {
      for (let i = 0; i < result.length; i++) {
        const curve = result[i];

        if (curve.type === 'cubic') {
          this.fairCubicCurve(curve, result, i);
        } else if (curve.type === 'quadratic') {
          this.fairQuadraticCurve(curve, result, i);
        }
      }
    }

    return result;
  }

  /**
   * Fair a cubic Bezier curve
   */
  fairCubicCurve(curve, allCurves, index) {
    // Get neighboring curves for context
    const prev = allCurves[(index - 1 + allCurves.length) % allCurves.length];
    const next = allCurves[(index + 1) % allCurves.length];

    // Compute target curvature based on neighbors
    const prevCurvature = this.estimateCurvature(prev, 1.0);
    const nextCurvature = this.estimateCurvature(next, 0.0);
    const targetCurvature = (prevCurvature + nextCurvature) / 2;

    // Adjust control points to reduce curvature variation
    const currentCurvature = this.estimateCurvature(curve, 0.5);
    const curvatureDiff = targetCurvature - currentCurvature;

    // Move control points to adjust curvature
    const adjustment = curvatureDiff * this.fairingWeight;

    // Perpendicular direction to curve at control points
    if (curve.cp1 && curve.cp2) {
      const cp1Perp = this.perpendicularVector(
        { x: curve.cp1.x - curve.start.x, y: curve.cp1.y - curve.start.y }
      );
      const cp2Perp = this.perpendicularVector(
        { x: curve.end.x - curve.cp2.x, y: curve.end.y - curve.cp2.y }
      );

      curve.cp1 = {
        x: curve.cp1.x + cp1Perp.x * adjustment,
        y: curve.cp1.y + cp1Perp.y * adjustment
      };
      curve.cp2 = {
        x: curve.cp2.x + cp2Perp.x * adjustment,
        y: curve.cp2.y + cp2Perp.y * adjustment
      };
    }
  }

  /**
   * Fair a quadratic Bezier curve
   */
  fairQuadraticCurve(curve, allCurves, index) {
    const prev = allCurves[(index - 1 + allCurves.length) % allCurves.length];
    const next = allCurves[(index + 1) % allCurves.length];

    const prevCurvature = this.estimateCurvature(prev, 1.0);
    const nextCurvature = this.estimateCurvature(next, 0.0);
    const targetCurvature = (prevCurvature + nextCurvature) / 2;

    const currentCurvature = this.estimateCurvature(curve, 0.5);
    const curvatureDiff = targetCurvature - currentCurvature;

    if (curve.cp) {
      const adjustment = curvatureDiff * this.fairingWeight;
      const midX = (curve.start.x + curve.end.x) / 2;
      const midY = (curve.start.y + curve.end.y) / 2;

      const toMid = this.normalizeVector({
        x: curve.cp.x - midX,
        y: curve.cp.y - midY
      });

      curve.cp = {
        x: curve.cp.x + toMid.x * adjustment,
        y: curve.cp.y + toMid.y * adjustment
      };
    }
  }

  /**
   * Estimate curvature at a point on the curve
   */
  estimateCurvature(curve, t) {
    if (!curve) return 0;

    switch (curve.type) {
      case 'line':
        return 0;

      case 'arc':
        return 1 / curve.r;

      case 'quadratic':
        return this.quadraticCurvature(curve, t);

      case 'cubic':
        return this.cubicCurvature(curve, t);

      default:
        return 0;
    }
  }

  /**
   * Calculate curvature of quadratic Bezier at parameter t
   */
  quadraticCurvature(curve, t) {
    const p0 = curve.start;
    const p1 = curve.cp;
    const p2 = curve.end;

    // First derivative
    const dx = 2 * ((1 - t) * (p1.x - p0.x) + t * (p2.x - p1.x));
    const dy = 2 * ((1 - t) * (p1.y - p0.y) + t * (p2.y - p1.y));

    // Second derivative
    const ddx = 2 * (p2.x - 2 * p1.x + p0.x);
    const ddy = 2 * (p2.y - 2 * p1.y + p0.y);

    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 0.001) return 0;

    // Curvature formula
    return Math.abs(dx * ddy - dy * ddx) / (speed * speed * speed);
  }

  /**
   * Calculate curvature of cubic Bezier at parameter t
   */
  cubicCurvature(curve, t) {
    const p0 = curve.start;
    const p1 = curve.cp1;
    const p2 = curve.cp2;
    const p3 = curve.end;

    const mt = 1 - t;

    // First derivative
    const dx = 3 * (mt * mt * (p1.x - p0.x) + 2 * mt * t * (p2.x - p1.x) + t * t * (p3.x - p2.x));
    const dy = 3 * (mt * mt * (p1.y - p0.y) + 2 * mt * t * (p2.y - p1.y) + t * t * (p3.y - p2.y));

    // Second derivative
    const ddx = 6 * (mt * (p2.x - 2 * p1.x + p0.x) + t * (p3.x - 2 * p2.x + p1.x));
    const ddy = 6 * (mt * (p2.y - 2 * p1.y + p0.y) + t * (p3.y - 2 * p2.y + p1.y));

    const speed = Math.sqrt(dx * dx + dy * dy);
    if (speed < 0.001) return 0;

    return Math.abs(dx * ddy - dy * ddx) / (speed * speed * speed);
  }

  /**
   * Optimize corners for sharpness and clean appearance
   */
  optimizeCorners(curves) {
    const result = [];

    for (let i = 0; i < curves.length; i++) {
      const curr = curves[i];
      const next = curves[(i + 1) % curves.length];

      result.push(curr);

      if (!curr.end || !next.start) continue;

      // Calculate angle at junction
      const currTangent = this.getEndTangent(curr);
      const nextTangent = this.getStartTangent(next);
      const angle = this.angleBetweenVectors(currTangent, nextTangent);

      // If sharp corner detected
      if (angle > this.cornerAngleThreshold) {
        // Ensure exact point sharing
        next.start = { ...curr.end };

        // Adjust control points for clean corner
        if (curr.type === 'cubic' && curr.cp2) {
          // Pull cp2 closer to end for sharper corner
          const pullFactor = this.cornerSharpness;
          curr.cp2 = {
            x: curr.end.x + (curr.cp2.x - curr.end.x) * (1 - pullFactor * 0.3),
            y: curr.end.y + (curr.cp2.y - curr.end.y) * (1 - pullFactor * 0.3)
          };
        }

        if (next.type === 'cubic' && next.cp1) {
          const pullFactor = this.cornerSharpness;
          next.cp1 = {
            x: next.start.x + (next.cp1.x - next.start.x) * (1 - pullFactor * 0.3),
            y: next.start.y + (next.cp1.y - next.start.y) * (1 - pullFactor * 0.3)
          };
        }
      }
    }

    return result;
  }

  /**
   * Enforce G2 (curvature) continuity where appropriate
   */
  enforceCurvatureContinuity(curves) {
    const result = [...curves];

    for (let i = 0; i < result.length; i++) {
      const curr = result[i];
      const next = result[(i + 1) % result.length];

      // Only apply G2 to cubic curves that aren't corners
      if (curr.type !== 'cubic' || next.type !== 'cubic') continue;

      const currTangent = this.getEndTangent(curr);
      const nextTangent = this.getStartTangent(next);
      const angle = this.angleBetweenVectors(currTangent, nextTangent);

      // Skip corners
      if (angle > this.cornerAngleThreshold) continue;

      // Match curvature at junction
      const currCurvature = this.cubicCurvature(curr, 1.0);
      const nextCurvature = this.cubicCurvature(next, 0.0);

      if (Math.abs(currCurvature - nextCurvature) > this.curvatureThreshold) {
        const targetCurvature = (currCurvature + nextCurvature) / 2;

        // Adjust control points to match curvature
        this.adjustCurvatureAtEnd(curr, targetCurvature);
        this.adjustCurvatureAtStart(next, targetCurvature);
      }
    }

    return result;
  }

  /**
   * Adjust control point to achieve target curvature at end
   */
  adjustCurvatureAtEnd(curve, targetCurvature) {
    if (curve.type !== 'cubic' || !curve.cp2) return;

    const currentCurvature = this.cubicCurvature(curve, 1.0);
    if (Math.abs(currentCurvature) < 0.001) return;

    const ratio = targetCurvature / currentCurvature;
    const adjustment = Math.max(0.5, Math.min(1.5, ratio));

    const dist = this.distance(curve.cp2, curve.end);
    const tangent = this.getEndTangent(curve);

    curve.cp2 = {
      x: curve.end.x - tangent.x * dist * adjustment,
      y: curve.end.y - tangent.y * dist * adjustment
    };
  }

  /**
   * Adjust control point to achieve target curvature at start
   */
  adjustCurvatureAtStart(curve, targetCurvature) {
    if (curve.type !== 'cubic' || !curve.cp1) return;

    const currentCurvature = this.cubicCurvature(curve, 0.0);
    if (Math.abs(currentCurvature) < 0.001) return;

    const ratio = targetCurvature / currentCurvature;
    const adjustment = Math.max(0.5, Math.min(1.5, ratio));

    const dist = this.distance(curve.cp1, curve.start);
    const tangent = this.getStartTangent(curve);

    curve.cp1 = {
      x: curve.start.x + tangent.x * dist * adjustment,
      y: curve.start.y + tangent.y * dist * adjustment
    };
  }

  // === Utility Methods ===

  normalizeVector(v) {
    const len = Math.sqrt(v.x * v.x + v.y * v.y);
    if (len < 0.001) return { x: 0, y: 0 };
    return { x: v.x / len, y: v.y / len };
  }

  perpendicularVector(v) {
    return this.normalizeVector({ x: -v.y, y: v.x });
  }

  angleBetweenVectors(v1, v2) {
    const dot = v1.x * v2.x + v1.y * v2.y;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  distance(p1, p2) {
    return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
  }
}

module.exports = CurveRefiner;
