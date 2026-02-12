/**
 * Shape Detection Module
 *
 * Detects and replaces curve paths with geometric primitives:
 * - Circles
 * - Ellipses
 * - Rectangles (with rotation detection)
 * - Rounded rectangles
 *
 * Features:
 * - Flatten option to convert shapes back to curves
 * - Rotation detection for rectangles
 */

class ShapeDetector {
  constructor(options = {}) {
    this.tolerance = options.shapeTolerance || 0.02; // 2% tolerance
    // Flatten option: convert detected shapes back to Bezier curves
    this.flatten = options.flatten || false;
  }

  /**
   * Detect shapes in a path and replace if found
   * @param {Array} curves - Array of curve segments
   * @returns {Object} Either a shape or the original curves
   */
  detectAndReplace(curves) {
    if (!curves || curves.length === 0) return { type: 'path', curves: [] };

    // Get all points from curves
    const points = this.extractPoints(curves);
    if (points.length < 4) return { type: 'path', curves: curves };

    // Try to detect shapes in order of specificity
    const circle = this.detectCircle(points);
    if (circle) {
      return this.flatten ? this.flattenCircle(circle) : circle;
    }

    const ellipse = this.detectEllipse(points);
    if (ellipse) {
      return this.flatten ? this.flattenEllipse(ellipse) : ellipse;
    }

    const rotatedRect = this.detectRotatedRectangle(points);
    if (rotatedRect) {
      return this.flatten ? this.flattenRectangle(rotatedRect) : rotatedRect;
    }

    const rectangle = this.detectRectangle(points);
    if (rectangle) {
      return this.flatten ? this.flattenRectangle(rectangle) : rectangle;
    }

    // No shape detected, return as path
    return { type: 'path', curves: curves };
  }

  /**
   * Extract all points from curves
   */
  extractPoints(curves) {
    const points = [];
    for (const curve of curves) {
      if (curve.start) points.push(curve.start);
      // Sample points along curve for fitting
      if (curve.type === 'arc' || curve.type === 'quadratic' || curve.type === 'cubic') {
        for (let t = 0.25; t < 1; t += 0.25) {
          const p = this.sampleCurve(curve, t);
          if (p) points.push(p);
        }
      }
    }
    return points;
  }

  /**
   * Sample a point on a curve at parameter t
   */
  sampleCurve(curve, t) {
    switch (curve.type) {
      case 'line':
        return {
          x: curve.start.x + t * (curve.end.x - curve.start.x),
          y: curve.start.y + t * (curve.end.y - curve.start.y)
        };

      case 'quadratic':
        const mt1 = 1 - t;
        return {
          x: mt1 * mt1 * curve.start.x + 2 * mt1 * t * curve.cp.x + t * t * curve.end.x,
          y: mt1 * mt1 * curve.start.y + 2 * mt1 * t * curve.cp.y + t * t * curve.end.y
        };

      case 'cubic':
        const mt2 = 1 - t;
        return {
          x: mt2 * mt2 * mt2 * curve.start.x + 3 * mt2 * mt2 * t * curve.cp1.x +
             3 * mt2 * t * t * curve.cp2.x + t * t * t * curve.end.x,
          y: mt2 * mt2 * mt2 * curve.start.y + 3 * mt2 * mt2 * t * curve.cp1.y +
             3 * mt2 * t * t * curve.cp2.y + t * t * t * curve.end.y
        };

      case 'arc':
        const angle = curve.startAngle + t * (curve.endAngle - curve.startAngle);
        return {
          x: curve.cx + curve.r * Math.cos(angle),
          y: curve.cy + curve.r * Math.sin(angle)
        };

      default:
        return null;
    }
  }

