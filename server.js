require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const vectorizeRoutes = require('./routes/vectorizeRoutes');
const formatRoutes = require('./routes/formatRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Serve static files from client build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
}

// Ensure upload and output directories exist
const ensureDirectories = async () => {
  const dirs = ['uploads', 'output'];
  for (const dir of dirs) {
    try {
      await fs.mkdir(path.join(__dirname, dir), { recursive: true });
    } catch (error) {
      console.error(`Error creating ${dir} directory:`, error);
    }
  }
};

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPG, JPEG, and WEBP are allowed.'));
    }
  }
});

// Make upload middleware available to routes
app.set('upload', upload);

// Routes
app.use('/api', vectorizeRoutes);
app.use('/api', formatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'idegy AI Image Vectorizer is running',
    aiEngineReady: !!process.env.REPLICATE_API_TOKEN
  });
});

// Catch-all route to serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: error.message });
  }

  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// Start server
const startServer = async () => {
  await ensureDirectories();
  app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║   idegy AI Image Vectorizer                           ║
╠═══════════════════════════════════════════════════════╣
║   Server running on: http://localhost:${PORT}          ║
║   Status: Ready to vectorize images!                  ║
║   AI Engine: ${process.env.REPLICATE_API_TOKEN ? 'Ready ✓' : 'Not configured ✗'}                       ║
╚═══════════════════════════════════════════════════════╝
    `);
  });
};

startServer();

module.exports = app;
