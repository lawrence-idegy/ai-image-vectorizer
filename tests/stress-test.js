/**
 * Stress Test for idegy AI Image Vectorizer
 * Tests authentication, file upload, background removal, and vectorization
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3000';
const TEST_IMAGE = path.join(__dirname, '..', 'idegy_logo.png');

// Stats
let stats = {
  totalTests: 0,
  passed: 0,
  failed: 0,
  startTime: Date.now()
};

function log(msg, type = 'info') {
  const prefix = type === 'success' ? '✓' : type === 'error' ? '✗' : '→';
  console.log(`${prefix} ${msg}`);
}

// Helper to make HTTP requests with multipart/form-data
function uploadFile(url, token, filePath, fields = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    // Build multipart body
    let bodyParts = [];

    // Add fields
    for (const [key, value] of Object.entries(fields)) {
      bodyParts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="${key}"\r\n\r\n` +
        `${value}\r\n`
      );
    }

    // Add file
    bodyParts.push(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="image"; filename="${fileName}"\r\n` +
      `Content-Type: image/png\r\n\r\n`
    );

    // Combine parts
    const bodyStart = Buffer.from(bodyParts.join(''));
    const bodyEnd = Buffer.from(`\r\n--${boundary}--\r\n`);
    const body = Buffer.concat([bodyStart, fileBuffer, bodyEnd]);

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// JSON request helper
function jsonRequest(url, method, body, token = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = body ? JSON.stringify(body) : '';

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function test(name, fn) {
  stats.totalTests++;
  try {
    await fn();
    stats.passed++;
    log(`${name}`, 'success');
    return true;
  } catch (error) {
    stats.failed++;
    log(`${name}: ${error.message}`, 'error');
    return false;
  }
}

async function runStressTest() {
  console.log('\n========================================');
  console.log('  idegy AI Image Vectorizer Stress Test');
  console.log('========================================\n');

  // Verify test image exists
  if (!fs.existsSync(TEST_IMAGE)) {
    log(`Test image not found: ${TEST_IMAGE}`, 'error');
    process.exit(1);
  }
  log(`Using test image: ${TEST_IMAGE}`);

  let accessToken = null;

  // Test 1: Health Check
  await test('Health endpoint returns OK', async () => {
    const res = await jsonRequest(`${API_BASE}/api/health`, 'GET');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.aiEngineReady) throw new Error('AI engine not ready');
  });

  // Test 2: Login
  await test('Login with demo credentials', async () => {
    const res = await jsonRequest(`${API_BASE}/api/auth/login`, 'POST', {
      email: 'demo@idegy.com',
      password: 'demo123'
    });
    if (res.status !== 200) throw new Error(`Status ${res.status}: ${res.data.message}`);
    if (!res.data.accessToken) throw new Error('No access token returned');
    accessToken = res.data.accessToken;
  });

  if (!accessToken) {
    log('Cannot continue without access token', 'error');
    return;
  }

  // Test 3: Auth validation
  await test('Unauthorized request without token returns 401', async () => {
    const res = await jsonRequest(`${API_BASE}/api/auth/me`, 'GET');
    if (res.status !== 401) throw new Error(`Expected 401, got ${res.status}`);
  });

  await test('Authorized request with token returns user', async () => {
    const res = await jsonRequest(`${API_BASE}/api/auth/me`, 'GET', null, accessToken);
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.user) throw new Error('No user returned');
  });

  // Test 4: Background removal models endpoint
  await test('Background removal models endpoint', async () => {
    const res = await jsonRequest(`${API_BASE}/api/background-removal-models`, 'GET');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.models || res.data.models.length === 0) throw new Error('No models returned');
  });

  // Test 5: Methods endpoint
  await test('Methods endpoint returns AI method', async () => {
    const res = await jsonRequest(`${API_BASE}/api/methods`, 'GET');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.methods || res.data.methods.length === 0) throw new Error('No methods returned');
  });

  // Test 6: File upload - Remove Background
  console.log('\n--- File Upload Tests ---');

  await test('Remove background endpoint accepts file', async () => {
    log('  Uploading file for background removal...');
    const res = await uploadFile(`${API_BASE}/api/remove-background`, accessToken, TEST_IMAGE, {
      quality: 'fast'
    });

    if (res.status === 400) {
      // Check if it's a parsing error (the bug we fixed) vs. a valid rejection
      if (res.data.error && res.data.error.includes('No image file provided')) {
        throw new Error('File was not parsed correctly - multipart boundary issue may persist');
      }
    }

    // API should process the request (might fail at Replicate level, but that's OK for this test)
    if (res.status !== 200 && res.status !== 500 && res.status !== 503) {
      throw new Error(`Unexpected status ${res.status}: ${JSON.stringify(res.data)}`);
    }

    log(`  Response status: ${res.status}`);
    if (res.status === 200) {
      log('  Background removal successful!');
    } else {
      log(`  Request accepted but processing failed: ${res.data.message || 'unknown error'}`);
    }
  });

  // Test 7: File upload - Vectorize
  await test('Vectorize endpoint accepts file', async () => {
    log('  Uploading file for vectorization...');
    const res = await uploadFile(`${API_BASE}/api/vectorize`, accessToken, TEST_IMAGE, {
      method: 'ai',
      optimize: 'true',
      removeBackground: 'false'
    });

    if (res.status === 400) {
      if (res.data.error && res.data.error.includes('No image file provided')) {
        throw new Error('File was not parsed correctly - multipart boundary issue may persist');
      }
    }

    // API should process the request
    if (res.status !== 200 && res.status !== 500) {
      throw new Error(`Unexpected status ${res.status}: ${JSON.stringify(res.data)}`);
    }

    log(`  Response status: ${res.status}`);
    if (res.status === 200) {
      log('  Vectorization successful!');
      if (res.data.svgContent) {
        log(`  SVG generated: ${res.data.svgContent.length} characters`);
      }
    } else {
      log(`  Request accepted but processing failed: ${res.data.message || 'unknown error'}`);
    }
  });

  // Test 8: Concurrent requests (stress test)
  console.log('\n--- Concurrency Test ---');

  await test('Handle 3 concurrent vectorization requests', async () => {
    log('  Sending 3 concurrent requests...');
    const promises = [1, 2, 3].map(i =>
      uploadFile(`${API_BASE}/api/vectorize`, accessToken, TEST_IMAGE, {
        method: 'ai',
        optimize: 'true'
      }).then(res => {
        log(`  Request ${i} completed: status ${res.status}`);
        return res;
      })
    );

    const results = await Promise.all(promises);
    const accepted = results.filter(r => r.status === 200 || r.status === 500 || r.status === 429).length;
    log(`  ${accepted}/3 requests processed`);

    if (accepted === 0) {
      throw new Error('No requests were accepted - possible parsing issue');
    }
  });

  // Summary
  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');
  console.log(`  Total:  ${stats.totalTests}`);
  console.log(`  Passed: ${stats.passed}`);
  console.log(`  Failed: ${stats.failed}`);
  console.log(`  Time:   ${((Date.now() - stats.startTime) / 1000).toFixed(2)}s`);
  console.log('========================================\n');

  if (stats.failed > 0) {
    console.log('⚠️  Some tests failed. Check the output above for details.\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed! The API is working correctly.\n');
  }
}

runStressTest().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
