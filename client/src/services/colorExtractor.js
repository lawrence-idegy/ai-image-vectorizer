/**
 * Advanced SVG Color Palette Extraction and Editing Service
 * Extracts colors from SVG paths, fills, and strokes
 * Enables intelligent color replacement and palette management
 */

export class ColorExtractor {
  /**
   * Extract all unique colors from an SVG string
   * @param {string} svgContent - The SVG content as a string
   * @returns {Array} Array of color objects with metadata
   */
  static extractColors(svgContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');
    const colors = new Map();

    // Helper to normalize color formats
    const normalizeColor = (color) => {
      if (!color || color === 'none' || color === 'transparent') return null;

      // Convert to hex for consistency
      const tempDiv = document.createElement('div');
      tempDiv.style.color = color;
      document.body.appendChild(tempDiv);
      const computed = window.getComputedStyle(tempDiv).color;
      document.body.removeChild(tempDiv);

      // Parse rgb/rgba
      const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (match) {
        const r = parseInt(match[1]).toString(16).padStart(2, '0');
        const g = parseInt(match[2]).toString(16).padStart(2, '0');
        const b = parseInt(match[3]).toString(16).padStart(2, '0');
        return `#${r}${g}${b}`;
      }

      return color;
    };

    // Extract colors from different SVG elements
    const extractFromElement = (element, type) => {
      const fill = element.getAttribute('fill');
      const stroke = element.getAttribute('stroke');
      const style = element.getAttribute('style');

      // Parse fill
      if (fill) {
        const normalized = normalizeColor(fill);
        if (normalized) {
          if (!colors.has(normalized)) {
            colors.set(normalized, {
              hex: normalized,
              count: 0,
              elements: [],
              types: new Set(),
            });
          }
          const colorData = colors.get(normalized);
          colorData.count++;
          colorData.elements.push(element);
          colorData.types.add('fill');
        }
      }

      // Parse stroke
      if (stroke) {
        const normalized = normalizeColor(stroke);
        if (normalized) {
          if (!colors.has(normalized)) {
            colors.set(normalized, {
              hex: normalized,
              count: 0,
              elements: [],
              types: new Set(),
            });
          }
          const colorData = colors.get(normalized);
          colorData.count++;
          colorData.elements.push(element);
          colorData.types.add('stroke');
        }
      }

      // Parse inline styles
      if (style) {
        const fillMatch = style.match(/fill:\s*([^;]+)/);
        const strokeMatch = style.match(/stroke:\s*([^;]+)/);

        if (fillMatch) {
          const normalized = normalizeColor(fillMatch[1].trim());
          if (normalized) {
            if (!colors.has(normalized)) {
              colors.set(normalized, {
                hex: normalized,
                count: 0,
                elements: [],
                types: new Set(),
              });
            }
            const colorData = colors.get(normalized);
            colorData.count++;
            colorData.elements.push(element);
            colorData.types.add('fill');
          }
        }

        if (strokeMatch) {
          const normalized = normalizeColor(strokeMatch[1].trim());
          if (normalized) {
            if (!colors.has(normalized)) {
              colors.set(normalized, {
                hex: normalized,
                count: 0,
                elements: [],
                types: new Set(),
              });
            }
            const colorData = colors.get(normalized);
            colorData.count++;
            colorData.elements.push(element);
            colorData.types.add('stroke');
          }
        }
      }
    };

    // Process all SVG elements
    const elements = doc.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, line, text');
    elements.forEach((el) => extractFromElement(el));

    // Convert to array and sort by frequency
    const colorArray = Array.from(colors.values())
      .map((color) => ({
        ...color,
        types: Array.from(color.types),
        percentage: 0, // Will be calculated below
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate percentages
    const totalCount = colorArray.reduce((sum, c) => sum + c.count, 0);
    colorArray.forEach((color) => {
      color.percentage = ((color.count / totalCount) * 100).toFixed(1);
    });

    return colorArray;
  }

  /**
   * Replace a color in the SVG content
   * @param {string} svgContent - Original SVG content
   * @param {string} oldColor - Color to replace (hex)
   * @param {string} newColor - New color (hex)
   * @returns {string} Updated SVG content
   */
  static replaceColor(svgContent, oldColor, newColor) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgContent, 'image/svg+xml');

    const normalizeColorForMatch = (color) => {
      if (!color) return null;
      return color.toLowerCase().replace(/\s/g, '');
    };

    const oldColorNorm = normalizeColorForMatch(oldColor);

    const replaceInElement = (element) => {
      // Replace in fill attribute
      const fill = element.getAttribute('fill');
      if (fill && normalizeColorForMatch(fill) === oldColorNorm) {
        element.setAttribute('fill', newColor);
      }

      // Replace in stroke attribute
      const stroke = element.getAttribute('stroke');
      if (stroke && normalizeColorForMatch(stroke) === oldColorNorm) {
        element.setAttribute('stroke', newColor);
      }

      // Replace in style attribute
      const style = element.getAttribute('style');
      if (style) {
        const updatedStyle = style
          .replace(
            new RegExp(`fill:\\s*${oldColor}`, 'gi'),
            `fill: ${newColor}`
          )
          .replace(
            new RegExp(`stroke:\\s*${oldColor}`, 'gi'),
            `stroke: ${newColor}`
          );
        element.setAttribute('style', updatedStyle);
      }
    };

    // Process all elements
    const elements = doc.querySelectorAll('*');
    elements.forEach(replaceInElement);

    // Serialize back to string
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  }

  /**
   * Replace multiple colors at once
   * @param {string} svgContent - Original SVG content
   * @param {Object} colorMap - Object mapping old colors to new colors
   * @returns {string} Updated SVG content
   */
  static replaceMultipleColors(svgContent, colorMap) {
    let updatedSvg = svgContent;

    Object.entries(colorMap).forEach(([oldColor, newColor]) => {
      updatedSvg = this.replaceColor(updatedSvg, oldColor, newColor);
    });

    return updatedSvg;
  }

  /**
   * Generate a color palette suggestion based on extracted colors
   * @param {Array} colors - Array of extracted colors
   * @param {string} theme - 'complementary', 'analogous', 'monochromatic', 'triadic'
   * @returns {Array} Suggested color palette
   */
  static generatePaletteSuggestions(colors, theme = 'complementary') {
    if (colors.length === 0) return [];

    const primaryColor = colors[0].hex;

    // Simple color theory suggestions
    // In a real app, you might want to use a library like chroma.js
    const hexToHSL = (hex) => {
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;

      if (max === min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }

      return { h: h * 360, s: s * 100, l: l * 100 };
    };

    const hslToHex = (h, s, l) => {
      s /= 100;
      l /= 100;

      const c = (1 - Math.abs(2 * l - 1)) * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = l - c / 2;

      let r, g, b;

      if (h < 60) { r = c; g = x; b = 0; }
      else if (h < 120) { r = x; g = c; b = 0; }
      else if (h < 180) { r = 0; g = c; b = x; }
      else if (h < 240) { r = 0; g = x; b = c; }
      else if (h < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }

      const toHex = (val) => {
        const hex = Math.round((val + m) * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      };

      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    };

    const { h, s, l } = hexToHSL(primaryColor);
    const suggestions = [primaryColor];

    switch (theme) {
      case 'complementary':
        suggestions.push(hslToHex((h + 180) % 360, s, l));
        break;
      case 'analogous':
        suggestions.push(hslToHex((h + 30) % 360, s, l));
        suggestions.push(hslToHex((h - 30 + 360) % 360, s, l));
        break;
      case 'triadic':
        suggestions.push(hslToHex((h + 120) % 360, s, l));
        suggestions.push(hslToHex((h + 240) % 360, s, l));
        break;
      case 'monochromatic':
        suggestions.push(hslToHex(h, s, Math.max(0, l - 20)));
        suggestions.push(hslToHex(h, s, Math.min(100, l + 20)));
        break;
    }

    return suggestions;
  }
}

export default ColorExtractor;
