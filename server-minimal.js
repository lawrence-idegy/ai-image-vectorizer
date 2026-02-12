// Minimal server for debugging Vercel issues
require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Test imports one by one
const importResults = {};

function tryImport(name, path) {
  try {
    require(path);
    importResults[name] = 'ok';
  } catch (e) {
    importResults[name] = e.message;
  }
}

// Test each import
tryImport('sharp', 'sharp');
tryImport('imagetracerjs', 'imagetracerjs');
tryImport('jsdom', 'jsdom');
tryImport('potrace', 'potrace');
tryImport('@neplex/vectorizer', '@neplex/vectorizer');
tryImport('middleware/security', './middleware/security');
tryImport('middleware/rateLimiter', './middleware/rateLimiter');
tryImport('utils/logger', './utils/logger');
tryImport('utils/errors', './utils/errors');
tryImport('services/authService', './services/authService');
tryImport('services/cacheService', './services/cacheService');
tryImport('services/storageService', './services/storageService');
tryImport('services/websocketService', './services/websocketService');
tryImport('services/vtracerService', './services/vtracerService');
tryImport('routes/vectorizeRoutes', './routes/vectorizeRoutes');
tryImport('routes/authRoutes', './routes/authRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Health check - shows import status
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', imports: importResults });
});

// Start server (local only)
if (!process.env.VERCEL) {
  app.listen(3000, () => console.log('Minimal server on port 3000'));
}

module.exports = app;