  /**
   * Detect if points form a circle
   */
  detectCircle(points) {
    if (points.length < 8) return null;

    // Calculate centroid
    let cx = 0, cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    // Calculate average radius and variance
    let sumR = 0;
    const radii = [];
    for (const p of points) {
      const r = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
      radii.push(r);
      sumR += r;
    }
    const avgR = sumR / points.length;

    // Check if all radii are within tolerance
    let maxDeviation = 0;
    for (const r of radii) {
      const deviation = Math.abs(r - avgR) / avgR;
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    if (maxDeviation <= this.tolerance) {
      return {
        type: 'circle',
        cx: cx,
        cy: cy,
        r: avgR
      };
    }

    return null;
  }

  /**
   * Detect if points form an ellipse
   */
  detectEllipse(points) {
    if (points.length < 8) return null;

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

    // Check if points lie on ellipse
    let maxDeviation = 0;
    for (const p of points) {
      // Distance from point to ellipse
      const nx = (p.x - cx) / rx;
      const ny = (p.y - cy) / ry;
      const d = Math.sqrt(nx * nx + ny * ny);
      const deviation = Math.abs(d - 1);
      maxDeviation = Math.max(maxDeviation, deviation);
    }

    if (maxDeviation <= this.tolerance * 2) {
      return {
        type: 'ellipse',
        cx: cx,
        cy: cy,
        rx: rx,
        ry: ry
      };
    }

    return null;
  }

  /**
   * Detect if points form a rectangle (axis-aligned)
   */
  detectRectangle(points) {
    if (points.length < 4) return null;

    // Find bounding box
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }

    const width = maxX - minX;
    const height = maxY - minY;

    if (width < 2 || height < 2) return null;

    // Check if points lie on rectangle boundary
    let onBoundary = 0;
    const edgeTolerance = Math.max(width, height) * this.tolerance;

    for (const p of points) {
      const onLeft = Math.abs(p.x - minX) <= edgeTolerance;
      const onRight = Math.abs(p.x - maxX) <= edgeTolerance;
      const onTop = Math.abs(p.y - minY) <= edgeTolerance;
      const onBottom = Math.abs(p.y - maxY) <= edgeTolerance;

      if (onLeft || onRight || onTop || onBottom) {
        onBoundary++;
      }
    }

    const ratio = onBoundary / points.length;

    if (ratio >= 0.8) { // 80% of points on boundary
      return {
        type: 'rect',
        x: minX,
        y: minY,
        width: width,
        height: height,
        rotation: 0
      };
    }

    return null;
  }

  /**
   * Detect rotated rectangle using minimum area bounding box
   */
  detectRotatedRectangle(points) {
    if (points.length < 4) return null;

    // Compute convex hull
    const hull = this.convexHull(points);
    if (hull.length < 4) return null;

    // Find minimum area bounding rectangle using rotating calipers
    let minArea = Infinity;
    let bestRect = null;

    for (let i = 0; i < hull.length; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % hull.length];

      // Edge direction
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 0.001) continue;

      // Normalized direction and perpendicular
      const ux = dx / len;
      const uy = dy / len;
      const vx = -uy;
      const vy = ux;

      // Project all points onto the edge and perpendicular
      let minU = Infinity, maxU = -Infinity;
      let minV = Infinity, maxV = -Infinity;

      for (const p of hull) {
        const relX = p.x - p1.x;
        const relY = p.y - p1.y;
        const u = relX * ux + relY * uy;
        const v = relX * vx + relY * vy;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
      }

      const width = maxU - minU;
      const height = maxV - minV;
      const area = width * height;

