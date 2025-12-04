import { describe, it, expect, beforeEach } from 'vitest';
import cacheService from '../../services/cacheService.js';

describe('CacheService', () => {
  beforeEach(() => {
    cacheService.flushAll();
  });

  describe('SVG Cache', () => {
    it('should set and get SVG content', () => {
      const key = 'test-svg-key';
      const svgContent = '<svg></svg>';

      cacheService.setSVG(key, svgContent);
      const result = cacheService.getSVG(key);

      expect(result).toBe(svgContent);
    });

    it('should return null for non-existent key', () => {
      const result = cacheService.getSVG('non-existent');

      expect(result).toBeNull();
    });

    it('should check if key exists', () => {
      const key = 'test-key';
      cacheService.setSVG(key, 'content');

      expect(cacheService.hasSVG(key)).toBe(true);
      expect(cacheService.hasSVG('other-key')).toBe(false);
    });

    it('should delete cached item', () => {
      const key = 'test-key';
      cacheService.setSVG(key, 'content');
      cacheService.deleteSVG(key);

      expect(cacheService.getSVG(key)).toBeNull();
    });
  });

  describe('API Cache', () => {
    it('should set and get API response', () => {
      const key = 'api:test';
      const data = { foo: 'bar' };

      cacheService.setAPI(key, data);
      const result = cacheService.getAPI(key);

      expect(result).toEqual(data);
    });
  });

  describe('Session Cache', () => {
    it('should manage sessions', () => {
      const sessionId = 'session-123';
      const sessionData = { userId: 'user-1' };

      cacheService.setSession(sessionId, sessionData);
      const result = cacheService.getSession(sessionId);

      expect(result).toEqual(sessionData);

      cacheService.deleteSession(sessionId);
      expect(cacheService.getSession(sessionId)).toBeUndefined();
    });
  });

  describe('Cache Key Generation', () => {
    it('should generate unique keys for different content', () => {
      const buffer1 = Buffer.from('image1');
      const buffer2 = Buffer.from('image2');
      const options = { method: 'ai' };

      const key1 = cacheService.generateSVGKey(buffer1, options);
      const key2 = cacheService.generateSVGKey(buffer2, options);

      expect(key1).not.toBe(key2);
    });

    it('should generate same key for same content', () => {
      const buffer = Buffer.from('image');
      const options = { method: 'ai' };

      const key1 = cacheService.generateSVGKey(buffer, options);
      const key2 = cacheService.generateSVGKey(buffer, options);

      expect(key1).toBe(key2);
    });
  });

  describe('Statistics', () => {
    it('should track cache stats', () => {
      cacheService.setSVG('key1', 'value1');
      cacheService.getSVG('key1'); // hit
      cacheService.getSVG('key2'); // miss

      const stats = cacheService.getStats();

      expect(stats.sets).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });

  describe('Flush', () => {
    it('should flush all caches', () => {
      cacheService.setSVG('svg-key', 'content');
      cacheService.setAPI('api-key', { data: true });
      cacheService.setSession('session-key', { user: 1 });

      cacheService.flushAll();

      expect(cacheService.getSVG('svg-key')).toBeNull();
      expect(cacheService.getAPI('api-key')).toBeUndefined();
      expect(cacheService.getSession('session-key')).toBeUndefined();
    });

    it('should flush specific cache', () => {
      cacheService.setSVG('svg-key', 'content');
      cacheService.setAPI('api-key', { data: true });

      cacheService.flush('svg');

      expect(cacheService.getSVG('svg-key')).toBeNull();
      expect(cacheService.getAPI('api-key')).toEqual({ data: true });
    });
  });
});
