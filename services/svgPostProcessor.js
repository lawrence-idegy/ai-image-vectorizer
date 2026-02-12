/**
 * SVG Post-Processor Service
 * Implements Vectorizer.ai-like features for SVG optimization and enhancement
 *
 * Features:
 * - Parameterized shape detection (circles, rectangles, ellipses)
 * - Gap filler to prevent white line artifacts
 * - Grouping options (none, color, parent, layer)
 * - Draw style options (fill, stroke shapes, stroke edges)
 * - Line fit tolerance settings
 * - SVG output options (versions, Adobe compatibility)
 */

const { JSDOM } = require('jsdom');

class SVGPostProcessor {
  constructor() {
    // Shape detection tolerances
    this.tolerances = {
      circleTolerance: 0.10,      // 10% deviation allowed for circle detection
      rectangleTolerance: 0.05,   // 5% for rectangle detection
      ellipseTolerance: 0.10,     // 10% for ellipse detection
      cornerAngleTolerance: 15,   // degrees from 90 for rectangle corners
    };

    // Line fit tolerance presets (in pixels)
    this.lineFitPresets = {
      coarse: 0.30,
      medium: 0.10,
      fine: 0.03,
      superFine: 0.01,
    };
  }

  /**
   * Main processing function - applies all post-processing options
   * @param {string} svgContent - Input SVG string
   * @param {Object} options - Processing options
   * @returns {string} - Processed SVG string
   */
  process(svgContent, options = {}) {
    const {
      detectShapes = true,
      shapeTypes = ['circle', 'ellipse', 'rectangle'],
      gapFiller = { enabled: false, strokeWidth: 1.5, clipOverflow: true },
      groupBy = 'none', // 'none', 'color', 'parent', 'layer'
      drawStyle = 'fill', // 'fill', 'strokeShapes', 'strokeEdges'
      strokeStyle = { width: 1, color: null, nonScaling: false },
      shapeStacking = 'stacked', // 'stacked', 'cutouts'
      svgVersion = '1.1',
      adobeCompatibility = false,
      lineFitTolerance = 'medium',
      maxPathsToProcess = 500, // Limit for performance on large SVGs
    } = options;

    // Skip heavy processing for very large SVGs to prevent memory issues
    const svgSizeKB = svgContent.length / 1024;
    const isLargeSvg = svgSizeKB > 500; // 500KB threshold

    // Parse SVG
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const doc = dom.window.document;
    const svg = doc.querySelector('svg');

    if (!svg) {
      throw new Error('Invalid SVG content');
    }

    // Step 1: Detect and convert parametric shapes (skip for very large SVGs)
    if (detectShapes && !isLargeSvg) {
      this.detectAndConvertShapes(svg, doc, shapeTypes, maxPathsToProcess);
    } else if (detectShapes && isLargeSvg) {
      console.log(`[SVGPostProcessor] Skipping shape detection for large SVG (${svgSizeKB.toFixed(0)}KB)`);
    }

    // Step 2: Apply grouping
    if (groupBy !== 'none') {
      this.applyGrouping(svg, doc, groupBy);
    }

    // Step 3: Apply draw style
    if (drawStyle !== 'fill') {
      this.applyDrawStyle(svg, doc, drawStyle, strokeStyle);
    }

    // Step 4: Add gap filler (skip for very large SVGs - too memory intensive)
    if (gapFiller.enabled && !isLargeSvg) {
      this.addGapFiller(svg, doc, gapFiller);
    } else if (gapFiller.enabled && isLargeSvg) {
      console.log(`[SVGPostProcessor] Skipping gap filler for large SVG (${svgSizeKB.toFixed(0)}KB)`);
    }

    // Step 5: Ensure viewBox is set for proper scaling
    this.ensureViewBox(svg);

    // Step 6: Apply SVG version and compatibility settings
    this.applySvgSettings(svg, svgVersion, adobeCompatibility);

    return svg.outerHTML;
  }

