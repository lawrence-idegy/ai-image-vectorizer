/**
 * Geometry Optimization Module
 *
 * Cleans up traced geometry while preserving the original shape intent.
 *
 * Philosophy:
 * - A wobbly line that SHOULD be straight → make it straight
 * - A corner that's 87° but SHOULD be 90° → snap to 90°
 * - BUT only if we're confident about the intent
 * - When in doubt, preserve the original traced shape
 *
 * Operations:
 * 1. Corner sharpening (snap to common angles: 90°, 45°, 60°, etc.)
 * 2. Line straightening (detect and fix nearly-straight segments)
 * 3. Alignment detection (snap to horizontal/vertical)
 */

class GeometryOptimizer {
  constructor(options = {}) {
    // Angle snap tolerance (degrees)
    // If a corner is within this many degrees of a "clean" angle, snap to it
    this.angleSnapTolerance = options.angleSnapTolerance || 5;

    // Line straightness tolerance (pixels per unit length)
    // Lower = stricter (only straighten truly straight lines)
    this.lineSnapTolerance = options.lineSnapTolerance || 0.5;

    // Horizontal/vertical snap tolerance (degrees)
    this.hvSnapTolerance = options.hvSnapTolerance || 3;

    // Common angles to snap to (degrees)
    this.snapAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180];
  }

  /**
   * Optimize a path by cleaning up geometry
   * @param {Array} curves - Array of curve segments
   * @param {Object} classification - Shape classification result
   * @returns {Array} Optimized curves
   */
  optimize(curves, classification = {}) {
    if (!curves || curves.length === 0) return curves;

    // If classified as geometric, apply aggressive optimization
    if (classification.isGeometric) {
      return this.optimizeGeometric(curves, classification);
    }

    // For organic shapes, apply gentle optimization
    return this.optimizeOrganic(curves);
  }

  /**
   * Aggressive optimization for geometric shapes
   */
  optimizeGeometric(curves, classification) {
    let optimized = [...curves];

    // Snap corners to clean angles
    optimized = this.snapCorners(optimized);

    // Straighten line segments
    optimized = this.straightenLines(optimized);

    // Snap to horizontal/vertical
    optimized = this.snapToHV(optimized);

    return optimized;
  }

  /**
   * Gentle optimization for organic shapes
   * Only fixes obvious issues, preserves original character
   */
  optimizeOrganic(curves) {
    let optimized = [...curves];

    // Only straighten lines that are VERY close to straight
    optimized = this.straightenLines(optimized, this.lineSnapTolerance * 0.5);

    // Only snap near-horizontal/vertical lines
    optimized = this.snapToHV(optimized, this.hvSnapTolerance * 0.5);

    return optimized;
  }

  /**
   * Snap corners to clean angles
   */
  snapCorners(curves) {
    if (curves.length < 2) return curves;

    const result = [...curves];

    for (let i = 0; i < result.length; i++) {
      const curr = result[i];
      const next = result[(i + 1) % result.length];

      if (curr.type !== 'line' || next.type !== 'line') continue;

      // Calculate angle at corner
      const angle = this.calculateCornerAngle(curr, next);
      const angleDeg = angle * 180 / Math.PI;

      // Find nearest snap angle
      let nearestSnap = angleDeg;
      let minDiff = Infinity;

      for (const snapAngle of this.snapAngles) {
        const diff = Math.abs(angleDeg - snapAngle);
        const diff180 = Math.abs(angleDeg - (180 - snapAngle));

        if (diff < minDiff && diff <= this.angleSnapTolerance) {
          minDiff = diff;
          nearestSnap = snapAngle;
        }
        if (diff180 < minDiff && diff180 <= this.angleSnapTolerance) {
          minDiff = diff180;
          nearestSnap = 180 - snapAngle;
        }
      }

      // If found a snap angle, adjust the corner
      if (minDiff <= this.angleSnapTolerance && minDiff > 0.1) {
        this.adjustCorner(result, i, nearestSnap);
      }
    }

    return result;
  }

  /**
   * Calculate angle at corner between two line segments
   */
  calculateCornerAngle(line1, line2) {
    // Direction of line1 (end to start, pointing towards corner)
    const d1 = {
      x: line1.end.x - line1.start.x,
      y: line1.end.y - line1.start.y
    };

    // Direction of line2 (start to end, pointing away from corner)
    const d2 = {
      x: line2.end.x - line2.start.x,
      y: line2.end.y - line2.start.y
    };

    // Normalize
    const len1 = Math.sqrt(d1.x * d1.x + d1.y * d1.y);
    const len2 = Math.sqrt(d2.x * d2.x + d2.y * d2.y);

    if (len1 === 0 || len2 === 0) return Math.PI;

    d1.x /= len1; d1.y /= len1;
    d2.x /= len2; d2.y /= len2;

    // Angle between directions
    const dot = d1.x * d2.x + d1.y * d2.y;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  /**
   * Adjust corner to target angle
   */
  adjustCorner(curves, index, targetAngleDeg) {
    const curr = curves[index];
    const next = curves[(index + 1) % curves.length];

    if (curr.type !== 'line' || next.type !== 'line') return;

    // Keep the corner point, adjust the incoming/outgoing directions
    const corner = curr.end; // = next.start

    // For now, just ensure the corner point is shared exactly
    next.start = { ...corner };
  }

  /**
   * Straighten nearly-straight line segments
   */
  straightenLines(curves, tolerance = this.lineSnapTolerance) {
    return curves.map(curve => {
      if (curve.type === 'line') {
        // Lines are already straight
        return curve;
      }

      if (curve.type === 'quadratic' || curve.type === 'cubic') {
        // Check if Bezier is nearly straight
        if (this.isCurveNearlyStraight(curve, tolerance)) {
          // Convert to line
          return {
            type: 'line',
            start: curve.start,
            end: curve.end
          };
        }
      }

      return curve;
    });
  }

  /**
   * Check if a curve is nearly straight
   */
  isCurveNearlyStraight(curve, tolerance) {
    const start = curve.start;
    const end = curve.end;

    // Length of the line
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    if (length < 1) return true;

    // Check control point distances from line
    if (curve.type === 'quadratic') {
      const dist = this.pointToLineDistance(curve.cp, start, end);
      return dist / length < tolerance;
    }

    if (curve.type === 'cubic') {
      const dist1 = this.pointToLineDistance(curve.cp1, start, end);
      const dist2 = this.pointToLineDistance(curve.cp2, start, end);
      return Math.max(dist1, dist2) / length < tolerance;
    }

    return false;
  }

  /**
   * Snap lines to horizontal or vertical
   */
  snapToHV(curves, tolerance = this.hvSnapTolerance) {
    return curves.map(curve => {
      if (curve.type !== 'line') return curve;

      const dx = curve.end.x - curve.start.x;
      const dy = curve.end.y - curve.start.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      // Check if nearly horizontal
      if (Math.abs(angle) <= tolerance || Math.abs(angle - 180) <= tolerance || Math.abs(angle + 180) <= tolerance) {
        // Snap to horizontal
        const avgY = (curve.start.y + curve.end.y) / 2;
        return {
          type: 'line',
          start: { x: curve.start.x, y: avgY },
          end: { x: curve.end.x, y: avgY }
        };
      }

      // Check if nearly vertical
      if (Math.abs(angle - 90) <= tolerance || Math.abs(angle + 90) <= tolerance) {
        // Snap to vertical
        const avgX = (curve.start.x + curve.end.x) / 2;
        return {
          type: 'line',
          start: { x: avgX, y: curve.start.y },
          end: { x: avgX, y: curve.end.y }
        };
      }

      return curve;
    });
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

  /**
   * Optimize all paths for alignment with each other
   * Call this after individual path optimization
   */
  optimizeAlignment(allPaths, imageWidth, imageHeight) {
    // Find common x and y coordinates that might be alignment guides
    const xCoords = [];
    const yCoords = [];

    for (const path of allPaths) {
      for (const curve of path.curves) {
        if (curve.start) {
          xCoords.push(curve.start.x);
          yCoords.push(curve.start.y);
        }
        if (curve.end) {
          xCoords.push(curve.end.x);
          yCoords.push(curve.end.y);
        }
      }
    }

    // Find clusters of similar coordinates
    const xGuides = this.findAlignmentGuides(xCoords);
    const yGuides = this.findAlignmentGuides(yCoords);

    // Also add image center as potential guide
    xGuides.push(imageWidth / 2);
    yGuides.push(imageHeight / 2);

    // Snap points to guides
    const snapDistance = Math.max(imageWidth, imageHeight) * 0.01; // 1% of image size

    for (const path of allPaths) {
      for (const curve of path.curves) {
        if (curve.start) {
          curve.start = this.snapToGuides(curve.start, xGuides, yGuides, snapDistance);
        }
        if (curve.end) {
          curve.end = this.snapToGuides(curve.end, xGuides, yGuides, snapDistance);
        }
      }
    }

    return allPaths;
  }

  /**
   * Find alignment guides from coordinate list
   */
  findAlignmentGuides(coords) {
    if (coords.length === 0) return [];

    // Sort and find clusters
    const sorted = [...coords].sort((a, b) => a - b);
    const guides = [];
    const clusterThreshold = 2; // pixels

    let clusterStart = 0;
    for (let i = 1; i <= sorted.length; i++) {
      if (i === sorted.length || sorted[i] - sorted[i - 1] > clusterThreshold) {
        // End of cluster
        const clusterSize = i - clusterStart;
        if (clusterSize >= 2) {
          // Calculate cluster center
          let sum = 0;
          for (let j = clusterStart; j < i; j++) {
            sum += sorted[j];
          }
          guides.push(sum / clusterSize);
        }
        clusterStart = i;
      }
    }

    return guides;
  }

  /**
   * Snap point to nearest guides
   */
  snapToGuides(point, xGuides, yGuides, snapDistance) {
    let { x, y } = point;

    // Find nearest x guide
    for (const guide of xGuides) {
      if (Math.abs(x - guide) <= snapDistance) {
        x = guide;
        break;
      }
    }

    // Find nearest y guide
    for (const guide of yGuides) {
      if (Math.abs(y - guide) <= snapDistance) {
        y = guide;
        break;
      }
    }

    return { x, y };
  }
}

module.exports = GeometryOptimizer;
