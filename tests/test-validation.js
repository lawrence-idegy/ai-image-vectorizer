/**
 * Test Validation Suite for idegy AI Image Vectorizer
 *
 * This suite validates:
 * 1. Potrace (fallback) functionality
 * 2. AI vectorization quality
 * 3. Edge cases and accuracy
 */

const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

class VectorizerTester {
  constructor() {
    this.testResults = [];
  }

  /**
   * Validate SVG output quality
   * @param {string} svgContent - SVG content to validate
   * @returns {object} Validation metrics
   */
  validateSVG(svgContent) {
    const metrics = {
      isValid: false,
      hasContent: false,
      hasPaths: false,
      pathCount: 0,
      hasViewBox: false,
      fileSize: 0,
      complexity: 'unknown',
      errors: []
    };

    try {
      // Check if it's a valid SVG
      if (!svgContent || typeof svgContent !== 'string') {
        metrics.errors.push('SVG content is empty or invalid type');
        return metrics;
      }

      // Check if it starts with SVG tag or has SVG content
      const isSVG = svgContent.trim().startsWith('<svg') ||
                    svgContent.includes('<svg');

      if (!isSVG) {
        metrics.errors.push('Content does not appear to be valid SVG');
        return metrics;
      }

      metrics.isValid = true;
      metrics.hasContent = svgContent.length > 100;
      metrics.fileSize = Buffer.byteLength(svgContent, 'utf8');

      // Check for paths
      const pathMatches = svgContent.match(/<path/g);
      metrics.hasPaths = pathMatches && pathMatches.length > 0;
      metrics.pathCount = pathMatches ? pathMatches.length : 0;

      // Check for viewBox
      metrics.hasViewBox = svgContent.includes('viewBox');

      // Determine complexity based on path count
      if (metrics.pathCount === 0) {
        metrics.complexity = 'empty';
      } else if (metrics.pathCount < 10) {
        metrics.complexity = 'simple';
      } else if (metrics.pathCount < 100) {
        metrics.complexity = 'moderate';
      } else if (metrics.pathCount < 1000) {
        metrics.complexity = 'complex';
      } else {
        metrics.complexity = 'very complex';
      }

      // Check for common issues
      if (metrics.fileSize < 50) {
        metrics.errors.push('SVG file size is suspiciously small');
      }

      if (!metrics.hasPaths) {
        metrics.errors.push('SVG has no path elements');
      }

    } catch (error) {
      metrics.errors.push(`Validation error: ${error.message}`);
    }

    return metrics;
  }

  /**
   * Compare original image with vectorized output
   * @param {string} originalPath - Path to original image
   * @param {string} svgContent - SVG content
   * @returns {object} Comparison metrics
   */
  async compareQuality(originalPath, svgContent) {
    const comparison = {
      originalSize: 0,
      vectorSize: 0,
      compressionRatio: 0,
      imageInfo: null
    };

    try {
      // Get original image info
      const imageBuffer = await fs.readFile(originalPath);
      comparison.originalSize = imageBuffer.length;

      const imageInfo = await sharp(imageBuffer).metadata();
      comparison.imageInfo = {
        width: imageInfo.width,
        height: imageInfo.height,
        format: imageInfo.format,
        hasAlpha: imageInfo.hasAlpha
      };

      // Get SVG size
      comparison.vectorSize = Buffer.byteLength(svgContent, 'utf8');
      comparison.compressionRatio = (comparison.originalSize / comparison.vectorSize).toFixed(2);

    } catch (error) {
      comparison.error = error.message;
    }

    return comparison;
  }

