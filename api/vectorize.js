const sharp = require('sharp');
const SmoothingVectorizer = require('../services/vectorizer/smoothingVectorizer');
const svgOptimizer = require('../services/svgOptimizer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // For now, expect base64 image in body
    const { image, method = 'smooth', optimize = true } = req.body || {};

    if (!image) {
      return res.status(400).json({ error: 'No image provided. Send base64 image in "image" field.' });
    }

    // Decode base64
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Vectorize
    const vectorizer = new SmoothingVectorizer({ upscaleFactor: 3 });
    let svgContent = await vectorizer.vectorize(imageBuffer, { quantizeColors: true });

    // Optimize
    if (optimize) {
      const optimized = svgOptimizer.optimize(svgContent, { level: 'default', preserveColors: true });
      if (optimized.success) {
        svgContent = optimized.data;
      }
    }

    res.json({
      success: true,
      svgContent,
      method: 'Smoothing Vectorizer'
    });
  } catch (error) {
    console.error('Vectorization error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