  /**
   * Detect and convert paths to parametric shapes
   */
  detectAndConvertShapes(svg, doc, shapeTypes, maxPaths = 500) {
    const paths = svg.querySelectorAll('path');
    const conversions = [];
    let processedCount = 0;

    paths.forEach(path => {
      // Limit processing for performance
      if (processedCount >= maxPaths) return;
      processedCount++;
      const d = path.getAttribute('d');
      if (!d) return;

      const points = this.parsePathToPoints(d);
      if (points.length < 3) return;

      // Try to detect each shape type
      for (const shapeType of shapeTypes) {
        const result = this.detectShape(points, shapeType);
        if (result) {
          conversions.push({ path, shapeType, params: result, points });
          break;
        }
      }
    });

    // Convert detected shapes
    conversions.forEach(({ path, shapeType, params }) => {
      const newElement = this.createShapeElement(doc, shapeType, params, path);
      if (newElement) {
        path.parentNode.replaceChild(newElement, path);
      }
    });

    return conversions.length;
  }

  /**
   * Parse SVG path data to array of points
   */
  parsePathToPoints(d) {
    const points = [];
    const commands = d.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi) || [];

    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    commands.forEach(cmd => {
      const type = cmd[0].toUpperCase();
      const isRelative = cmd[0] === cmd[0].toLowerCase();
      const nums = cmd.slice(1).trim().split(/[\s,]+/).map(parseFloat).filter(n => !isNaN(n));

      switch (type) {
        case 'M':
          if (isRelative) {
            currentX += nums[0] || 0;
            currentY += nums[1] || 0;
          } else {
            currentX = nums[0] || 0;
            currentY = nums[1] || 0;
          }
          startX = currentX;
          startY = currentY;
          points.push({ x: currentX, y: currentY, type: 'M' });
          break;

        case 'L':
          for (let i = 0; i < nums.length; i += 2) {
            if (isRelative) {
              currentX += nums[i] || 0;
              currentY += nums[i + 1] || 0;
            } else {
              currentX = nums[i] || 0;
              currentY = nums[i + 1] || 0;
            }
            points.push({ x: currentX, y: currentY, type: 'L' });
          }
          break;

        case 'H':
          nums.forEach(n => {
            currentX = isRelative ? currentX + n : n;
            points.push({ x: currentX, y: currentY, type: 'L' });
          });
          break;

        case 'V':
          nums.forEach(n => {
            currentY = isRelative ? currentY + n : n;
            points.push({ x: currentX, y: currentY, type: 'L' });
          });
          break;

        case 'C':
          // Cubic bezier - sample points along the curve
          for (let i = 0; i < nums.length; i += 6) {
            const x1 = isRelative ? currentX + nums[i] : nums[i];
            const y1 = isRelative ? currentY + nums[i + 1] : nums[i + 1];
            const x2 = isRelative ? currentX + nums[i + 2] : nums[i + 2];
            const y2 = isRelative ? currentY + nums[i + 3] : nums[i + 3];
            const x = isRelative ? currentX + nums[i + 4] : nums[i + 4];
            const y = isRelative ? currentY + nums[i + 5] : nums[i + 5];

            // Sample the curve
            for (let t = 0.25; t <= 1; t += 0.25) {
              const pt = this.cubicBezierPoint(currentX, currentY, x1, y1, x2, y2, x, y, t);
              points.push({ x: pt.x, y: pt.y, type: 'C' });
            }

            currentX = x;
            currentY = y;
          }
          break;

        case 'Q':
          // Quadratic bezier
          for (let i = 0; i < nums.length; i += 4) {
            const x1 = isRelative ? currentX + nums[i] : nums[i];
            const y1 = isRelative ? currentY + nums[i + 1] : nums[i + 1];
            const x = isRelative ? currentX + nums[i + 2] : nums[i + 2];
            const y = isRelative ? currentY + nums[i + 3] : nums[i + 3];

            for (let t = 0.25; t <= 1; t += 0.25) {
              const pt = this.quadraticBezierPoint(currentX, currentY, x1, y1, x, y, t);
              points.push({ x: pt.x, y: pt.y, type: 'Q' });
            }

            currentX = x;
            currentY = y;
          }
          break;

        case 'A':
          // Arc - sample many points along the arc for better shape detection
          for (let i = 0; i < nums.length; i += 7) {
            const rx = nums[i];
            const ry = nums[i + 1];
            const xAxisRotation = nums[i + 2] * Math.PI / 180;
            const largeArcFlag = nums[i + 3];
            const sweepFlag = nums[i + 4];
            const endX = isRelative ? currentX + nums[i + 5] : nums[i + 5];
            const endY = isRelative ? currentY + nums[i + 6] : nums[i + 6];

            // Sample points along the arc
            const arcPoints = this.sampleArcPoints(
              currentX, currentY, rx, ry, xAxisRotation, largeArcFlag, sweepFlag, endX, endY, 16
            );
            arcPoints.forEach(p => points.push({ x: p.x, y: p.y, type: 'A' }));

            currentX = endX;
            currentY = endY;
          }
          break;

        case 'Z':
          currentX = startX;
          currentY = startY;
          points.push({ x: currentX, y: currentY, type: 'Z' });
          break;
      }
    });

