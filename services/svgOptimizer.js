const { optimize } = require('svgo');

class SVGOptimizer {
  constructor() {
    // Default SVGO configuration for vector graphics
    this.defaultConfig = {
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              // Keep viewBox for proper scaling
              removeViewBox: false,
              // Keep important attributes
              removeUnknownsAndDefaults: {
                keepDataAttrs: true,
                keepAriaAttrs: true,
              },
              // Don't remove hidden elements (they might be used for animations)
              removeHiddenElems: false,
              // Clean up IDs but don't remove them entirely
              cleanupIds: {
                remove: false,
                minify: true,
              },
            },
          },
        },
        // Additional optimizations
        'removeDoctype',
        'removeXMLProcInst',
        'removeComments',
        'removeMetadata',
        'removeEditorsNSData',
        'cleanupEnableBackground',
        'removeEmptyContainers',
        'removeEmptyText',
        'removeEmptyAttrs',
        'convertStyleToAttrs',
        'convertColors',
        'convertPathData',
        'convertTransform',
        'removeUnusedNS',
        'sortAttrs',
        'mergePaths',
        {
          name: 'removeAttrs',
          params: {
            attrs: ['data-name'],
          },
        },
      ],
    };

    // Aggressive optimization config
    this.aggressiveConfig = {
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeViewBox: false,
            },
          },
        },
        'removeDoctype',
        'removeXMLProcInst',
        'removeComments',
        'removeMetadata',
        'removeTitle',
        'removeDesc',
        'removeEditorsNSData',
        'cleanupEnableBackground',
        'removeEmptyContainers',
        'removeEmptyText',
        'removeEmptyAttrs',
        'convertStyleToAttrs',
        'convertColors',
        'convertPathData',
        'convertTransform',
        'removeUnusedNS',
        'cleanupIds',
        'sortAttrs',
        'mergePaths',
        'removeUselessDefs',
        'removeUselessStrokeAndFill',
        'collapseGroups',
        'removeRasterImages',
      ],
    };

    // Minimal optimization (for when preserving structure is important)
    this.minimalConfig = {
      multipass: false,
      plugins: [
        'removeDoctype',
        'removeXMLProcInst',
        'removeComments',
        'removeMetadata',
        'removeEmptyContainers',
        'removeEmptyText',
        'removeEmptyAttrs',
        'sortAttrs',
      ],
    };
  }

  /**
   * Optimize SVG content
   * @param {string} svgContent - Raw SVG content
   * @param {object} options - Optimization options
   * @returns {object} - Optimized SVG and statistics
   */
  optimize(svgContent, options = {}) {
    const { level = 'default', preserveColors = true, preserveIds = false } = options;

    let config;
    switch (level) {
      case 'aggressive':
        config = { ...this.aggressiveConfig };
        break;
      case 'minimal':
        config = { ...this.minimalConfig };
        break;
      case 'default':
      default:
        config = { ...this.defaultConfig };
    }

    // Customize based on options
    if (preserveColors) {
      config.plugins = config.plugins.filter(p =>
        (typeof p === 'string' && p !== 'convertColors') ||
        (typeof p === 'object' && p.name !== 'convertColors')
      );
    }

    if (preserveIds) {
      config.plugins = config.plugins.filter(p =>
        (typeof p === 'string' && p !== 'cleanupIds') ||
        (typeof p === 'object' && p.name !== 'cleanupIds')
      );
    }

    const originalSize = Buffer.byteLength(svgContent, 'utf8');

    try {
      const result = optimize(svgContent, config);

      const optimizedSize = Buffer.byteLength(result.data, 'utf8');
      const savings = originalSize - optimizedSize;
      const savingsPercent = ((savings / originalSize) * 100).toFixed(2);

      return {
        success: true,
        data: result.data,
        stats: {
          originalSize,
          optimizedSize,
          savings,
          savingsPercent: `${savingsPercent}%`,
          originalSizeKB: (originalSize / 1024).toFixed(2),
          optimizedSizeKB: (optimizedSize / 1024).toFixed(2),
        },
      };
    } catch (error) {
      return {
        success: false,
        data: svgContent, // Return original on error
        error: error.message,
        stats: {
          originalSize,
          optimizedSize: originalSize,
          savings: 0,
          savingsPercent: '0%',
        },
      };
    }
  }

  /**
   * Batch optimize multiple SVGs
   * @param {string[]} svgContents - Array of SVG contents
   * @param {object} options - Optimization options
   * @returns {object[]} - Array of optimization results
   */
  optimizeBatch(svgContents, options = {}) {
    return svgContents.map((svg, index) => {
      const result = this.optimize(svg, options);
      return {
        ...result,
        index,
      };
    });
  }

  /**
   * Clean SVG for web use (removes scripts, external references)
   * @param {string} svgContent - Raw SVG content
   * @returns {object} - Cleaned SVG
   */
  sanitize(svgContent) {
    const sanitizeConfig = {
      multipass: true,
      plugins: [
        'removeDoctype',
        'removeXMLProcInst',
        'removeComments',
        'removeMetadata',
        'removeScriptElement',
        {
          name: 'removeAttrs',
          params: {
            attrs: [
              'onclick',
              'onload',
              'onerror',
              'onmouseover',
              'onmouseout',
              'onfocus',
              'onblur',
            ],
          },
        },
        {
          name: 'removeElementsByAttr',
          params: {
            id: '*script*',
          },
        },
      ],
    };

    try {
      const result = optimize(svgContent, sanitizeConfig);
      return {
        success: true,
        data: result.data,
        sanitized: true,
      };
    } catch (error) {
      return {
        success: false,
        data: svgContent,
        error: error.message,
        sanitized: false,
      };
    }
  }

  /**
   * Get information about an SVG
   * @param {string} svgContent - SVG content
   * @returns {object} - SVG information
   */
  analyze(svgContent) {
    const info = {
      size: Buffer.byteLength(svgContent, 'utf8'),
      sizeKB: (Buffer.byteLength(svgContent, 'utf8') / 1024).toFixed(2),
      hasViewBox: /<svg[^>]*viewBox/i.test(svgContent),
      hasWidth: /<svg[^>]*width/i.test(svgContent),
      hasHeight: /<svg[^>]*height/i.test(svgContent),
      pathCount: (svgContent.match(/<path/gi) || []).length,
      groupCount: (svgContent.match(/<g[>\s]/gi) || []).length,
      hasGradients: /<(linearGradient|radialGradient)/i.test(svgContent),
      hasFilters: /<filter/i.test(svgContent),
      hasClipPaths: /<clipPath/i.test(svgContent),
      hasMasks: /<mask/i.test(svgContent),
      hasText: /<text/i.test(svgContent),
      hasImages: /<image/i.test(svgContent),
      hasScripts: /<script/i.test(svgContent),
      hasStyles: /<style/i.test(svgContent),
      estimatedComplexity: 'low',
    };

    // Estimate complexity
    const complexityScore =
      info.pathCount * 1 +
      info.groupCount * 0.5 +
      (info.hasGradients ? 10 : 0) +
      (info.hasFilters ? 15 : 0) +
      (info.hasClipPaths ? 5 : 0) +
      (info.hasMasks ? 10 : 0);

    if (complexityScore > 100) {
      info.estimatedComplexity = 'high';
    } else if (complexityScore > 30) {
      info.estimatedComplexity = 'medium';
    }

    return info;
  }
}

// Export singleton
module.exports = new SVGOptimizer();
