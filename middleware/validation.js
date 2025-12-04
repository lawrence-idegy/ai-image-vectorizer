const { z } = require('zod');
const { StatusCodes } = require('http-status-codes');

// Validation schemas
const schemas = {
  vectorize: z.object({
    method: z.enum(['ai', 'replicate', 'potrace', 'fallback', 'auto']).default('ai'),
    removeBackground: z.enum(['true', 'false']).default('false'),
    detailLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  }),

  batchVectorize: z.object({
    method: z.enum(['ai', 'replicate', 'potrace', 'fallback', 'auto']).default('ai'),
    detailLevel: z.enum(['low', 'medium', 'high']).default('medium'),
  }),

  convertFormat: z.object({
    format: z.enum(['pdf', 'eps', 'ai', 'png']),
    quality: z.number().min(1).max(100).optional(),
    scale: z.number().min(0.1).max(10).optional(),
  }),

  filename: z.object({
    filename: z.string()
      .min(1)
      .max(255)
      .regex(/^[\w\-\.]+$/, 'Invalid filename format'),
  }),

  register: z.object({
    email: z.string().email(),
    password: z.string().min(8).max(128),
    name: z.string().min(1).max(100).optional(),
  }),

  login: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),

  updateProfile: z.object({
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
  }),
};

// Validation middleware factory
const validate = (schemaName, source = 'body') => {
  return (req, res, next) => {
    const schema = schemas[schemaName];

    if (!schema) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: 'Validation configuration error',
        message: `Unknown schema: ${schemaName}`
      });
    }

    const dataSource = source === 'body' ? req.body
                     : source === 'query' ? req.query
                     : source === 'params' ? req.params
                     : req.body;

    try {
      const validated = schema.parse(dataSource);

      // Replace original data with validated/transformed data
      if (source === 'body') req.body = validated;
      else if (source === 'query') req.query = validated;
      else if (source === 'params') req.params = validated;

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: 'Validation failed',
          message: 'Invalid request data',
          details: error.errors.map(err => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code
          }))
        });
      }
      next(error);
    }
  };
};

// File validation middleware
const validateFile = (options = {}) => {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    required = true
  } = options;

  return (req, res, next) => {
    if (!req.file && !req.files) {
      if (required) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: 'File required',
          message: 'No file was uploaded'
        });
      }
      return next();
    }

    const files = req.files || [req.file];

    for (const file of files) {
      if (!file) continue;

      // Check file size
      if (file.size > maxSize) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: 'File too large',
          message: `File size exceeds maximum allowed size of ${maxSize / (1024 * 1024)}MB`
        });
      }

      // Check file type
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: 'Invalid file type',
          message: `File type ${file.mimetype} is not allowed. Allowed types: ${allowedTypes.join(', ')}`
        });
      }
    }

    next();
  };
};

// Validate SVG content
const validateSVGContent = (svgContent) => {
  if (!svgContent || typeof svgContent !== 'string') {
    return { valid: false, error: 'SVG content is empty or invalid' };
  }

  // Basic SVG validation
  if (!svgContent.includes('<svg') || !svgContent.includes('</svg>')) {
    return { valid: false, error: 'Invalid SVG structure' };
  }

  // Check for potentially malicious content
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick, onload, etc.
    /<iframe/i,
    /<object/i,
    /<embed/i,
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(svgContent)) {
      return { valid: false, error: 'SVG contains potentially dangerous content' };
    }
  }

  return { valid: true };
};

module.exports = {
  schemas,
  validate,
  validateFile,
  validateSVGContent
};