      if (area < minArea) {
        minArea = area;
        const rotation = Math.atan2(uy, ux);

        // Calculate corner of rectangle
        const cornerX = p1.x + minU * ux + minV * vx;
        const cornerY = p1.y + minU * uy + minV * vy;

        bestRect = {
          type: 'rect',
          x: cornerX,
          y: cornerY,
          width: width,
          height: height,
          rotation: rotation,
          // Store unrotated center for transform
          cx: cornerX + width / 2 * ux + height / 2 * vx,
          cy: cornerY + width / 2 * uy + height / 2 * vy
        };
      }
    }

    if (!bestRect) return null;

    // Verify points lie on rotated rectangle boundary
    const cos = Math.cos(-bestRect.rotation);
    const sin = Math.sin(-bestRect.rotation);
    const cx = bestRect.cx;
    const cy = bestRect.cy;
    const hw = bestRect.width / 2;
    const hh = bestRect.height / 2;

    let onBoundary = 0;
    const edgeTolerance = Math.max(bestRect.width, bestRect.height) * this.tolerance;

    for (const p of points) {
      // Rotate point to axis-aligned space
      const relX = p.x - cx;
      const relY = p.y - cy;
      const localX = relX * cos - relY * sin;
      const localY = relX * sin + relY * cos;

      const onLeft = Math.abs(localX + hw) <= edgeTolerance;
      const onRight = Math.abs(localX - hw) <= edgeTolerance;
      const onTop = Math.abs(localY + hh) <= edgeTolerance;
      const onBottom = Math.abs(localY - hh) <= edgeTolerance;

      if ((onLeft || onRight) && Math.abs(localY) <= hh + edgeTolerance) {
        onBoundary++;
      } else if ((onTop || onBottom) && Math.abs(localX) <= hw + edgeTolerance) {
        onBoundary++;
      }
    }

    const ratio = onBoundary / points.length;

    // Only accept if rotation is significant and fit is good
    if (ratio >= 0.75 && Math.abs(bestRect.rotation) > 0.05) {
      return bestRect;
    }

    return null;
  }

  /**
   * Compute convex hull using Graham scan
   */
  convexHull(points) {
    if (points.length < 3) return points.slice();

    // Find lowest point
    let lowest = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[lowest].y ||
          (points[i].y === points[lowest].y && points[i].x < points[lowest].x)) {
        lowest = i;
      }
    }

    const pivot = points[lowest];

    // Sort by polar angle
    const sorted = points.slice();
    sorted.splice(lowest, 1);
    sorted.sort((a, b) => {
      const angleA = Math.atan2(a.y - pivot.y, a.x - pivot.x);
      const angleB = Math.atan2(b.y - pivot.y, b.x - pivot.x);
      if (Math.abs(angleA - angleB) < 1e-10) {
        const distA = (a.x - pivot.x) ** 2 + (a.y - pivot.y) ** 2;
        const distB = (b.x - pivot.x) ** 2 + (b.y - pivot.y) ** 2;
        return distA - distB;
      }
      return angleA - angleB;
    });

    // Graham scan
    const hull = [pivot];

    for (const p of sorted) {
      while (hull.length > 1 && this.cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) {
        hull.pop();
      }
      hull.push(p);
    }

    return hull;
  }

  /**
   * Cross product of vectors OA and OB
   */
  cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  /**
   * Flatten circle to Bezier curves (4 cubic Bezier arcs)
   */
  flattenCircle(circle) {
    const { cx, cy, r } = circle;
    const kappa = 0.5522847498; // 4 * (sqrt(2) - 1) / 3

    const curves = [];
    const k = r * kappa;

    // Top-right arc
    curves.push({
      type: 'cubic',
      start: { x: cx, y: cy - r },
      cp1: { x: cx + k, y: cy - r },
      cp2: { x: cx + r, y: cy - k },
      end: { x: cx + r, y: cy }
    });

    // Bottom-right arc
    curves.push({
      type: 'cubic',
      start: { x: cx + r, y: cy },
      cp1: { x: cx + r, y: cy + k },
      cp2: { x: cx + k, y: cy + r },
      end: { x: cx, y: cy + r }
    });

    // Bottom-left arc
    curves.push({
      type: 'cubic',
      start: { x: cx, y: cy + r },
      cp1: { x: cx - k, y: cy + r },
      cp2: { x: cx - r, y: cy + k },
      end: { x: cx - r, y: cy }
    });

    // Top-left arc
    curves.push({
      type: 'cubic',
      start: { x: cx - r, y: cy },
      cp1: { x: cx - r, y: cy - k },
      cp2: { x: cx - k, y: cy - r },
      end: { x: cx, y: cy - r }
    });

    return { type: 'path', curves };
  }

  /**
   * Flatten ellipse to Bezier curves
   */
  flattenEllipse(ellipse) {
    const { cx, cy, rx, ry } = ellipse;
    const kappa = 0.5522847498;

    const curves = [];
    const kx = rx * kappa;
    const ky = ry * kappa;

    // Top-right arc
    curves.push({
      type: 'cubic',
      start: { x: cx, y: cy - ry },
      cp1: { x: cx + kx, y: cy - ry },
      cp2: { x: cx + rx, y: cy - ky },
      end: { x: cx + rx, y: cy }
    });

    // Bottom-right arc
    curves.push({
      type: 'cubic',
      start: { x: cx + rx, y: cy },
      cp1: { x: cx + rx, y: cy + ky },
      cp2: { x: cx + kx, y: cy + ry },
      end: { x: cx, y: cy + ry }
    });

    // Bottom-left arc
    curves.push({
      type: 'cubic',
      start: { x: cx, y: cy + ry },
      cp1: { x: cx - kx, y: cy + ry },
      cp2: { x: cx - rx, y: cy + ky },
      end: { x: cx - rx, y: cy }
    });

    // Top-left arc
    curves.push({
      type: 'cubic',
      start: { x: cx - rx, y: cy },
      cp1: { x: cx - rx, y: cy - ky },
      cp2: { x: cx - kx, y: cy - ry },
      end: { x: cx, y: cy - ry }
    });

    return { type: 'path', curves };
  }

  /**
   * Flatten rectangle to line segments
   */
  flattenRectangle(rect) {
    const { x, y, width, height, rotation } = rect;

    // Calculate corners
    let corners = [
      { x: x, y: y },
      { x: x + width, y: y },
      { x: x + width, y: y + height },
      { x: x, y: y + height }
    ];

    // Apply rotation if needed
    if (rotation && rotation !== 0) {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);

      corners = corners.map(p => {
        const dx = p.x - cx;
        const dy = p.y - cy;
        return {
          x: cx + dx * cos - dy * sin,
          y: cy + dx * sin + dy * cos
        };
      });
    }

    // Create line segments
    const curves = [];
    for (let i = 0; i < 4; i++) {
      curves.push({
        type: 'line',
        start: corners[i],
        end: corners[(i + 1) % 4]
      });
    }

    return { type: 'path', curves };
  }
}

module.exports = ShapeDetector;
