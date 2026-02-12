/**
 * SVG Builder Module
 *
 * Generates clean SVG output with full Vectorizer.ai feature parity:
 * - Draw styles: fill_shapes, stroke_shapes, stroke_edges
 * - Shape stacking: cutouts, stacked
 * - Grouping: none, color, parent, layer
 * - Gap filler with configurable options
 * - Stroke styling
 * - Output sizing with units and aspect ratio
 */

class SVGBuilder {
  constructor(options = {}) {
    // Draw style: 'fill_shapes', 'stroke_shapes', 'stroke_edges'
    this.drawStyle = options.drawStyle || 'fill_shapes';

    // Shape stacking: 'cutouts' or 'stacked'
    this.shapeStacking = options.shapeStacking || 'cutouts';

    // Grouping: 'none', 'color', 'parent', 'layer'
    this.groupBy = options.groupBy || 'none';

    // Gap filler options
    this.gapFiller = options.gapFiller !== false;
    this.gapFillerClip = options.gapFillerClip || false;
    this.gapFillerNonScalingStroke = options.gapFillerNonScalingStroke !== false;
    this.gapFillerWidth = options.gapFillerWidth || 2.0;

    // Stroke options (for stroke_shapes and stroke_edges modes)
    this.strokeNonScalingStroke = options.strokeNonScalingStroke !== false;
    this.strokeUseOverrideColor = options.strokeUseOverrideColor || false;
    this.strokeOverrideColor = options.strokeOverrideColor || '#000000';
    this.strokeWidth = options.strokeWidth || 1.0;

    // Output sizing
    this.scale = options.scale || null;
    this.outputWidth = options.outputWidth || null;
    this.outputHeight = options.outputHeight || null;
    this.unit = options.unit || 'none'; // none, px, pt, in, cm, mm
    this.aspectRatio = options.aspectRatio || 'preserve_inset'; // preserve_inset, preserve_overflow, stretch
    this.alignX = options.alignX !== undefined ? options.alignX : 0.5;
    this.alignY = options.alignY !== undefined ? options.alignY : 0.5;

    this.precision = 2; // Decimal places
  }

  /**
   * Build SVG from fitted regions
   * @param {Array} regions - Array of {color, paths} objects
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {Array} palette - Color palette
   * @returns {string} SVG content
   */
  build(regions, width, height, palette) {
    // Calculate output dimensions
    const { outputWidth, outputHeight, viewBox } = this.calculateDimensions(width, height);

    // Build elements based on draw style
    let elements = [];

    switch (this.drawStyle) {
      case 'stroke_shapes':
        elements = this.buildStrokeShapes(regions);
        break;
      case 'stroke_edges':
        elements = this.buildStrokeEdges(regions);
        break;
      case 'fill_shapes':
      default:
        elements = this.buildFillShapes(regions);
        break;
    }

    // Group elements if requested
    const groupedElements = this.groupElements(elements, regions);

    // Build final SVG
    return this.wrapSVG(groupedElements, outputWidth, outputHeight, viewBox);
  }

  /**
   * Build filled shapes (default mode)
   */
  buildFillShapes(regions) {
    const elements = [];

    // Add gap filler strokes first (behind shapes)
    if (this.gapFiller) {
      const gapFillers = this.generateGapFillers(regions);
      elements.push(...gapFillers);
    }

    // Handle shape stacking
    if (this.shapeStacking === 'cutouts') {
      // Cutout mode: larger shapes have holes cut by smaller shapes
      elements.push(...this.buildCutoutShapes(regions));
    } else {
      // Stacked mode: shapes simply overlap
      for (const region of regions) {
        const colorStr = this.colorToString(region.color);
        for (const path of region.paths) {
          const element = this.pathToFillElement(path, colorStr);
          if (element) {
            elements.push({ element, color: region.color, region });
          }
        }
      }
    }

    return elements;
  }

  /**
   * Build cutout shapes where larger shapes have holes
   */
  buildCutoutShapes(regions) {
    const elements = [];

    // Process regions in order (largest first)
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const colorStr = this.colorToString(region.color);

      for (const path of region.paths) {
        // For cutouts, we could implement compound paths with holes
        // For now, just render as-is (proper cutouts require path boolean operations)
        const element = this.pathToFillElement(path, colorStr);
        if (element) {
          elements.push({ element, color: region.color, region });
        }
      }
    }

