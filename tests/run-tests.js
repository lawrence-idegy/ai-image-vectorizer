/**
 * Test Runner for idegy AI Image Vectorizer
 *
 * Run with: node tests/run-tests.js
 */

require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const FormData = require('form-data');
const fetch = require('node-fetch');
const VectorizerTester = require('./test-validation');

const API_URL = 'http://localhost:3000/api';
const TEST_IMAGES_DIR = path.join(__dirname, 'test-images');
const TEST_OUTPUT_DIR = path.join(__dirname, 'test-output');

class TestRunner {
  constructor() {
    this.tester = new VectorizerTester();
    this.serverRunning = false;
  }

  /**
   * Check if server is running
   */
  async checkServer() {
    try {
      const response = await fetch(`${API_URL}/health`);
      const data = await response.json();
      this.serverRunning = data.status === 'ok';
      return data;
    } catch (error) {
      console.error('❌ Server is not running. Please start with: npm start');
      return null;
    }
  }

  /**
   * Test single image with a method
   */
  async testImage(imagePath, method, edgeCase) {
    try {
      const fileName = path.basename(imagePath);
      console.log(`\n🧪 Testing: ${fileName} (Method: ${method}, Case: ${edgeCase})`);

      // Read image file
      const imageBuffer = await fs.readFile(imagePath);

      // Create form data
      const formData = new FormData();
      formData.append('image', imageBuffer, fileName);
      formData.append('method', method);

      // Send request
      const response = await fetch(`${API_URL}/vectorize`, {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!result.success) {
        console.error(`   ❌ Failed: ${result.message || result.error}`);
        return null;
      }

      console.log(`   ✓ Vectorized with ${result.method}`);

      // Save output for inspection
      const outputFileName = `${path.parse(fileName).name}_${method}.svg`;
      const outputPath = path.join(TEST_OUTPUT_DIR, outputFileName);
      await fs.writeFile(outputPath, result.svgContent);
      console.log(`   ✓ Saved to: ${outputFileName}`);

      // Run validation tests
      const testResult = await this.tester.runTest(
        result.svgContent,
        fileName,
        method,
        edgeCase
      );

      // Display metrics
      console.log(`   📊 Metrics:`);
      console.log(`      - Valid SVG: ${testResult.metrics.isValid ? '✓' : '✗'}`);
      console.log(`      - Path Count: ${testResult.metrics.pathCount}`);
      console.log(`      - Complexity: ${testResult.metrics.complexity}`);
      console.log(`      - File Size: ${(testResult.metrics.fileSize / 1024).toFixed(2)} KB`);

      if (testResult.passed) {
        console.log(`   ✅ TEST PASSED`);
      } else {
        console.log(`   ❌ TEST FAILED`);
        testResult.issues.forEach(issue => {
          console.log(`      - ${issue}`);
        });
      }

      return testResult;

    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      return null;
    }
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║  idegy AI Image Vectorizer - Test Suite               ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Check server
    console.log('🔍 Checking server status...');
    const serverHealth = await this.checkServer();
    if (!this.serverRunning) {
      return;
    }

    console.log(`✅ Server is running`);
    console.log(`   - AI Engine: ${serverHealth.aiEngineReady ? '✓ Ready' : '✗ Not configured'}`);

    // Ensure output directory exists
    await fs.mkdir(TEST_OUTPUT_DIR, { recursive: true });

    // Define test cases
    const testCases = [
      // Test if test images exist
      { file: 'simple-logo.png', edgeCase: 'simple-logo', methods: ['ai', 'potrace'] },
      { file: 'complex-illustration.png', edgeCase: 'complex-illustration', methods: ['ai'] },
      { file: 'line-art.png', edgeCase: 'line-art', methods: ['ai', 'potrace'] },
      { file: 'icon.png', edgeCase: 'icon', methods: ['ai', 'potrace'] },
      { file: 'high-contrast.png', edgeCase: 'high-contrast', methods: ['ai', 'potrace'] },
    ];

    // Check which test images exist
    console.log('\n📁 Checking for test images...');
    const availableTests = [];

    for (const test of testCases) {
      const imagePath = path.join(TEST_IMAGES_DIR, test.file);
      try {
        await fs.access(imagePath);
        availableTests.push(test);
        console.log(`   ✓ Found: ${test.file}`);
      } catch {
        console.log(`   ⚠ Missing: ${test.file}`);
      }
    }

    if (availableTests.length === 0) {
      console.log('\n⚠ No test images found in tests/test-images/');
      console.log('Please add test images or use your own images for testing.');
      console.log('\nYou can test manually by uploading images through the web interface.');
      return;
    }

    // Run tests
    console.log('\n🚀 Running tests...');
    console.log('═'.repeat(60));

    for (const test of availableTests) {
      const imagePath = path.join(TEST_IMAGES_DIR, test.file);

      for (const method of test.methods) {
        // Skip AI tests if not configured
        if (method === 'ai' && !serverHealth.aiEngineReady) {
          console.log(`\n⚠ Skipping AI test for ${test.file} (AI engine not configured)`);
          continue;
        }

        await this.testImage(imagePath, method, test.edgeCase);
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Generate report
    console.log('\n' + '═'.repeat(60));
    console.log('\n📊 TEST REPORT');
    console.log('═'.repeat(60));

    const report = this.tester.generateReport();

    console.log(`\n📈 Summary:`);
    console.log(`   Total Tests: ${report.summary.total}`);
    console.log(`   Passed: ${report.summary.passed} ✅`);
    console.log(`   Failed: ${report.summary.failed} ❌`);
    console.log(`   Pass Rate: ${report.summary.passRate}`);

    console.log(`\n🤖 AI Vectorization:`);
    console.log(`   Total: ${report.byMethod.ai.total}`);
    console.log(`   Passed: ${report.byMethod.ai.passed} ✅`);
    console.log(`   Failed: ${report.byMethod.ai.failed} ❌`);

    console.log(`\n🔧 Potrace Fallback:`);
    console.log(`   Total: ${report.byMethod.potrace.total}`);
    console.log(`   Passed: ${report.byMethod.potrace.passed} ✅`);
    console.log(`   Failed: ${report.byMethod.potrace.failed} ❌`);

    if (report.recommendations.length > 0) {
      console.log(`\n💡 Recommendations:`);
      report.recommendations.forEach(rec => {
        console.log(`   - ${rec}`);
      });
    }

    // Save detailed report
    const reportPath = path.join(TEST_OUTPUT_DIR, 'test-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: test-output/test-report.json`);

    console.log('\n✨ Testing complete!\n');
  }
}

// Run tests
const runner = new TestRunner();
runner.runAllTests().catch(console.error);