    return points;
  }

  /**
   * Calculate point on cubic bezier curve
   */
  cubicBezierPoint(x0, y0, x1, y1, x2, y2, x3, y3, t) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
      x: mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3,
      y: mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3,
    };
  }

  /**
   * Calculate point on quadratic bezier curve
   */
  quadraticBezierPoint(x0, y0, x1, y1, x2, y2, t) {
    const mt = 1 - t;
    return {
      x: mt * mt * x0 + 2 * mt * t * x1 + t * t * x2,
      y: mt * mt * y0 + 2 * mt * t * y1 + t * t * y2,
    };
  }

  /**
   * Sample points along an SVG arc
   */
  sampleArcPoints(x1, y1, rx, ry, phi, fA, fS, x2, y2, numSamples = 16) {
    const points = [];

    if (rx === 0 || ry === 0) {
      return [{ x: x2, y: y2 }];
    }

    // Convert endpoint parameterization to center parameterization
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;

    const x1p = cosPhi * dx + sinPhi * dy;
    const y1p = -sinPhi * dx + cosPhi * dy;

    // Correct radii if necessary
    let rxSq = rx * rx;
    let rySq = ry * ry;
    const x1pSq = x1p * x1p;
    const y1pSq = y1p * y1p;

    const lambda = x1pSq / rxSq + y1pSq / rySq;
    if (lambda > 1) {
      const sqrtLambda = Math.sqrt(lambda);
      rx *= sqrtLambda;
      ry *= sqrtLambda;
      rxSq = rx * rx;
      rySq = ry * ry;
    }

    // Calculate center point
    let sq = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
    sq = Math.sqrt(sq);
    if (fA === fS) sq = -sq;

    const cxp = sq * rx * y1p / ry;
    const cyp = -sq * ry * x1p / rx;

    const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

    // Calculate start and end angles
    const theta1 = this.vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dtheta = this.vectorAngle(
      (x1p - cxp) / rx, (y1p - cyp) / ry,
      (-x1p - cxp) / rx, (-y1p - cyp) / ry
    );

    if (fS === 0 && dtheta > 0) dtheta -= 2 * Math.PI;
    if (fS === 1 && dtheta < 0) dtheta += 2 * Math.PI;

    // Sample points along the arc
    for (let i = 1; i <= numSamples; i++) {
      const t = i / numSamples;
      const theta = theta1 + t * dtheta;

      const x = cosPhi * rx * Math.cos(theta) - sinPhi * ry * Math.sin(theta) + cx;
      const y = sinPhi * rx * Math.cos(theta) + cosPhi * ry * Math.sin(theta) + cy;

      points.push({ x, y });
    }

    return points;
  }

  /**
   * Calculate angle between two vectors
   */
  vectorAngle(ux, uy, vx, vy) {
    const sign = (ux * vy - uy * vx) < 0 ? -1 : 1;
    const dot = ux * vx + uy * vy;
    const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
    return sign * Math.acos(Math.max(-1, Math.min(1, dot / len)));
  }

  /**
   * Detect if points form a specific shape
   */
  detectShape(points, shapeType) {
    switch (shapeType) {
      case 'circle':
        return this.detectCircle(points);
      case 'ellipse':
        return this.detectEllipse(points);
      case 'rectangle':
        return this.detectRectangle(points);
      default:
        return null;
    }
  }

  /**
   * Detect if points form a circle
   */
  detectCircle(points) {
    if (points.length < 4) return null;

    // Calculate centroid
    const centroid = this.calculateCentroid(points);

    // Calculate distances from centroid
    const distances = points.map(p =>
      Math.sqrt((p.x - centroid.x) ** 2 + (p.y - centroid.y) ** 2)
    );

    // Filter out zero distances (center point)
    const nonZeroDistances = distances.filter(d => d > 0.1);
    if (nonZeroDistances.length < 4) return null;

    // Calculate mean radius and standard deviation
    const meanRadius = nonZeroDistances.reduce((a, b) => a + b, 0) / nonZeroDistances.length;
    if (meanRadius < 1) return null;

    const variance = nonZeroDistances.reduce((sum, d) => sum + (d - meanRadius) ** 2, 0) / nonZeroDistances.length;
    const stdDev = Math.sqrt(variance);

    // Check if it's circular (low deviation from mean radius)
    const relativeDeviation = stdDev / meanRadius;

    // Also check aspect ratio of bounding box
    const bbox = this.calculateBoundingBox(points);
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;
    const aspectRatio = Math.min(width, height) / Math.max(width, height);

    // For a circle, aspect ratio should be close to 1
    if (relativeDeviation < this.tolerances.circleTolerance && aspectRatio > 0.9) {
      return {
        cx: centroid.x,
        cy: centroid.y,
        r: meanRadius,
        confidence: 1 - relativeDeviation,
      };
    }

    return null;
  }

  /**
   * Detect if points form an ellipse
   */
  detectEllipse(points) {
    if (points.length < 8) return null;

    // Calculate bounding box
    const bbox = this.calculateBoundingBox(points);
    const centerX = (bbox.minX + bbox.maxX) / 2;
    const centerY = (bbox.minY + bbox.maxY) / 2;
    const rx = (bbox.maxX - bbox.minX) / 2;
    const ry = (bbox.maxY - bbox.minY) / 2;

    if (rx < 1 || ry < 1) return null;

    // Check if points lie on ellipse
    let totalError = 0;
    points.forEach(p => {
      const normalizedX = (p.x - centerX) / rx;
      const normalizedY = (p.y - centerY) / ry;
      const ellipseValue = normalizedX ** 2 + normalizedY ** 2;
      totalError += Math.abs(ellipseValue - 1);
    });

    const avgError = totalError / points.length;

    if (avgError < this.tolerances.ellipseTolerance) {
      return {
        cx: centerX,
        cy: centerY,
        rx,
        ry,
        confidence: 1 - avgError,
      };
    }

    return null;
  }

  /**
   * Detect if points form a rectangle
   */
  detectRectangle(points) {
    if (points.length < 4) return null;

    // For simple rectangle paths, we might only have 4-5 points
    // Use bounding box approach if we have few points
    const bbox = this.calculateBoundingBox(points);
    const width = bbox.maxX - bbox.minX;
    const height = bbox.maxY - bbox.minY;

    if (width < 1 || height < 1) return null;

    // Check if all points lie on the bounding box edges
    let onEdgeCount = 0;
    const tolerance = Math.max(width, height) * this.tolerances.rectangleTolerance;

    points.forEach(p => {
      const onLeft = Math.abs(p.x - bbox.minX) < tolerance;
      const onRight = Math.abs(p.x - bbox.maxX) < tolerance;
      const onTop = Math.abs(p.y - bbox.minY) < tolerance;
      const onBottom = Math.abs(p.y - bbox.maxY) < tolerance;

      if ((onLeft || onRight) && (p.y >= bbox.minY - tolerance && p.y <= bbox.maxY + tolerance)) {
        onEdgeCount++;
      } else if ((onTop || onBottom) && (p.x >= bbox.minX - tolerance && p.x <= bbox.maxX + tolerance)) {
        onEdgeCount++;
      }
    });

    const edgeRatio = onEdgeCount / points.length;

    // If most points are on edges, it's likely a rectangle
    if (edgeRatio > 0.8) {
      // Verify we have points at or near corners
      const hasCorners = this.hasRectangleCorners(points, bbox, tolerance * 2);

      if (hasCorners) {
        return {
          x: bbox.minX,
          y: bbox.minY,
          width,
          height,
          confidence: edgeRatio,
        };
      }
    }

    return null;
  }

  /**
   * Check if points include rectangle corners
   */
  hasRectangleCorners(points, bbox, tolerance) {
    const corners = [
      { x: bbox.minX, y: bbox.minY },
      { x: bbox.maxX, y: bbox.minY },
      { x: bbox.maxX, y: bbox.maxY },
      { x: bbox.minX, y: bbox.maxY },
    ];

    let foundCorners = 0;
    corners.forEach(corner => {
      const hasNearPoint = points.some(p =>
        Math.abs(p.x - corner.x) < tolerance && Math.abs(p.y - corner.y) < tolerance
      );
      if (hasNearPoint) foundCorners++;
    });

    return foundCorners >= 3; // Need at least 3 corners
  }

  /**
   * Find corner points in a path
   */
  findCorners(points, angleThreshold = 45) {
    const corners = [];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];

      const angle = this.calculateAngle(prev, curr, next);

      if (angle < 180 - angleThreshold) {
        corners.push(curr);
      }
    }

    return corners;
  }

  /**
   * Calculate angle at a point (in degrees)
   */
  calculateAngle(p1, p2, p3) {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
    const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);

    if (mag1 === 0 || mag2 === 0) return 180;

    const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
    return Math.acos(cosAngle) * (180 / Math.PI);
  }

  /**
   * Calculate centroid of points
   */
  calculateCentroid(points) {
    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / points.length, y: sum.y / points.length };
  }

  /**
   * Calculate bounding box of points
   */
  calculateBoundingBox(points) {
    return {
      minX: Math.min(...points.map(p => p.x)),
      maxX: Math.max(...points.map(p => p.x)),
      minY: Math.min(...points.map(p => p.y)),
      maxY: Math.max(...points.map(p => p.y)),
    };
  }

  /**
   * Create SVG element from detected shape
   */
  createShapeElement(doc, shapeType, params, originalPath) {
    let element;

    switch (shapeType) {
      case 'circle':
        element = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        element.setAttribute('cx', params.cx.toFixed(2));
        element.setAttribute('cy', params.cy.toFixed(2));
        element.setAttribute('r', params.r.toFixed(2));
        break;

      case 'ellipse':
        element = doc.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        element.setAttribute('cx', params.cx.toFixed(2));
        element.setAttribute('cy', params.cy.toFixed(2));
        element.setAttribute('rx', params.rx.toFixed(2));
        element.setAttribute('ry', params.ry.toFixed(2));
        break;

      case 'rectangle':
        element = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
        element.setAttribute('x', params.x.toFixed(2));
        element.setAttribute('y', params.y.toFixed(2));
        element.setAttribute('width', params.width.toFixed(2));
        element.setAttribute('height', params.height.toFixed(2));
        break;

      default:
        return null;
    }

    // Copy styles from original path
    const fill = originalPath.getAttribute('fill');
    const stroke = originalPath.getAttribute('stroke');
    const strokeWidth = originalPath.getAttribute('stroke-width');
    const style = originalPath.getAttribute('style');
    const transform = originalPath.getAttribute('transform');

    if (fill) element.setAttribute('fill', fill);
    if (stroke) element.setAttribute('stroke', stroke);
    if (strokeWidth) element.setAttribute('stroke-width', strokeWidth);
    if (style) element.setAttribute('style', style);
    if (transform) element.setAttribute('transform', transform);

    // Add data attribute for debugging
    element.setAttribute('data-detected-shape', shapeType);
    element.setAttribute('data-confidence', params.confidence.toFixed(3));

    return element;
  }

  /**
   * Apply grouping to SVG elements
   */
  applyGrouping(svg, doc, groupBy) {
    const elements = svg.querySelectorAll('path, circle, ellipse, rect, polygon');

    if (elements.length === 0) return;

    const groups = new Map();

    elements.forEach(el => {
      let key;

      switch (groupBy) {
        case 'color':
          key = this.getElementColor(el);
          break;
        case 'parent':
          key = el.parentNode.tagName || 'root';
          break;
        case 'layer':
          key = el.getAttribute('data-layer') || 'default';
          break;
        default:
          return;
      }

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(el);
    });

    // Create group elements
    groups.forEach((elements, key) => {
      if (elements.length < 2) return;

      const g = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('data-group', groupBy);
      g.setAttribute('data-group-key', key);

      // Insert group before first element
      const firstElement = elements[0];
      firstElement.parentNode.insertBefore(g, firstElement);

      // Move elements into group
      elements.forEach(el => g.appendChild(el));
    });
  }

  /**
   * Get color of an element (fill or stroke)
   */
  getElementColor(element) {
    const fill = element.getAttribute('fill');
    if (fill && fill !== 'none') return fill;

    const stroke = element.getAttribute('stroke');
    if (stroke && stroke !== 'none') return stroke;

    const style = element.getAttribute('style') || '';
    const fillMatch = style.match(/fill:\s*([^;]+)/);
    if (fillMatch) return fillMatch[1].trim();

    return 'unknown';
  }

  /**
   * Apply draw style (fill, stroke shapes, stroke edges)
   */
  applyDrawStyle(svg, doc, drawStyle, strokeStyle) {
    const elements = svg.querySelectorAll('path, circle, ellipse, rect, polygon');

    elements.forEach(el => {
      const currentFill = el.getAttribute('fill') || this.getStyleProperty(el, 'fill');

      switch (drawStyle) {
        case 'strokeShapes':
          // Convert fill to stroke
          if (currentFill && currentFill !== 'none') {
            el.setAttribute('stroke', strokeStyle.color || currentFill);
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke-width', strokeStyle.width || 1);

            if (strokeStyle.nonScaling) {
              el.setAttribute('vector-effect', 'non-scaling-stroke');
            }
          }
          break;

        case 'strokeEdges':
          // Similar to strokeShapes but different handling for adjacent shapes
          if (currentFill && currentFill !== 'none') {
            el.setAttribute('stroke', strokeStyle.color || '#000000');
            el.setAttribute('fill', 'none');
            el.setAttribute('stroke-width', strokeStyle.width || 1);

            if (strokeStyle.nonScaling) {
              el.setAttribute('vector-effect', 'non-scaling-stroke');
            }
          }
          break;
      }
    });
  }

  /**
   * Get style property from element
   */
  getStyleProperty(element, property) {
    const style = element.getAttribute('style') || '';
    const match = style.match(new RegExp(`${property}:\\s*([^;]+)`));
    return match ? match[1].trim() : null;
  }

  /**
   * Add gap filler strokes to prevent white line artifacts
   */
  addGapFiller(svg, doc, options) {
    const { strokeWidth = 1.5, clipOverflow = true, nonScalingStroke = true } = options;

    const paths = svg.querySelectorAll('path');
    if (paths.length < 2) return;

    // Create a group for gap filler strokes (should be drawn first/behind)
    const gapFillerGroup = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    gapFillerGroup.setAttribute('data-gap-filler', 'true');
    gapFillerGroup.setAttribute('class', 'gap-filler-strokes');

    // Find adjacent shapes and add gap filler strokes
    const processedPairs = new Set();

    paths.forEach((path1, i) => {
      const bbox1 = this.getPathBoundingBox(path1);
      const color1 = this.getElementColor(path1);

      paths.forEach((path2, j) => {
        if (i >= j) return;

        const pairKey = `${i}-${j}`;
        if (processedPairs.has(pairKey)) return;

        const bbox2 = this.getPathBoundingBox(path2);

        // Check if shapes are adjacent (bounding boxes touch or overlap slightly)
        if (this.areBoundingBoxesAdjacent(bbox1, bbox2)) {
          const color2 = this.getElementColor(path2);
          const avgColor = this.averageColors(color1, color2);

          // Create gap filler stroke along shared boundary
          const sharedBoundary = this.findSharedBoundary(path1, path2);
          if (sharedBoundary) {
            const gapStroke = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
            gapStroke.setAttribute('d', sharedBoundary);
            gapStroke.setAttribute('stroke', avgColor);
            gapStroke.setAttribute('stroke-width', strokeWidth);
            gapStroke.setAttribute('fill', 'none');
            gapStroke.setAttribute('stroke-linecap', 'round');

            if (nonScalingStroke) {
              gapStroke.setAttribute('vector-effect', 'non-scaling-stroke');
            }

            gapFillerGroup.appendChild(gapStroke);
          }

          processedPairs.add(pairKey);
        }
      });
    });

    // Insert gap filler group at the beginning (behind other elements)
    if (gapFillerGroup.children.length > 0) {
      svg.insertBefore(gapFillerGroup, svg.firstChild);
    }
  }

  /**
   * Get bounding box of a path element
   */
  getPathBoundingBox(path) {
    const d = path.getAttribute('d');
    const points = this.parsePathToPoints(d);
    return this.calculateBoundingBox(points);
  }

  /**
   * Check if two bounding boxes are adjacent
   */
  areBoundingBoxesAdjacent(bbox1, bbox2, threshold = 2) {
    // Check if boxes touch or nearly touch
    const xOverlap = !(bbox1.maxX < bbox2.minX - threshold || bbox2.maxX < bbox1.minX - threshold);
    const yOverlap = !(bbox1.maxY < bbox2.minY - threshold || bbox2.maxY < bbox1.minY - threshold);

    return xOverlap && yOverlap;
  }

  /**
   * Find shared boundary between two paths (simplified)
   */
  findSharedBoundary(path1, path2) {
    const points1 = this.parsePathToPoints(path1.getAttribute('d'));
    const points2 = this.parsePathToPoints(path2.getAttribute('d'));

    // Find points that are close to both paths
    const sharedPoints = [];
    const threshold = 2;

    points1.forEach(p1 => {
      const nearPoint = points2.find(p2 =>
        Math.abs(p1.x - p2.x) < threshold && Math.abs(p1.y - p2.y) < threshold
      );
      if (nearPoint) {
        sharedPoints.push({ x: (p1.x + nearPoint.x) / 2, y: (p1.y + nearPoint.y) / 2 });
      }
    });

    if (sharedPoints.length < 2) return null;

    // Create path from shared points
    let d = `M ${sharedPoints[0].x.toFixed(2)} ${sharedPoints[0].y.toFixed(2)}`;
    for (let i = 1; i < sharedPoints.length; i++) {
      d += ` L ${sharedPoints[i].x.toFixed(2)} ${sharedPoints[i].y.toFixed(2)}`;
    }

    return d;
  }

  /**
   * Average two colors
   */
  averageColors(color1, color2) {
    const rgb1 = this.parseColor(color1);
    const rgb2 = this.parseColor(color2);

    if (!rgb1 || !rgb2) return color1 || color2 || '#808080';

    const avg = {
      r: Math.round((rgb1.r + rgb2.r) / 2),
      g: Math.round((rgb1.g + rgb2.g) / 2),
      b: Math.round((rgb1.b + rgb2.b) / 2),
    };

    return `rgb(${avg.r},${avg.g},${avg.b})`;
  }

  /**
   * Parse color string to RGB
   */
  parseColor(color) {
    if (!color || color === 'none') return null;

    // Hex color
    if (color.startsWith('#')) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        };
      } else if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      }
    }

    // RGB color
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
      return {
        r: parseInt(rgbMatch[1]),
        g: parseInt(rgbMatch[2]),
        b: parseInt(rgbMatch[3]),
      };
    }

    return null;
  }

  /**
   * Ensure SVG has a viewBox for proper scaling
   */
  ensureViewBox(svg) {
    if (!svg.getAttribute('viewBox')) {
      const width = svg.getAttribute('width');
      const height = svg.getAttribute('height');
      if (width && height) {
        // Remove units if present (e.g., "400px" -> "400")
        const w = parseFloat(width);
        const h = parseFloat(height);
        if (!isNaN(w) && !isNaN(h)) {
          svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        }
      }
    }
  }

  /**
   * Apply SVG version and compatibility settings
   */
  applySvgSettings(svg, version, adobeCompatibility) {
    // Set SVG version
    switch (version) {
      case '1.0':
        svg.setAttribute('version', '1.0');
        break;
      case '1.1':
        svg.setAttribute('version', '1.1');
        svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        break;
      case 'tiny1.2':
        svg.setAttribute('version', '1.2');
        svg.setAttribute('baseProfile', 'tiny');
        break;
    }

    // Adobe Illustrator compatibility
    if (adobeCompatibility) {
      // Remove features that Adobe doesn't support well
      const elements = svg.querySelectorAll('*');
      elements.forEach(el => {
        // Remove vector-effect (Illustrator ignores it)
        if (el.getAttribute('vector-effect')) {
          el.removeAttribute('vector-effect');
        }

        // Convert rgba to rgb + opacity
        const fill = el.getAttribute('fill');
        if (fill && fill.startsWith('rgba')) {
          const converted = this.rgbaToRgbWithOpacity(fill);
          el.setAttribute('fill', converted.color);
          if (converted.opacity < 1) {
            el.setAttribute('fill-opacity', converted.opacity);
          }
        }
      });

      // Add Illustrator-specific namespace
      try {
        svg.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns:xlink', 'http://www.w3.org/1999/xlink');
      } catch (e) {
        // Fallback: add as regular attribute in output
      }
    }
  }

  /**
   * Convert rgba to rgb + opacity
   */
  rgbaToRgbWithOpacity(rgba) {
    const match = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (match) {
      return {
        color: `rgb(${match[1]},${match[2]},${match[3]})`,
        opacity: parseFloat(match[4]),
      };
    }
    return { color: rgba, opacity: 1 };
  }

  /**
   * Simplify path based on line fit tolerance
   */
  simplifyPath(pathData, tolerance) {
    const points = this.parsePathToPoints(pathData);
    if (points.length < 3) return pathData;

    // Douglas-Peucker algorithm for path simplification
    const simplified = this.douglasPeucker(points, tolerance);

    // Convert back to path data
    if (simplified.length < 2) return pathData;

    let d = `M ${simplified[0].x.toFixed(2)} ${simplified[0].y.toFixed(2)}`;
    for (let i = 1; i < simplified.length; i++) {
      d += ` L ${simplified[i].x.toFixed(2)} ${simplified[i].y.toFixed(2)}`;
    }
    if (points[points.length - 1].type === 'Z') {
      d += ' Z';
    }

    return d;
  }

  /**
   * Douglas-Peucker path simplification algorithm
   */
  douglasPeucker(points, epsilon) {
    if (points.length < 3) return points;

    // Find point with maximum distance
    let maxDist = 0;
    let maxIndex = 0;
    const end = points.length - 1;

    for (let i = 1; i < end; i++) {
      const dist = this.perpendicularDistance(points[i], points[0], points[end]);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    // If max distance is greater than epsilon, recursively simplify
    if (maxDist > epsilon) {
      const left = this.douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
      const right = this.douglasPeucker(points.slice(maxIndex), epsilon);
      return left.slice(0, -1).concat(right);
    } else {
      return [points[0], points[end]];
    }
  }

  /**
   * Calculate perpendicular distance from point to line
   */
  perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;

    if (dx === 0 && dy === 0) {
      return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    }

    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
    const nearestX = lineStart.x + t * dx;
    const nearestY = lineStart.y + t * dy;

    return Math.sqrt((point.x - nearestX) ** 2 + (point.y - nearestY) ** 2);
  }

  /**
   * Get statistics about the processed SVG
   */
  getStatistics(svgContent) {
    const dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    const svg = dom.window.document.querySelector('svg');

    if (!svg) return null;

    const paths = svg.querySelectorAll('path');
    const circles = svg.querySelectorAll('circle');
    const ellipses = svg.querySelectorAll('ellipse');
    const rects = svg.querySelectorAll('rect');
    const groups = svg.querySelectorAll('g');

    // Calculate total path length
    let totalPathLength = 0;
    paths.forEach(p => {
      const d = p.getAttribute('d') || '';
      totalPathLength += d.length;
    });

    // Count colors
    const colors = new Set();
    svg.querySelectorAll('*').forEach(el => {
      const fill = el.getAttribute('fill');
      const stroke = el.getAttribute('stroke');
      if (fill && fill !== 'none') colors.add(fill);
      if (stroke && stroke !== 'none') colors.add(stroke);
    });

    return {
      paths: paths.length,
      circles: circles.length,
      ellipses: ellipses.length,
      rectangles: rects.length,
      groups: groups.length,
      totalElements: paths.length + circles.length + ellipses.length + rects.length,
      totalPathDataLength: totalPathLength,
      uniqueColors: colors.size,
      fileSizeBytes: svgContent.length,
    };
  }
}

module.exports = new SVGPostProcessor();
