/**
 * UNIFIED VECTORIZER ENGINE
 *
 * Single, best-quality vectorization engine.
 *
 * Philosophy:
 * - Quality over speed (no shortcuts, no compromises)
 * - Preserve original colors EXACTLY
 * - Preserve original shapes FAITHFULLY
 * - Clean up edges while maintaining shape intent
 * - Output true geometric primitives when confident
 * - Output optimized Bezier curves for organic shapes
 *
 * Pipeline:
 * 1. Preprocessing - AI upscale (optional), edge enhancement
 * 2. Color Extraction - Extract exact colors, map anti-aliased pixels
 * 3. Region Extraction - Connected components for each color
 * 4. Contour Tracing - Sub-pixel precision marching squares
 * 5. Shape Classification - Determine geometric vs organic
 * 6. Curve Fitting - Schneider's algorithm for optimal Beziers
 * 7. Geometry Optimization - Corner sharpening, line straightening
 * 8. SVG Generation - True primitives where applicable
 */

const sharp = require('sharp');
const ColorExtractor = require('./colorExtractor');
const ContourTracer = require('./contourTracer');
const ShapeClassifier = require('./shapeClassifier');
const CurveFitter = require('./curveFitter');
const GeometryOptimizer = require('./geometryOptimizer');
const SVGBuilder = require('./svgBuilder');

class UnifiedVectorizer {
  constructor(options = {}) {
    this.options = {
      // === QUALITY SETTINGS ===
      // Higher = slower but better quality
      qualityLevel: options.qualityLevel || 'high', // 'high', 'ultra'

      // === COLOR SETTINGS ===
      // Anti-aliasing merge threshold (LAB distance)
      // Lower = preserve more colors (safer for brand colors)
      antiAliasingThreshold: options.antiAliasingThreshold || 8,

      // Minimum region area (pixels) to keep
      minRegionArea: options.minRegionArea || 4,

      // === TRACING SETTINGS ===
      // Simplification tolerance (Douglas-Peucker)
      simplifyTolerance: options.simplifyTolerance || 0.8,

      // Chaikin smoothing iterations (0 = disabled)
      smoothingIterations: options.smoothingIterations || 2,

      // === CURVE FITTING ===
      // Tolerance for line detection (lower = stricter)
      lineTolerance: options.lineTolerance || 0.5,

      // Tolerance for arc detection
      arcTolerance: options.arcTolerance || 0.5,

      // Tolerance for Bezier fitting
      bezierTolerance: options.bezierTolerance || 0.5,

      // === SHAPE DETECTION ===
      // Enable geometric shape detection
      detectShapes: options.detectShapes !== false,

      // Confidence threshold for shape detection (higher = more conservative)
      shapeConfidenceThreshold: options.shapeConfidenceThreshold || 0.92,

      // === GEOMETRY OPTIMIZATION ===
      // Snap corners to clean angles
      snapCorners: options.snapCorners !== false,

      // Straighten nearly-straight lines
      straightenLines: options.straightenLines !== false,

      // Snap to horizontal/vertical
      snapToHV: options.snapToHV !== false,

      // === OUTPUT SETTINGS ===
      // Gap filler strokes (prevents white lines between shapes)
      gapFiller: options.gapFiller !== false,
      gapFillerWidth: options.gapFillerWidth || 1.5,

      // Grouping: 'none', 'color', 'layer'
      groupBy: options.groupBy || 'color',

      ...options
    };

    // Initialize modules
    this.colorExtractor = new ColorExtractor({
      antiAliasingThreshold: this.options.antiAliasingThreshold,
      minRegionArea: this.options.minRegionArea,
    });

    this.contourTracer = new ContourTracer({
      simplifyTolerance: this.options.simplifyTolerance,
      chaikinIterations: this.options.smoothingIterations,
      subPixelPrecision: true,
    });

    this.shapeClassifier = new ShapeClassifier({
      confidenceThreshold: this.options.shapeConfidenceThreshold,
    });

    this.curveFitter = new CurveFitter({
      lineTolerance: this.options.lineTolerance,
      arcTolerance: this.options.arcTolerance,
      bezierTolerance: this.options.bezierTolerance,
    });

    this.geometryOptimizer = new GeometryOptimizer({
      angleSnapTolerance: 5,
      lineSnapTolerance: 0.5,
      hvSnapTolerance: 3,
    });

    this.svgBuilder = new SVGBuilder({
      gapFiller: this.options.gapFiller,
      gapFillerWidth: this.options.gapFillerWidth,
      groupBy: this.options.groupBy,
    });
  }

