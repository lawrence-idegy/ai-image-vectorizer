/**
 * UNIFIED VECTORIZER - Built From Scratch
 *
 * Single, best-quality vectorization engine.
 * No VTracer, no external dependencies for core vectorization.
 *
 * Pipeline:
 * 1. EDGE DETECTION - Gradient-based sub-pixel edge detection
 * 2. COLOR EXTRACTION - Exact colors from non-edge pixels
 * 3. BOUNDARY TRACING - Walk color boundaries with sub-pixel precision
 * 4. CURVE FITTING - Schneider's algorithm for optimal Beziers
 * 5. SHAPE DETECTION - Identify geometric primitives
 * 6. SVG GENERATION - Output clean vector graphics
 */

const sharp = require('sharp');
const EdgeDetector = require('./edgeDetector');
const BoundaryTracer = require('./boundaryTracer');
const CurveFitter = require('./curveFitter');
const ShapeClassifier = require('./shapeClassifier');
const GeometryOptimizer = require('./geometryOptimizer');
const SVGBuilder = require('./svgBuilder');

class Vectorizer {
  constructor(options = {}) {
    this.options = {
      // Edge detection
      edgeThreshold: options.edgeThreshold || 10,
      colorGroupThreshold: options.colorGroupThreshold || 15,

      // Contour tracing
      minContourLength: options.minContourLength || 4,
      simplifyTolerance: options.simplifyTolerance || 0.5,
      smoothIterations: options.smoothIterations || 1,

      // Curve fitting
      lineTolerance: options.lineTolerance || 0.5,
      arcTolerance: options.arcTolerance || 0.5,
      bezierTolerance: options.bezierTolerance || 0.5,

      // Shape detection
      detectShapes: options.detectShapes !== false,
      shapeConfidenceThreshold: options.shapeConfidenceThreshold || 0.92,

      // Geometry optimization
      snapCorners: options.snapCorners !== false,
      straightenLines: options.straightenLines !== false,

      // Output
      gapFiller: options.gapFiller !== false,
      gapFillerWidth: options.gapFillerWidth || 1.0,
      groupBy: options.groupBy || 'color',

      ...options
    };

    // Initialize modules
    this.edgeDetector = new EdgeDetector({
      edgeThreshold: this.options.edgeThreshold,
      colorGroupThreshold: this.options.colorGroupThreshold,
    });

    this.boundaryTracer = new BoundaryTracer({
      minContourLength: this.options.minContourLength,
      simplifyTolerance: this.options.simplifyTolerance,
      smoothIterations: this.options.smoothIterations,
    });

    this.curveFitter = new CurveFitter({
      lineTolerance: this.options.lineTolerance,
      arcTolerance: this.options.arcTolerance,
      bezierTolerance: this.options.bezierTolerance,
    });

    this.shapeClassifier = new ShapeClassifier({
      confidenceThreshold: this.options.shapeConfidenceThreshold,
    });

    this.geometryOptimizer = new GeometryOptimizer();

    this.svgBuilder = new SVGBuilder({
      gapFiller: this.options.gapFiller,
      gapFillerWidth: this.options.gapFillerWidth,
      groupBy: this.options.groupBy,
    });
  }

  /**
   * Vectorize an image
   * @param {Buffer} imageBuffer - Input image
   * @returns {Promise<string>} SVG content
   */
  async vectorize(imageBuffer) {
    const startTime = Date.now();
    console.log('[Vectorizer] Starting vectorization...');

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    console.log(`[Vectorizer] Input: ${width}x${height}`);

    // === STAGE 1: EDGE DETECTION ===
    console.log('[Vectorizer] Stage 1: Edge detection...');
    const edgeData = await this.edgeDetector.detect(imageBuffer);

    // === STAGE 2: BOUNDARY TRACING ===
    console.log('[Vectorizer] Stage 2: Boundary tracing...');
    const regions = this.boundaryTracer.trace(edgeData);

    // === STAGE 3: CURVE FITTING ===
    console.log('[Vectorizer] Stage 3: Curve fitting...');
    const fittedRegions = this.fitCurves(regions);

    // === STAGE 4: SHAPE DETECTION ===
    if (this.options.detectShapes) {
      console.log('[Vectorizer] Stage 4: Shape detection...');
      this.detectShapes(fittedRegions);
    }

    // === STAGE 5: GEOMETRY OPTIMIZATION ===
    if (this.options.snapCorners || this.options.straightenLines) {
      console.log('[Vectorizer] Stage 5: Geometry optimization...');
      this.optimizeGeometry(fittedRegions);
    }

    // === STAGE 6: SVG GENERATION ===
    console.log('[Vectorizer] Stage 6: SVG generation...');
    const svg = this.buildSVG(fittedRegions, width, height, edgeData.colors);

    const duration = Date.now() - startTime;
    console.log(`[Vectorizer] Complete in ${duration}ms`);

    return svg;
  }

