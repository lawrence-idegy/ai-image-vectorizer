const NodeCache = require('node-cache');

class CacheService {
  constructor() {
    // Main cache for processed SVGs
    this.svgCache = new NodeCache({
      stdTTL: 3600, // 1 hour default TTL
      checkperiod: 600, // Check for expired keys every 10 minutes
      maxKeys: 1000, // Maximum 1000 cached items
      useClones: false, // Don't clone (SVGs can be large)
    });

    // Cache for API responses
    this.apiCache = new NodeCache({
      stdTTL: 300, // 5 minutes default TTL
      checkperiod: 60,
      maxKeys: 500,
    });

    // Cache for user sessions
    this.sessionCache = new NodeCache({
      stdTTL: 86400, // 24 hours
      checkperiod: 3600, // Check every hour
      maxKeys: 10000,
    });

    // Statistics
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
    };
  }

  // Generate cache key for SVG processing
  generateSVGKey(imageBuffer, options) {
    const crypto = require('crypto');
    const optionsStr = JSON.stringify(options);
    const hash = crypto
      .createHash('md5')
      .update(imageBuffer)
      .update(optionsStr)
      .digest('hex');
    return `svg:${hash}`;
  }

  // SVG Cache methods
  getSVG(key) {
    const result = this.svgCache.get(key);
    if (result) {
      this.stats.hits++;
      return result;
    }
    this.stats.misses++;
    return null;
  }

  setSVG(key, svgContent, ttl = 3600) {
    this.stats.sets++;
    return this.svgCache.set(key, svgContent, ttl);
  }

  hasSVG(key) {
    return this.svgCache.has(key);
  }

  deleteSVG(key) {
    return this.svgCache.del(key);
  }

  // API Cache methods
  getAPI(key) {
    return this.apiCache.get(key);
  }

  setAPI(key, data, ttl = 300) {
    return this.apiCache.set(key, data, ttl);
  }

  // Session Cache methods
  getSession(sessionId) {
    return this.sessionCache.get(sessionId);
  }

  setSession(sessionId, data, ttl = 86400) {
    return this.sessionCache.set(sessionId, data, ttl);
  }

  deleteSession(sessionId) {
    return this.sessionCache.del(sessionId);
  }

  // Cache middleware for API responses
  cacheMiddleware(ttl = 300) {
    return (req, res, next) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      const key = `api:${req.originalUrl}`;
      const cached = this.getAPI(key);

      if (cached) {
        return res.json(cached);
      }

      // Override res.json to cache the response
      const originalJson = res.json.bind(res);
      res.json = (data) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          this.setAPI(key, data, ttl);
        }
        return originalJson(data);
      };

      next();
    };
  }

  // Get cache statistics
  getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      svgCacheKeys: this.svgCache.keys().length,
      apiCacheKeys: this.apiCache.keys().length,
      sessionCacheKeys: this.sessionCache.keys().length,
    };
  }

  // Clear all caches
  flushAll() {
    this.svgCache.flushAll();
    this.apiCache.flushAll();
    this.sessionCache.flushAll();
    this.stats = { hits: 0, misses: 0, sets: 0 };
  }

  // Clear specific cache
  flush(cacheName) {
    switch (cacheName) {
      case 'svg':
        this.svgCache.flushAll();
        break;
      case 'api':
        this.apiCache.flushAll();
        break;
      case 'session':
        this.sessionCache.flushAll();
        break;
    }
  }
}

// Export singleton instance
module.exports = new CacheService();