  /**
   * Main vectorization entry point
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {Object} options - Override options for this call
   * @returns {Promise<string>} - SVG content
   */
  async vectorize(imageBuffer, options = {}) {
    const startTime = Date.now();
    const opts = { ...this.options, ...options };

    console.log('[UnifiedVectorizer] Starting vectorization...');
    console.log('[UnifiedVectorizer] Quality level:', opts.qualityLevel);

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();
    console.log(`[UnifiedVectorizer] Input: ${metadata.width}x${metadata.height}`);

    // === STAGE 1: COLOR EXTRACTION ===
    console.log('[UnifiedVectorizer] Stage 1: Extracting colors...');
    const { width, height, colors, regions, pixelMap } = await this.colorExtractor.extract(imageBuffer);
    console.log(`[UnifiedVectorizer] Found ${colors.length} colors, ${regions.length} regions`);

    // === STAGE 2: CONTOUR TRACING ===
    console.log('[UnifiedVectorizer] Stage 2: Tracing contours...');
    const tracedRegions = [];

    for (const region of regions) {
      const contours = this.contourTracer.trace(region, width, height);

      if (contours.length > 0) {
        tracedRegions.push({
          color: region.color,
          contours,
          bounds: region.bounds,
          area: region.area
        });
      }
    }
    console.log(`[UnifiedVectorizer] Traced ${tracedRegions.length} regions`);

    // === STAGE 3: CURVE FITTING & SHAPE DETECTION ===
    console.log('[UnifiedVectorizer] Stage 3: Fitting curves...');
    const fittedRegions = [];

    for (const region of tracedRegions) {
      const paths = [];

      for (const contour of region.contours) {
        // First, fit curves to the contour
        const curves = this.curveFitter.fitCurves(contour);

        // Then, try to classify as a geometric shape
        let path;
        if (opts.detectShapes) {
          const classification = this.shapeClassifier.classify(contour);

          if (classification.isGeometric) {
            // Use the detected geometric shape
            path = {
              type: classification.type,
              ...classification.params
            };
            console.log(`[UnifiedVectorizer] Detected ${classification.type} with ${(classification.confidence * 100).toFixed(0)}% confidence`);
          } else {
            // Use fitted curves
            path = { type: 'path', curves };
          }
        } else {
          // Shape detection disabled, always use curves
          path = { type: 'path', curves };
        }

        paths.push(path);
      }

      fittedRegions.push({
        color: this.hexToRgb(region.color),
        paths
      });
    }

    // === STAGE 4: GEOMETRY OPTIMIZATION ===
    if (opts.snapCorners || opts.straightenLines || opts.snapToHV) {
      console.log('[UnifiedVectorizer] Stage 4: Optimizing geometry...');

      for (const region of fittedRegions) {
        for (let i = 0; i < region.paths.length; i++) {
          const path = region.paths[i];

          if (path.type === 'path' && path.curves) {
            // Get classification for this path
            const classification = opts.detectShapes
              ? this.shapeClassifier.classify(this.curvesToPoints(path.curves))
              : { isGeometric: false };

            // Optimize curves
            path.curves = this.geometryOptimizer.optimize(path.curves, classification);
          }
        }
      }
    }

    // === STAGE 5: SVG GENERATION ===
    console.log('[UnifiedVectorizer] Stage 5: Building SVG...');
    const svg = this.svgBuilder.build(fittedRegions, width, height, colors);

    const duration = Date.now() - startTime;
    console.log(`[UnifiedVectorizer] Complete in ${duration}ms`);

    return svg;
  }

  /**
   * Convert hex color to RGB object
   */
  hexToRgb(hex) {
    const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (match) {
      return {
        r: parseInt(match[1], 16),
        g: parseInt(match[2], 16),
        b: parseInt(match[3], 16)
      };
    }
    return { r: 0, g: 0, b: 0 };
  }

  /**
   * Convert curves back to points for classification
   */
  curvesToPoints(curves) {
    const points = [];
    for (const curve of curves) {
      if (curve.start) points.push(curve.start);
      // Sample along curves
      if (curve.type === 'cubic' || curve.type === 'quadratic') {
        for (let t = 0.25; t < 1; t += 0.25) {
          const p = this.sampleCurve(curve, t);
          if (p) points.push(p);
        }
      }
    }
    return points;
  }

  /**
   * Sample a point on a curve
   */
  sampleCurve(curve, t) {
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
}

module.exports = UnifiedVectorizer;