  /**
   * Fit curves to all region contours
   */
  fitCurves(regions) {
    return regions.map(region => {
      const paths = region.contours.map(contour => {
        const curves = this.curveFitter.fitCurves(contour);
        return { type: 'path', curves };
      });

      return {
        color: {
          r: region.color.r,
          g: region.color.g,
          b: region.color.b,
          hex: region.color.hex
        },
        paths
      };
    });
  }

  /**
   * Detect geometric shapes in paths
   */
  detectShapes(regions) {
    for (const region of regions) {
      for (let i = 0; i < region.paths.length; i++) {
        const path = region.paths[i];

        if (path.type === 'path' && path.curves && path.curves.length > 0) {
          // Extract points from curves for classification
          const points = this.extractPointsFromCurves(path.curves);

          if (points.length >= 8) {
            const classification = this.shapeClassifier.classify(points);

            if (classification.isGeometric) {
              console.log(`[Vectorizer] Detected ${classification.type} (${(classification.confidence * 100).toFixed(0)}%)`);

              // Replace path with geometric primitive
              region.paths[i] = {
                type: classification.type,
                ...classification.params
              };
            }
          }
        }
      }
    }
  }

  /**
   * Extract points from curve array
   */
  extractPointsFromCurves(curves) {
    const points = [];

    for (const curve of curves) {
      if (curve.start) points.push(curve.start);

      // Sample intermediate points for curves
      if (curve.type === 'quadratic' || curve.type === 'cubic') {
        for (let t = 0.25; t < 1; t += 0.25) {
          const p = this.sampleCurve(curve, t);
          if (p) points.push(p);
        }
      }

      if (curve.end) points.push(curve.end);
    }

    return points;
  }

  /**
   * Sample point on a curve at parameter t
   */
  sampleCurve(curve, t) {
    if (curve.type === 'line') {
      return {
        x: curve.start.x + t * (curve.end.x - curve.start.x),
        y: curve.start.y + t * (curve.end.y - curve.start.y)
      };
    }

    if (curve.type === 'quadratic') {
      const mt = 1 - t;
      return {
        x: mt * mt * curve.start.x + 2 * mt * t * curve.cp.x + t * t * curve.end.x,
        y: mt * mt * curve.start.y + 2 * mt * t * curve.cp.y + t * t * curve.end.y
      };
    }

    if (curve.type === 'cubic') {
      const mt = 1 - t;
      return {
        x: mt * mt * mt * curve.start.x + 3 * mt * mt * t * curve.cp1.x +
           3 * mt * t * t * curve.cp2.x + t * t * t * curve.end.x,
        y: mt * mt * mt * curve.start.y + 3 * mt * mt * t * curve.cp1.y +
           3 * mt * t * t * curve.cp2.y + t * t * t * curve.end.y
      };
    }

    return null;
  }

  /**
   * Optimize geometry (corners, lines)
   */
  optimizeGeometry(regions) {
    for (const region of regions) {
      for (const path of region.paths) {
        if (path.type === 'path' && path.curves) {
          path.curves = this.geometryOptimizer.optimize(path.curves, {});
        }
      }
    }
  }

  /**
   * Build final SVG
   */
  buildSVG(regions, width, height, colors) {
    return this.svgBuilder.build(regions, width, height, colors);
  }
}

module.exports = Vectorizer;
