/**
 * Quality Validator Service
 * Validates SVG output quality and provides metrics
 */

class QualityValidator {
  /**
   * Validate and analyze SVG quality
   * @param {string} svgContent - SVG content to validate
   * @returns {object} Quality metrics
   */
  validateSVG(svgContent) {
    const metrics = {
      isValid: false,
      isTrueVector: false,
      quality: 'unknown',
      pathCount: 0,
      fileSize: 0,
      complexity: 'unknown',
      hasViewBox: false,
      hasColors: false,
      colorCount: 0,
      resolutionIndependent: false,
      hasEmbeddedRaster: false,
      vectorElements: 0,
      warnings: [],
      score: 0 // 0-100 quality score
    };

    try {
      // Basic validation
      if (!svgContent || typeof svgContent !== 'string') {
        metrics.warnings.push('Invalid SVG content');
        return metrics;
      }

      const isSVG = svgContent.trim().startsWith('<svg') || svgContent.includes('<svg');
      if (!isSVG) {
        metrics.warnings.push('Content is not valid SVG format');
        return metrics;
      }

      metrics.isValid = true;
      metrics.fileSize = Buffer.byteLength(svgContent, 'utf8');

      // CRITICAL: Check for embedded raster images
      const hasImageTag = /<image\s/.test(svgContent);
      const hasBase64 = /data:image\/(png|jpg|jpeg|gif|webp);base64,/.test(svgContent);
      const hasExternalImage = /<image[^>]+href=["'](?!data:)[^"']+["']/.test(svgContent);

      if (hasImageTag || hasBase64 || hasExternalImage) {
        metrics.hasEmbeddedRaster = true;
        metrics.isTrueVector = false;
        metrics.warnings.push('⚠ CRITICAL: Contains embedded raster image - NOT a true vector!');
        metrics.warnings.push('This SVG wraps a pixel image and will NOT scale infinitely');
      } else {
        metrics.isTrueVector = true;
      }

      // Count vector elements (paths, circles, rects, polygons, polylines, ellipses)
      const vectorElements = [
        /<path/g,
        /<circle/g,
        /<rect/g,
        /<polygon/g,
        /<polyline/g,
        /<ellipse/g,
        /<line/g
      ];

      let totalVectorElements = 0;
      vectorElements.forEach(pattern => {
        const matches = svgContent.match(pattern);
        totalVectorElements += matches ? matches.length : 0;
      });

      metrics.vectorElements = totalVectorElements;

      // Count paths specifically
      const pathMatches = svgContent.match(/<path/g);
      metrics.pathCount = pathMatches ? pathMatches.length : 0;

      // Check for viewBox (required for resolution independence)
      metrics.hasViewBox = svgContent.includes('viewBox');
      if (!metrics.hasViewBox) {
        metrics.warnings.push('Missing viewBox - may not scale properly');
        metrics.resolutionIndependent = false;
      } else {
        metrics.resolutionIndependent = true;
      }

      // Verify it's actually vector content
      if (metrics.vectorElements === 0 && !metrics.hasEmbeddedRaster) {
        metrics.warnings.push('No vector elements found - SVG may be empty');
        metrics.isTrueVector = false;
      }

      // Detect colors
      const colorPatterns = [
        /fill\s*=\s*["'](?!none)([^"']+)["']/g,
        /stroke\s*=\s*["'](?!none)([^"']+)["']/g
      ];

      const colors = new Set();
      colorPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(svgContent)) !== null) {
          colors.add(match[1]);
        }
      });

      metrics.hasColors = colors.size > 0;
      metrics.colorCount = colors.size;

      // Determine complexity
      if (metrics.pathCount === 0) {
        metrics.complexity = 'empty';
        metrics.warnings.push('No paths found in SVG');
      } else if (metrics.pathCount < 10) {
        metrics.complexity = 'simple';
      } else if (metrics.pathCount < 100) {
        metrics.complexity = 'moderate';
      } else if (metrics.pathCount < 1000) {
        metrics.complexity = 'complex';
      } else {
        metrics.complexity = 'very complex';
      }

      // Calculate quality score (0-100)
      let score = 0;

      // CRITICAL: True vector (no embedded raster): 30 points
      if (metrics.isTrueVector && !metrics.hasEmbeddedRaster) {
        score += 30;
      } else {
        // Major penalty for embedded raster
        metrics.warnings.push('FAIL: Not a true vector file');
      }

      // Valid SVG structure: 15 points
      if (metrics.isValid) score += 15;

      // Has vector elements: 25 points
      if (metrics.vectorElements > 0) score += 25;

      // Resolution independent (has viewBox): 15 points
      if (metrics.hasViewBox) score += 15;

      // Reasonable file size: 5 points
      if (metrics.fileSize > 100 && metrics.fileSize < 1024 * 1024) {
        score += 5;
      }

      // Has appropriate complexity: 5 points
      if (metrics.vectorElements >= 3 && metrics.vectorElements <= 5000) {
        score += 5;
      }

      // Has colors: 5 points
      if (metrics.hasColors) score += 5;

      metrics.score = score;

      // Determine overall quality
      // If it has embedded raster, it can't be excellent regardless of score
      if (metrics.hasEmbeddedRaster) {
        metrics.quality = 'poor';
        metrics.warnings.push('Cannot be professional quality with embedded raster');
      } else if (score >= 90) {
        metrics.quality = 'excellent';
      } else if (score >= 70) {
        metrics.quality = 'good';
      } else if (score >= 50) {
        metrics.quality = 'fair';
      } else {
        metrics.quality = 'poor';
      }

      // Additional warnings
      if (metrics.fileSize > 1024 * 1024) {
        metrics.warnings.push('File size is very large (>1MB)');
      }

      if (metrics.pathCount > 5000) {
        metrics.warnings.push('Very high path count may indicate over-tracing');
      }

      if (!metrics.hasColors) {
        metrics.warnings.push('No colors detected (may be monochrome)');
      }

    } catch (error) {
      metrics.warnings.push(`Validation error: ${error.message}`);
    }

    return metrics;
  }

  /**
   * Compare with source image
   * @param {object} imageInfo - Source image information from sharp
   * @param {object} svgMetrics - SVG validation metrics
   * @returns {object} Comparison results
   */
  compareWithSource(imageInfo, svgMetrics) {
    const comparison = {
      sourceResolution: `${imageInfo.width}x${imageInfo.height}`,
      sourceFormat: imageInfo.format,
      vectorizable: true,
      recommendations: []
    };

    // Check if source is good for vectorization
    if (imageInfo.width < 100 || imageInfo.height < 100) {
      comparison.recommendations.push('Source image is very small - may lack detail');
    }

    if (imageInfo.width > 4000 || imageInfo.height > 4000) {
      comparison.recommendations.push('Source image is very large - processing may be slow');
    }

    // Compare complexity
    const pixelCount = imageInfo.width * imageInfo.height;
    const pathToPixelRatio = svgMetrics.pathCount / pixelCount;

    if (pathToPixelRatio > 0.01) {
      comparison.recommendations.push('High path-to-pixel ratio - output may be overly complex');
    }

    if (pathToPixelRatio < 0.00001) {
      comparison.recommendations.push('Very low path count - output may be oversimplified');
    }

    return comparison;
  }

  /**
   * Get method-specific recommendations
   * @param {string} method - 'ai' or 'potrace'
   * @param {object} metrics - SVG metrics
   * @returns {array} Recommendations
   */
  getMethodRecommendations(method, metrics) {
    const recommendations = [];

    if (method === 'potrace' || method === 'fallback') {
      if (metrics.colorCount > 1) {
        recommendations.push('⚠ Potrace may not preserve colors - consider using AI method');
      }
      if (metrics.complexity === 'complex' || metrics.complexity === 'very complex') {
        recommendations.push('⚠ Complex images work better with AI vectorization');
      }
      recommendations.push('ℹ Potrace is best for simple black & white graphics');
    }

    if (method === 'ai' || method === 'replicate') {
      if (metrics.quality === 'excellent') {
        recommendations.push('✓ Excellent quality - ready for production use');
      }
      if (metrics.fileSize > 500 * 1024) {
        recommendations.push('Consider optimizing SVG for web use');
      }
    }

    return recommendations;
  }
}

module.exports = new QualityValidator();
