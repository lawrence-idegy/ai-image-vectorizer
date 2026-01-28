const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { FileError } = require('../utils/errors');

/**
 * Storage abstraction layer
 * Currently uses local filesystem, easily extendable to S3/Cloudinary
 */
class StorageService {
  constructor() {
    this.storageType = process.env.STORAGE_TYPE || 'local';
    this.baseDir = path.join(__dirname, '..');
    this.uploadDir = path.join(this.baseDir, 'uploads');
    this.outputDir = path.join(this.baseDir, 'output');

    // Skip directory creation on serverless platforms (read-only filesystem)
    if (!process.env.VERCEL) {
      this.ensureDirectories();
    }
  }

  async ensureDirectories() {
    // Skip on serverless platforms
    if (process.env.VERCEL) {
      return;
    }
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      await fs.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      // Ignore errors on serverless platforms
      if (!process.env.VERCEL) {
        console.error('Error creating storage directories:', error);
      }
    }
  }

  /**
   * Generate a unique filename
   */
  generateFilename(originalName, prefix = '') {
    const ext = path.extname(originalName);
    const timestamp = Date.now();
    const uuid = uuidv4().split('-')[0];
    return `${prefix}${timestamp}-${uuid}${ext}`;
  }

  /**
   * Save a file
   */
  async saveFile(buffer, filename, type = 'output') {
    const dir = type === 'upload' ? this.uploadDir : this.outputDir;
    const filePath = path.join(dir, filename);

    try {
      await fs.writeFile(filePath, buffer);
      return {
        success: true,
        filename,
        path: filePath,
        url: this.getFileUrl(filename, type),
      };
    } catch (error) {
      throw new FileError(`Failed to save file: ${error.message}`);
    }
  }

  /**
   * Save SVG content
   */
  async saveSVG(svgContent, filename) {
    if (!filename.endsWith('.svg')) {
      filename += '.svg';
    }
    return this.saveFile(Buffer.from(svgContent, 'utf8'), filename, 'output');
  }

  /**
   * Read a file
   */
  async readFile(filename, type = 'output') {
    const dir = type === 'upload' ? this.uploadDir : this.outputDir;
    const filePath = path.join(dir, filename);

    try {
      await fs.access(filePath);
      const content = await fs.readFile(filePath);
      return {
        success: true,
        content,
        path: filePath,
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileError('File not found');
      }
      throw new FileError(`Failed to read file: ${error.message}`);
    }
  }

  /**
   * Read SVG file as string
   */
  async readSVG(filename) {
    const result = await this.readFile(filename, 'output');
    return {
      ...result,
      content: result.content.toString('utf8'),
    };
  }

  /**
   * Delete a file
   */
  async deleteFile(filename, type = 'output') {
    const dir = type === 'upload' ? this.uploadDir : this.outputDir;
    const filePath = path.join(dir, filename);

    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      if (error.code === 'ENOENT') {
        return { success: true, message: 'File already deleted' };
      }
      throw new FileError(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filename, type = 'output') {
    const dir = type === 'upload' ? this.uploadDir : this.outputDir;
    const filePath = path.join(dir, filename);

    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get file URL
   */
  getFileUrl(filename, type = 'output') {
    if (this.storageType === 'local') {
      const endpoint = type === 'upload' ? 'upload' : 'download';
      return `/api/${endpoint}/${filename}`;
    }
    // For cloud storage, return the cloud URL
    return filename;
  }

  /**
   * Get file info
   */
  async getFileInfo(filename, type = 'output') {
    const dir = type === 'upload' ? this.uploadDir : this.outputDir;
    const filePath = path.join(dir, filename);

    try {
      const stats = await fs.stat(filePath);
      return {
        success: true,
        filename,
        path: filePath,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        created: stats.birthtime,
        modified: stats.mtime,
        isFile: stats.isFile(),
      };
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new FileError('File not found');
      }
      throw new FileError(`Failed to get file info: ${error.message}`);
    }
  }

  /**
   * List files in a directory
   */
  async listFiles(type = 'output', options = {}) {
    const { extension, limit = 100, sortBy = 'modified', order = 'desc' } = options;
    const dir = type === 'upload' ? this.uploadDir : this.outputDir;

    try {
      let files = await fs.readdir(dir);

      // Filter by extension if specified
      if (extension) {
        files = files.filter(f => f.endsWith(extension));
      }

      // Get file stats for sorting
      const filesWithStats = await Promise.all(
        files.map(async (filename) => {
          const stats = await fs.stat(path.join(dir, filename));
          return { filename, ...stats };
        })
      );

      // Sort files
      filesWithStats.sort((a, b) => {
        let aVal, bVal;
        switch (sortBy) {
          case 'name':
            aVal = a.filename;
            bVal = b.filename;
            break;
          case 'size':
            aVal = a.size;
            bVal = b.size;
            break;
          case 'created':
            aVal = a.birthtime;
            bVal = b.birthtime;
            break;
          case 'modified':
          default:
            aVal = a.mtime;
            bVal = b.mtime;
        }
        return order === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
      });

      // Apply limit
      const limitedFiles = filesWithStats.slice(0, limit);

      return {
        success: true,
        files: limitedFiles.map(f => ({
          filename: f.filename,
          size: f.size,
          sizeKB: (f.size / 1024).toFixed(2),
          created: f.birthtime,
          modified: f.mtime,
          url: this.getFileUrl(f.filename, type),
        })),
        total: files.length,
        returned: limitedFiles.length,
      };
    } catch (error) {
      throw new FileError(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Clean up old files
   */
  async cleanup(options = {}) {
    const { type = 'both', maxAge = 24 * 60 * 60 * 1000 } = options; // Default 24 hours
    const now = Date.now();
    let deletedCount = 0;

    const cleanDir = async (dir) => {
      try {
        const files = await fs.readdir(dir);

        for (const filename of files) {
          const filePath = path.join(dir, filename);
          const stats = await fs.stat(filePath);

          if (now - stats.mtime.getTime() > maxAge) {
            await fs.unlink(filePath);
            deletedCount++;
          }
        }
      } catch (error) {
        console.error(`Cleanup error in ${dir}:`, error);
      }
    };

    if (type === 'upload' || type === 'both') {
      await cleanDir(this.uploadDir);
    }

    if (type === 'output' || type === 'both') {
      await cleanDir(this.outputDir);
    }

    return { success: true, deletedCount };
  }

  /**
   * Get storage stats
   */
  async getStats() {
    const getDirStats = async (dir) => {
      try {
        const files = await fs.readdir(dir);
        let totalSize = 0;

        for (const filename of files) {
          const stats = await fs.stat(path.join(dir, filename));
          totalSize += stats.size;
        }

        return { fileCount: files.length, totalSize, totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2) };
      } catch {
        return { fileCount: 0, totalSize: 0, totalSizeMB: '0' };
      }
    };

    const uploadStats = await getDirStats(this.uploadDir);
    const outputStats = await getDirStats(this.outputDir);

    return {
      storageType: this.storageType,
      uploads: uploadStats,
      output: outputStats,
      total: {
        fileCount: uploadStats.fileCount + outputStats.fileCount,
        totalSize: uploadStats.totalSize + outputStats.totalSize,
        totalSizeMB: ((uploadStats.totalSize + outputStats.totalSize) / (1024 * 1024)).toFixed(2),
      },
    };
  }
}

// Export singleton
module.exports = new StorageService();
