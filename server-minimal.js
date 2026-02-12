// Minimal server for debugging Vercel issues
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', minimal: true });
});

// Test vectorize endpoint (no auth)
app.post('/api/vectorize', (req, res) => {
  res.json({ error: 'Minimal mode - vectorization disabled' });
});

// Start server (local only)
if (!process.env.VERCEL) {
  app.listen(3000, () => console.log('Minimal server on port 3000'));
}

module.exports = app;