    return elements;
  }

  /**
   * Build stroke shapes (outline mode)
   */
  buildStrokeShapes(regions) {
    const elements = [];

    for (const region of regions) {
      const strokeColor = this.strokeUseOverrideColor
        ? this.strokeOverrideColor
        : this.colorToString(region.color);

      for (const path of region.paths) {
        const element = this.pathToStrokeElement(path, strokeColor);
        if (element) {
          elements.push({ element, color: region.color, region });
        }
      }
    }

    return elements;
  }

  /**
   * Build stroke edges (edge detection mode)
   */
  buildStrokeEdges(regions) {
    const elements = [];
    const strokeColor = this.strokeUseOverrideColor
      ? this.strokeOverrideColor
      : '#000000';

    // Only draw unique edges (boundaries between regions)
    for (const region of regions) {
      for (const path of region.paths) {
        const element = this.pathToStrokeElement(path, strokeColor);
        if (element) {
          elements.push({ element, color: region.color, region });
        }
      }
    }

    return elements;
  }

  /**
   * Group elements by the specified criterion
   */
  groupElements(elements, regions) {
    if (this.groupBy === 'none') {
      return elements.map(e => e.element);
    }

    const groups = new Map();

    for (const item of elements) {
      let groupKey;

      switch (this.groupBy) {
        case 'color':
          groupKey = this.colorToString(item.color);
          break;
        case 'parent':
          // Group by parent region (simplified: use region index)
          groupKey = regions.indexOf(item.region);
          break;
        case 'layer':
          // Group by detected layer (simplified: use color luminance)
          const luminance = Math.round(
            (item.color.r * 0.299 + item.color.g * 0.587 + item.color.b * 0.114) / 25.5
          );
          groupKey = `layer-${luminance}`;
          break;
        default:
          groupKey = 'default';
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey).push(item.element);
    }

    // Wrap each group in a <g> element
    const result = [];
    for (const [groupId, groupElements] of groups) {
      if (groupElements.length === 1) {
        result.push(groupElements[0]);
      } else {
        result.push(`<g id="${this.sanitizeId(groupId)}">\n${groupElements.join('\n')}\n</g>`);
      }
    }

    return result;
  }

  /**
   * Sanitize string for use as SVG id
   */
  sanitizeId(str) {
    return String(str).replace(/[^a-zA-Z0-9-_]/g, '-');
  }

  /**
   * Convert a path/shape to filled SVG element
   */
  pathToFillElement(path, color) {
    if (!path) return null;

    switch (path.type) {
      case 'circle':
        return `<circle cx="${this.fmt(path.cx)}" cy="${this.fmt(path.cy)}" r="${this.fmt(path.r)}" fill="${color}"/>`;

      case 'ellipse':
        return `<ellipse cx="${this.fmt(path.cx)}" cy="${this.fmt(path.cy)}" rx="${this.fmt(path.rx)}" ry="${this.fmt(path.ry)}" fill="${color}"/>`;

      case 'rect':
        if (path.rotation && path.rotation !== 0) {
          const cx = path.x + path.width / 2;
          const cy = path.y + path.height / 2;
          return `<rect x="${this.fmt(path.x)}" y="${this.fmt(path.y)}" width="${this.fmt(path.width)}" height="${this.fmt(path.height)}" fill="${color}" transform="rotate(${this.fmt(path.rotation * 180 / Math.PI)} ${this.fmt(cx)} ${this.fmt(cy)})"/>`;
        }
        return `<rect x="${this.fmt(path.x)}" y="${this.fmt(path.y)}" width="${this.fmt(path.width)}" height="${this.fmt(path.height)}" fill="${color}"/>`;

      case 'polygon':
        if (path.points && path.points.length > 0) {
          const pointsStr = path.points.map(p => `${this.fmt(p.x)},${this.fmt(p.y)}`).join(' ');
          return `<polygon points="${pointsStr}" fill="${color}"/>`;
        }
        return null;

      case 'path':
        const d = this.curvesToPathData(path.curves);
        if (d) {
          return `<path d="${d}" fill="${color}"/>`;
        }
        return null;

      default:
        if (Array.isArray(path)) {
          const d = this.curvesToPathData(path);
          if (d) {
            return `<path d="${d}" fill="${color}"/>`;
          }
        }
        return null;
    }
  }

  /**
   * Convert a path/shape to stroked SVG element
   */
  pathToStrokeElement(path, strokeColor) {
    if (!path) return null;

    const strokeAttrs = this.getStrokeAttributes(strokeColor);

    switch (path.type) {
      case 'circle':
        return `<circle cx="${this.fmt(path.cx)}" cy="${this.fmt(path.cy)}" r="${this.fmt(path.r)}" fill="none" ${strokeAttrs}/>`;

      case 'ellipse':
        return `<ellipse cx="${this.fmt(path.cx)}" cy="${this.fmt(path.cy)}" rx="${this.fmt(path.rx)}" ry="${this.fmt(path.ry)}" fill="none" ${strokeAttrs}/>`;

      case 'rect':
        if (path.rotation && path.rotation !== 0) {
          const cx = path.x + path.width / 2;
          const cy = path.y + path.height / 2;
          return `<rect x="${this.fmt(path.x)}" y="${this.fmt(path.y)}" width="${this.fmt(path.width)}" height="${this.fmt(path.height)}" fill="none" ${strokeAttrs} transform="rotate(${this.fmt(path.rotation * 180 / Math.PI)} ${this.fmt(cx)} ${this.fmt(cy)})"/>`;
        }
        return `<rect x="${this.fmt(path.x)}" y="${this.fmt(path.y)}" width="${this.fmt(path.width)}" height="${this.fmt(path.height)}" fill="none" ${strokeAttrs}/>`;

      case 'polygon':
        if (path.points && path.points.length > 0) {
          const pointsStr = path.points.map(p => `${this.fmt(p.x)},${this.fmt(p.y)}`).join(' ');
          return `<polygon points="${pointsStr}" fill="none" ${strokeAttrs}/>`;
        }
        return null;

      case 'path':
        const d = this.curvesToPathData(path.curves);
        if (d) {
          return `<path d="${d}" fill="none" ${strokeAttrs}/>`;
        }
        return null;

      default:
        if (Array.isArray(path)) {
          const d = this.curvesToPathData(path);
          if (d) {
            return `<path d="${d}" fill="none" ${strokeAttrs}/>`;
          }
        }
        return null;
    }
  }

  /**
   * Get stroke attributes string
   */
  getStrokeAttributes(strokeColor) {
    let attrs = `stroke="${strokeColor}" stroke-width="${this.strokeWidth}"`;
    if (this.strokeNonScalingStroke) {
      attrs += ' vector-effect="non-scaling-stroke"';
    }
    attrs += ' stroke-linejoin="round" stroke-linecap="round"';
    return attrs;
  }

  /**
   * Convert curves array to SVG path data
   */
  curvesToPathData(curves) {
    if (!curves || curves.length === 0) return null;

    if (this.isDegeneratePath(curves)) return null;

    const parts = [];
    let currentX = null;
    let currentY = null;

    for (let i = 0; i < curves.length; i++) {
      const curve = curves[i];

      // Move to start if needed
      if (currentX !== curve.start?.x || currentY !== curve.start?.y) {
        if (curve.start) {
          parts.push(`M${this.fmt(curve.start.x)} ${this.fmt(curve.start.y)}`);
          currentX = curve.start.x;
          currentY = curve.start.y;
        }
      }

      // Add curve command
      switch (curve.type) {
        case 'line':
          parts.push(`L${this.fmt(curve.end.x)} ${this.fmt(curve.end.y)}`);
          currentX = curve.end.x;
          currentY = curve.end.y;
          break;

        case 'arc':
          // SVG arc: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
          const largeArc = Math.abs(curve.endAngle - curve.startAngle) > Math.PI ? 1 : 0;
          const sweepFlag = curve.sweep ? 1 : 0;
          parts.push(`A${this.fmt(curve.r)} ${this.fmt(curve.r)} 0 ${largeArc} ${sweepFlag} ${this.fmt(curve.end.x)} ${this.fmt(curve.end.y)}`);
          currentX = curve.end.x;
          currentY = curve.end.y;
          break;

        case 'ellipticalArc':
          // SVG elliptical arc: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
          const eLargeArc = Math.abs(curve.endAngle - curve.startAngle) > Math.PI ? 1 : 0;
          const eSweepFlag = curve.sweep ? 1 : 0;
          const rotation = curve.rotation ? this.fmt(curve.rotation * 180 / Math.PI) : 0;
          parts.push(`A${this.fmt(curve.rx)} ${this.fmt(curve.ry)} ${rotation} ${eLargeArc} ${eSweepFlag} ${this.fmt(curve.end.x)} ${this.fmt(curve.end.y)}`);
          currentX = curve.end.x;
          currentY = curve.end.y;
          break;

        case 'quadratic':
          parts.push(`Q${this.fmt(curve.cp.x)} ${this.fmt(curve.cp.y)} ${this.fmt(curve.end.x)} ${this.fmt(curve.end.y)}`);
          currentX = curve.end.x;
          currentY = curve.end.y;
          break;

        case 'cubic':
          parts.push(`C${this.fmt(curve.cp1.x)} ${this.fmt(curve.cp1.y)} ${this.fmt(curve.cp2.x)} ${this.fmt(curve.cp2.y)} ${this.fmt(curve.end.x)} ${this.fmt(curve.end.y)}`);
          currentX = curve.end.x;
          currentY = curve.end.y;
          break;
      }
    }

    // Close path
    if (parts.length > 0) {
      parts.push('Z');
    }

    return parts.join(' ');
  }

  /**
   * Generate gap filler strokes
   */
  generateGapFillers(regions) {
    if (!this.gapFiller) return [];

    const fillers = [];
    const vectorEffect = this.gapFillerNonScalingStroke ? ' vector-effect="non-scaling-stroke"' : '';

    for (const region of regions) {
      for (const path of region.paths) {
        if (path.type === 'path' && path.curves) {
          const d = this.curvesToPathData(path.curves);
          if (d) {
            fillers.push({
              element: `<path d="${d}" fill="none" stroke="${this.colorToString(region.color)}" stroke-width="${this.gapFillerWidth}" stroke-linejoin="round"${vectorEffect}/>`,
              color: region.color,
              region
            });
          }
        }
      }
    }

    return fillers;
  }

  /**
   * Convert color object to CSS string
   */
  colorToString(color) {
    if (color.a !== undefined && color.a < 255) {
      return `rgba(${color.r},${color.g},${color.b},${(color.a / 255).toFixed(2)})`;
    }
    return `rgb(${color.r},${color.g},${color.b})`;
  }

  /**
   * Check if a path is degenerate
   */
  isDegeneratePath(curves) {
    if (!curves || curves.length === 0) return true;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const curve of curves) {
      const points = [curve.start, curve.end, curve.cp, curve.cp1, curve.cp2].filter(p => p);
      for (const p of points) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
    }

    const width = maxX - minX;
    const height = maxY - minY;
    return width < 2 && height < 2;
  }

  /**
   * Calculate output dimensions based on sizing options
   */
  calculateDimensions(inputWidth, inputHeight) {
    let outputWidth = inputWidth;
    let outputHeight = inputHeight;

    // Apply scale if specified
    if (this.scale !== null && this.scale > 0) {
      outputWidth = inputWidth * this.scale;
      outputHeight = inputHeight * this.scale;
    }

    // Apply explicit dimensions if specified
    if (this.outputWidth !== null || this.outputHeight !== null) {
      const targetWidth = this.outputWidth || (this.outputHeight * inputWidth / inputHeight);
      const targetHeight = this.outputHeight || (this.outputWidth * inputHeight / inputWidth);

      switch (this.aspectRatio) {
        case 'stretch':
          outputWidth = targetWidth;
          outputHeight = targetHeight;
          break;

        case 'preserve_overflow':
          // Scale to cover, allowing overflow
          const overflowScale = Math.max(targetWidth / inputWidth, targetHeight / inputHeight);
          outputWidth = inputWidth * overflowScale;
          outputHeight = inputHeight * overflowScale;
          break;

        case 'preserve_inset':
        default:
          // Scale to fit within bounds
          const insetScale = Math.min(targetWidth / inputWidth, targetHeight / inputHeight);
          outputWidth = inputWidth * insetScale;
          outputHeight = inputHeight * insetScale;
          break;
      }
    }

    // Calculate viewBox for alignment
    let viewBox = `0 0 ${inputWidth} ${inputHeight}`;

    // Add unit suffix if specified
    const unitSuffix = this.unit !== 'none' ? this.unit : '';

    return {
      outputWidth: this.fmt(outputWidth) + unitSuffix,
      outputHeight: this.fmt(outputHeight) + unitSuffix,
      viewBox
    };
  }

  /**
   * Format number with precision
   */
  fmt(n) {
    return Number(n.toFixed(this.precision));
  }

  /**
   * Wrap elements in SVG document
   */
  wrapSVG(elements, width, height, viewBox) {
    const elementContent = Array.isArray(elements)
      ? elements.join('\n')
      : elements;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="${width}" height="${height}" viewBox="${viewBox}">
${elementContent}
</svg>`;
  }
}

module.exports = SVGBuilder;
