const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for vectorization endpoints (expensive operations)
const vectorizeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 vectorizations per hour
  message: {
    success: false,
    error: 'Rate limit exceeded',
    message: 'Vectorization limit reached. Please try again in an hour or upgrade your plan.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Batch processing limiter (more restrictive)
const batchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 batch operations per hour
  message: {
    success: false,
    error: 'Batch rate limit exceeded',
    message: 'Batch processing limit reached. Please try again in an hour.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoints limiter (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login attempts per 15 minutes
  message: {
    success: false,
    error: 'Too many login attempts',
    message: 'Too many login attempts from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Download limiter
const downloadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 downloads per minute
  message: {
    success: false,
    error: 'Download rate limit exceeded',
    message: 'Too many download requests. Please slow down.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  vectorizeLimiter,
  batchLimiter,
  authLimiter,
  downloadLimiter
};
