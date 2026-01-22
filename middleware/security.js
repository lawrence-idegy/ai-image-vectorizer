const helmet = require('helmet');

// Security middleware configuration
const securityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: [
        "'self'",
        "https://api.replicate.com",
        "https://api.iconify.design",
        "https://api.simplesvg.com",
        "https://api.unisvg.com",
        "wss:",
        "ws:",
      ],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, or same-origin requests)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      process.env.FRONTEND_URL,
      process.env.PRODUCTION_URL
    ].filter(Boolean);

    // Allow Railway domains (production deployment)
    const isRailwayDomain = origin.endsWith('.railway.app') || origin.endsWith('.up.railway.app');

    // Allow if in allowed list, is a Railway domain, or in development mode
    if (allowedOrigins.includes(origin) || isRailwayDomain || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition'],
  maxAge: 86400, // 24 hours
};

// Request sanitization middleware
const sanitizeRequest = (req, res, next) => {
  // Remove any null bytes from request parameters
  const sanitize = (obj) => {
    if (typeof obj === 'string') {
      return obj.replace(/\0/g, '');
    }
    if (typeof obj === 'object' && obj !== null) {
      for (const key in obj) {
        obj[key] = sanitize(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
};

// Prevent parameter pollution
const preventParamPollution = (req, res, next) => {
  // Convert arrays to single values for specific params
  const singularParams = ['method', 'detailLevel', 'removeBackground', 'format'];

  for (const param of singularParams) {
    if (Array.isArray(req.query[param])) {
      req.query[param] = req.query[param][req.query[param].length - 1];
    }
    if (req.body && Array.isArray(req.body[param])) {
      req.body[param] = req.body[param][req.body[param].length - 1];
    }
  }

  next();
};

module.exports = {
  securityMiddleware,
  corsOptions,
  sanitizeRequest,
  preventParamPollution
};
