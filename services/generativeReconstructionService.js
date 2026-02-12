/**
 * Generative Reconstruction Service
 *
 * Node.js client for the Python generative reconstruction pipeline.
 * Provides AI super-resolution and edge-preserving preprocessing for
 * high-quality vectorization.
 */

const path = require('path');
const { spawn } = require('child_process');

class GenerativeReconstructionService {
  constructor() {
    this.pythonServerUrl = process.env.PYTHON_PIPELINE_URL || 'http://127.0.0.1:5000';
    this.available = false;
    this.checkHealth();
  }

  /**
   * Check if the Python pipeline server is running
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.pythonServerUrl}/health`, {
        method: 'GET',
        timeout: 2000
      });

      if (response.ok) {
        const data = await response.json();
        this.available = data.status === 'healthy';
        console.log(`[GenReconstruction] Python pipeline: ${this.available ? 'Available' : 'Unavailable'}`);
      } else {
        this.available = false;
      }
    } catch (error) {
      this.available = false;
      console.log('[GenReconstruction] Python pipeline not available (start with: python python_pipeline/server.py)');
    }

    return this.available;
  }

  /**
   * Check if service is available
   */
  isAvailable() {
    return this.available;
  }

  /**
   * Process image through the generative reconstruction pipeline
   *
   * @param {Buffer} imageBuffer - Input image buffer
   * @param {Object} options - Processing options
   * @returns {Promise<Buffer>} - Processed image buffer
   */
  async process(imageBuffer, options = {}) {
    // Check availability
    if (!this.available) {
      await this.checkHealth();
      if (!this.available) {
        throw new Error('Generative reconstruction pipeline not available');
      }
    }

    const {
      upscaleFactor = 4,
      maxColors = 16,
      outputDpi = 300,
      minDimension = 2000,
      bilateralSigmaColor = 75,
      bilateralSigmaSpace = 75,
      colorTolerance = 15.0,
      useGpu = true,
      sharpenEdges = true,
      denoise = true,
    } = options;

    console.log(`[GenReconstruction] Processing image (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

    try {
      // Send to Python pipeline
      const response = await fetch(`${this.pythonServerUrl}/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBuffer.toString('base64'),
          config: {
            upscale_factor: upscaleFactor,
            max_colors: maxColors,
            output_dpi: outputDpi,
            min_dimension: minDimension,
            bilateral_sigma_color: bilateralSigmaColor,
            bilateral_sigma_space: bilateralSigmaSpace,
            color_tolerance: colorTolerance,
            use_gpu: useGpu,
            sharpen_edges: sharpenEdges,
            denoise: denoise,
          }
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Pipeline processing failed');
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Pipeline processing failed');
      }

      // Decode base64 result
      const outputBuffer = Buffer.from(result.image, 'base64');

      console.log(`[GenReconstruction] Complete: ${result.metadata.width}x${result.metadata.height} @ ${result.metadata.dpi} DPI`);

      return {
        buffer: outputBuffer,
        metadata: result.metadata
      };

    } catch (error) {
      console.error(`[GenReconstruction] Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Start the Python pipeline server as a subprocess
   * (for development/local use)
   */
  async startServer() {
    const pythonScript = path.join(__dirname, '..', 'python_pipeline', 'server.py');

    return new Promise((resolve, reject) => {
      const process = spawn('python', [pythonScript, '--port', '5000'], {
        cwd: path.join(__dirname, '..', 'python_pipeline'),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let started = false;

      process.stdout.on('data', (data) => {
        console.log(`[Python] ${data.toString().trim()}`);
        if (!started && data.toString().includes('Starting server')) {
          started = true;
          setTimeout(() => {
            this.checkHealth().then(resolve);
          }, 1000);
        }
      });

      process.stderr.on('data', (data) => {
        console.error(`[Python] ${data.toString().trim()}`);
      });

      process.on('error', (error) => {
        console.error('[Python] Failed to start server:', error);
        reject(error);
      });

      process.on('close', (code) => {
        console.log(`[Python] Server exited with code ${code}`);
        this.available = false;
      });

      // Store process reference
      this._serverProcess = process;
    });
  }

  /**
   * Stop the Python pipeline server
   */
  stopServer() {
    if (this._serverProcess) {
      this._serverProcess.kill();
      this._serverProcess = null;
      this.available = false;
    }
  }
}

// Export singleton
module.exports = new GenerativeReconstructionService();