  /**
   * Test edge cases
   * @param {string} testCase - Type of edge case
   * @returns {object} Test requirements
   */
  getEdgeCaseRequirements(testCase) {
    const requirements = {
      'simple-logo': {
        minPaths: 3,
        maxPaths: 50,
        minFileSize: 500,
        description: 'Simple logo should have moderate path count'
      },
      'complex-illustration': {
        minPaths: 50,
        maxPaths: 5000,
        minFileSize: 5000,
        description: 'Complex illustration should have many paths'
      },
      'line-art': {
        minPaths: 5,
        maxPaths: 200,
        minFileSize: 1000,
        description: 'Line art should have clean, simple paths'
      },
      'photograph': {
        minPaths: 100,
        maxPaths: 10000,
        minFileSize: 10000,
        description: 'Photographs should be highly detailed'
      },
      'icon': {
        minPaths: 1,
        maxPaths: 30,
        minFileSize: 300,
        description: 'Icons should be simple and minimal'
      },
      'high-contrast': {
        minPaths: 5,
        maxPaths: 500,
        minFileSize: 1000,
        description: 'High contrast images should vectorize cleanly'
      },
      'low-contrast': {
        minPaths: 10,
        maxPaths: 1000,
        minFileSize: 2000,
        description: 'Low contrast may need more detail'
      },
      'transparent-bg': {
        minPaths: 3,
        maxPaths: 500,
        minFileSize: 500,
        description: 'Transparent backgrounds should be preserved'
      }
    };

    return requirements[testCase] || {
      minPaths: 1,
      maxPaths: 10000,
      minFileSize: 100,
      description: 'General test case'
    };
  }

  /**
   * Run comprehensive test on SVG output
   * @param {string} svgContent - SVG content
   * @param {string} testName - Name of test
   * @param {string} method - 'ai' or 'potrace'
   * @param {string} edgeCase - Type of edge case
   * @returns {object} Test results
   */
  async runTest(svgContent, testName, method, edgeCase = 'general') {
    const result = {
      testName,
      method,
      edgeCase,
      timestamp: new Date().toISOString(),
      passed: false,
      metrics: null,
      requirements: null,
      issues: []
    };

    // Validate SVG
    result.metrics = this.validateSVG(svgContent);

    // Get requirements for this edge case
    result.requirements = this.getEdgeCaseRequirements(edgeCase);

    // Check if requirements are met
    const { metrics, requirements } = result;

    if (!metrics.isValid) {
      result.issues.push('SVG is not valid');
    }

    if (metrics.pathCount < requirements.minPaths) {
      result.issues.push(`Path count ${metrics.pathCount} is below minimum ${requirements.minPaths}`);
    }

    if (metrics.pathCount > requirements.maxPaths) {
      result.issues.push(`Path count ${metrics.pathCount} exceeds maximum ${requirements.maxPaths}`);
    }

    if (metrics.fileSize < requirements.minFileSize) {
      result.issues.push(`File size ${metrics.fileSize} is below minimum ${requirements.minFileSize}`);
    }

    if (metrics.errors.length > 0) {
      result.issues.push(...metrics.errors);
    }

    // Test passes if it's valid and has no critical issues
    result.passed = metrics.isValid &&
                    metrics.hasPaths &&
                    result.issues.length === 0;

    this.testResults.push(result);
    return result;
  }

  /**
   * Generate test report
   * @returns {object} Summary report
   */
  generateReport() {
    const total = this.testResults.length;
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = total - passed;

    const report = {
      summary: {
        total,
        passed,
        failed,
        passRate: total > 0 ? ((passed / total) * 100).toFixed(2) + '%' : 'N/A'
      },
      byMethod: {
        ai: {
          total: 0,
          passed: 0,
          failed: 0
        },
        potrace: {
          total: 0,
          passed: 0,
          failed: 0
        }
      },
      tests: this.testResults,
      recommendations: []
    };

    // Analyze by method
    this.testResults.forEach(test => {
      report.byMethod[test.method].total++;
      if (test.passed) {
        report.byMethod[test.method].passed++;
      } else {
        report.byMethod[test.method].failed++;
      }
    });

    // Add recommendations
    if (report.byMethod.ai.failed > report.byMethod.ai.passed) {
      report.recommendations.push('AI vectorization has high failure rate - check API configuration');
    }

    if (report.byMethod.potrace.failed > report.byMethod.potrace.passed) {
      report.recommendations.push('Potrace fallback needs tuning - consider adjusting threshold parameters');
    }

    return report;
  }
}

module.exports = VectorizerTester;
