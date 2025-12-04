/**
 * Color Utilities
 * Shared functions for color manipulation and comparison
 */

/**
 * Normalize color to lowercase hex format for comparison
 */
export const normalizeColor = (color) => {
  if (!color) return null;
  const c = String(color).toLowerCase().trim();

  // Handle common named colors
  if (c === 'white' || c === '#fff') return '#ffffff';
  if (c === 'black' || c === '#000') return '#000000';
  if (c === 'transparent') return 'transparent';

  // Handle rgb format
  if (c.startsWith('rgb')) {
    const match = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
  }

  // Handle shorthand hex
  if (c.startsWith('#') && c.length === 4) {
    return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  }

  return c;
};

/**
 * Check if a color is white or near-white
 */
export const isWhiteColor = (color) => {
  if (!color || typeof color !== 'string') return false;
  const c = color.toLowerCase().trim();

  // Direct matches
  const whiteColors = [
    '#ffffff', '#fff', 'white',
    '#fefefe', '#fdfdfd', '#fcfcfc',
    '#fbfbfb', '#fafafa', '#f9f9f9', '#f8f8f8'
  ];
  if (whiteColors.includes(c)) return true;

  // RGB format
  const rgbMatch = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    if (r > 245 && g > 245 && b > 245) return true;
  }

  // Hex format - check if near white
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    let hex = c;
    if (c.length === 4) {
      hex = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (r > 245 && g > 245 && b > 245) return true;
  }

  return false;
};

/**
 * Check if a color is black or near-black
 */
export const isBlackColor = (color) => {
  if (!color || typeof color !== 'string') return false;
  const c = color.toLowerCase().trim();

  // Direct matches
  const blackColors = ['#000000', '#000', 'black'];
  if (blackColors.includes(c)) return true;

  // RGB format
  const rgbMatch = c.match(/rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    if (r < 10 && g < 10 && b < 10) return true;
  }

  // Hex format
  if (c.startsWith('#') && (c.length === 7 || c.length === 4)) {
    let hex = c;
    if (c.length === 4) {
      hex = `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    if (r < 10 && g < 10 && b < 10) return true;
  }

  return false;
};
