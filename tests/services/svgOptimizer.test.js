import { describe, it, expect } from 'vitest';
import svgOptimizer from '../../services/svgOptimizer.js';

describe('SVGOptimizer', () => {
  const testSVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <!-- This is a comment -->
  <metadata>Some metadata</metadata>
  <rect x="10" y="10" width="80" height="80" fill="#ff0000"/>
  <circle cx="50" cy="50" r="30" fill="#00ff00"/>
  <path d="M 10 10 L 90 90 L 10 90 Z" fill="#0000ff"/>
</svg>`;

  describe('optimize', () => {
    it('should optimize SVG with default settings', () => {
      const result = svgOptimizer.optimize(testSVG);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.stats.optimizedSize).toBeLessThanOrEqual(result.stats.originalSize);
    });

    it('should remove comments and metadata', () => {
      const result = svgOptimizer.optimize(testSVG);

      expect(result.data).not.toContain('<!--');
      expect(result.data).not.toContain('<metadata>');
    });

    it('should preserve viewBox', () => {
      const result = svgOptimizer.optimize(testSVG);

      expect(result.data).toContain('viewBox');
    });

    it('should calculate savings correctly', () => {
      const result = svgOptimizer.optimize(testSVG);

      expect(result.stats.savings).toBeGreaterThanOrEqual(0);
      expect(parseFloat(result.stats.savingsPercent)).toBeGreaterThanOrEqual(0);
    });

    it('should handle aggressive optimization', () => {
      const result = svgOptimizer.optimize(testSVG, { level: 'aggressive' });

      expect(result.success).toBe(true);
    });

    it('should handle minimal optimization', () => {
      const result = svgOptimizer.optimize(testSVG, { level: 'minimal' });

      expect(result.success).toBe(true);
    });
  });

  describe('sanitize', () => {
    it('should remove script elements', () => {
      const dangerousSVG = `<svg xmlns="http://www.w3.org/2000/svg">
        <script>alert('xss')</script>
        <rect fill="red"/>
      </svg>`;

      const result = svgOptimizer.sanitize(dangerousSVG);

      expect(result.data).not.toContain('<script>');
      expect(result.sanitized).toBe(true);
    });

    it('should handle clean SVG', () => {
      const result = svgOptimizer.sanitize(testSVG);

      expect(result.success).toBe(true);
      expect(result.sanitized).toBe(true);
    });
  });

  describe('analyze', () => {
    it('should count paths correctly', () => {
      const info = svgOptimizer.analyze(testSVG);

      expect(info.pathCount).toBe(1);
    });

    it('should detect viewBox', () => {
      const info = svgOptimizer.analyze(testSVG);

      expect(info.hasViewBox).toBe(true);
    });

    it('should detect dimensions', () => {
      const info = svgOptimizer.analyze(testSVG);

      expect(info.hasWidth).toBe(true);
      expect(info.hasHeight).toBe(true);
    });

    it('should calculate size', () => {
      const info = svgOptimizer.analyze(testSVG);

      expect(info.size).toBeGreaterThan(0);
      expect(parseFloat(info.sizeKB)).toBeGreaterThan(0);
    });

    it('should estimate complexity', () => {
      const info = svgOptimizer.analyze(testSVG);

      expect(['low', 'medium', 'high']).toContain(info.estimatedComplexity);
    });
  });
});
