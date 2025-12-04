// Middleware exports
const { apiLimiter, vectorizeLimiter, batchLimiter, authLimiter, downloadLimiter } = require('./rateLimiter');
const { securityMiddleware, corsOptions, sanitizeRequest, preventParamPollution } = require('./security');
const { validate, validateFile, validateSVGContent, schemas } = require('./validation');

module.exports = {
  // Rate limiters
  apiLimiter,
  vectorizeLimiter,
  batchLimiter,
  authLimiter,
  downloadLimiter,

  // Security
  securityMiddleware,
  corsOptions,
  sanitizeRequest,
  preventParamPollution,

  // Validation
  validate,
  validateFile,
  validateSVGContent,
  schemas,
};
