/**
 * Test script for the IDEGY Vectorizer
 */
const fs = require('fs').promises;
const path = require('path');
const IdegyVectorizer = require('./index');

async function test() {
  const testImagePath = path.join(__dirname, '../../To Copy/Output Options/newcastle_before.png');
  const outputPath = path.join(__dirname, '../../test-output/idegy_newcastle_test.svg');

  console.log('=== IDEGY Vectorizer Test ===\n');
  console.log('Input:', testImagePath);

  try {
    // Read image
    const imageBuffer = await fs.readFile(testImagePath);
    console.log(`Image size: ${(imageBuffer.length / 1024).toFixed(1)}KB\n`);

    // Create vectorizer
    const vectorizer = new IdegyVectorizer({
      maxColors: 24,
      lineTolerance: 1.5,
      arcTolerance: 1.0,
      bezierTolerance: 1.0,
      cornerThreshold: 45,
      gapFiller: true,
      detectShapes: true,
      minArea: 16,            // Filter out regions smaller than 4x4 pixels
      simplifyTolerance: 2.0  // More aggressive simplification
    });

    // Vectorize
    const startTime = Date.now();
    const svg = await vectorizer.vectorize(imageBuffer);
    const duration = Date.now() - startTime;

    // Save output
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, svg);

    console.log(`\n=== Results ===`);
    console.log(`Time: ${duration}ms`);
    console.log(`Output: ${outputPath}`);
    console.log(`SVG size: ${(svg.length / 1024).toFixed(1)}KB`);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

test();
