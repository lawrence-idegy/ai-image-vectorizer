require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const http = require('http');

// Middleware
const { securityMiddleware, corsOptions, sanitizeRequest, preventParamPollution } = require('./middleware/security');
const { apiLimiter, vectorizeLimiter, batchLimiter, downloadLimiter } = require('./middleware/rateLimiter');

// Utils
const { logger, requestLogger } = require('./utils/logger');
const { errorHandler } = require('./utils/errors');

// Services
const websocketService = require('./services/websocketService');
const cacheService = require('./services/cacheService');
const storageService = require('./services/storageService');

// Routes
const vectorizeRoutes = require('./routes/vectorizeRoutes');
const formatRoutes = require('./routes/formatRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Create HTTP server for WebSocket support (not used on Vercel)
const server = http.createServer(app);

// Initialize WebSocket (skip on Vercel - serverless doesn't support WebSockets)
if (!process.env.VERCEL) {
  websocketService.initialize(server);
}

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(securityMiddleware);
app.use(cors(corsOptions));
app.use(compression());

// Request parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Custom middleware
app.use(sanitizeRequest);
app.use(preventParamPollution);
app.use(requestLogger);

// Serve static files from client build
const clientDistPath = path.join(__dirname, 'client/dist');
if (require('fs').existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

// Rate limiting
app.use('/api/', apiLimiter);
app.use('/api/vectorize', vectorizeLimiter);
app.use('/api/vectorize/batch', batchLimiter);
app.use('/api/download', downloadLimiter);

// Configure multer for file uploads
// Use memory storage on Vercel (serverless), disk storage locally
const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

const storage = isServerless
  ? multer.memoryStorage()
  : multer.diskStorage({
      destination: async (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        try {
          await fs.mkdir(uploadDir, { recursive: true });
        } catch (error) {
          // Directory exists or error
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, uniqueSuffix + ext);
      }
    });

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (increased for PDFs)
    files: 20 // Max 20 files for batch
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, WEBP, and PDF are allowed.'));
    }
  }
});

// Make upload middleware and services available to routes
app.set('upload', upload);
app.set('websocket', websocketService);
app.set('cache', cacheService);
app.set('storage', storageService);

// API Routes
app.use('/api', vectorizeRoutes);
app.use('/api', formatRoutes);
app.use('/api/auth', authRoutes);

// Health check with extended info
app.get('/api/health', cacheService.cacheMiddleware(60), (req, res) => {
  res.json({
    status: 'ok',
    message: 'idegy AI Image Vectorizer is running',
    version: '2.0.0',
    aiEngineReady: !!process.env.REPLICATE_API_TOKEN,
    features: {
      vectorization: true,
      batchProcessing: true,
      backgroundRemoval: !!process.env.REPLICATE_API_TOKEN,
      svgOptimization: true,
      formatConversion: true,
      realTimeProgress: true,
      caching: true,
    },
    stats: {
      cache: cacheService.getStats(),
      websocket: websocketService.getStats(),
    }
  });
});

// System stats endpoint (admin only in production)
app.get('/api/stats', async (req, res) => {
  const storageStats = await storageService.getStats();

  res.json({
    server: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
    },
    cache: cacheService.getStats(),
    storage: storageStats,
    websocket: websocketService.getStats(),
  });
});

// Cleanup endpoint (should be protected in production)
app.post('/api/cleanup', async (req, res) => {
  const { maxAge = 24 * 60 * 60 * 1000 } = req.body;
  const result = await storageService.cleanup({ maxAge });
  res.json(result);
});

// Catch-all route to serve frontend (if client/dist exists)
if (require('fs').existsSync(path.join(__dirname, 'client/dist/index.html'))) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Close WebSocket connections
  websocketService.shutdown();

  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });

  // Force close after 30 seconds
  setTimeout(() => {
    logger.error('Forceful shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server (only when not running on Vercel serverless)
const startServer = async () => {
  try {
    // Ensure directories exist
    await storageService.ensureDirectories();

    server.listen(PORT, () => {
      const startupMessage = `
╔═══════════════════════════════════════════════════════════╗
║   idegy AI Image Vectorizer v2.0.0                        ║
╠═══════════════════════════════════════════════════════════╣
║   Server running on: http://localhost:${PORT}              ║
║   WebSocket: ws://localhost:${PORT}/ws                     ║
║   Status: Ready to vectorize images!                      ║
║   AI Engine: ${process.env.REPLICATE_API_TOKEN ? 'Ready ✓' : 'Not configured ✗'}                               ║
╠═══════════════════════════════════════════════════════════╣
║   New in v2.0:                                            ║
║   ✓ Rate limiting & security hardening                    ║
║   ✓ Input validation with Zod                             ║
║   ✓ SVG optimization with SVGO                            ║
║   ✓ Real-time progress via WebSocket                      ║
║   ✓ Caching layer for performance                         ║
║   ✓ JWT authentication system                             ║
║   ✓ Comprehensive error handling                          ║
║   ✓ Winston logging                                       ║
╚═══════════════════════════════════════════════════════════╝`;

      console.log(startupMessage);
      logger.info('Server started', { port: PORT });
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Only start server when not running on Vercel serverless
if (!process.env.VERCEL) {
  startServer();
}

// Export for Vercel serverless (needs default export of app)
module.exports = app;
module.exports.app = app;
module.exports.server = server;
