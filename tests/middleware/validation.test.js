import { describe, it, expect } from 'vitest';
import { validateSVGContent } from '../../middleware/validation.js';

describe('Validation Middleware', () => {
  describe('validateSVGContent', () => {
    it('should validate proper SVG content', () => {
      const validSVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
      const result = validateSVGContent(validSVG);

      expect(result.valid).toBe(true);
    });

    it('should reject empty content', () => {
      const result = validateSVGContent('');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject non-string content', () => {
      const result = validateSVGContent(null);

      expect(result.valid).toBe(false);
    });

    it('should reject invalid SVG structure', () => {
      const result = validateSVGContent('<div>not svg</div>');

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid SVG');
    });

    it('should reject SVG with script tags', () => {
      const dangerousSVG = '<svg><script>alert("xss")</script></svg>';
      const result = validateSVGContent(dangerousSVG);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('dangerous');
    });

    it('should reject SVG with javascript: URLs', () => {
      const dangerousSVG = '<svg><a href="javascript:alert(1)"></a></svg>';
      const result = validateSVGContent(dangerousSVG);

      expect(result.valid).toBe(false);
    });

    it('should reject SVG with inline event handlers', () => {
      const dangerousSVG = '<svg onclick="alert(1)"><rect/></svg>';
      const result = validateSVGContent(dangerousSVG);

      expect(result.valid).toBe(false);
    });

    it('should reject SVG with onload handler', () => {
      const dangerousSVG = '<svg onload="alert(1)"><rect/></svg>';
      const result = validateSVGContent(dangerousSVG);

      expect(result.valid).toBe(false);
    });
  });
});
