const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // clientId -> { ws, userId, subscriptions }
    this.jobProgress = new Map(); // jobId -> { status, progress, results }
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      clientTracking: true,
    });

    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const clientIp = req.socket.remoteAddress;

      this.clients.set(clientId, {
        ws,
        userId: null,
        subscriptions: new Set(),
        connectedAt: Date.now(),
      });

      logger.info('WebSocket client connected', { clientId, ip: clientIp });

      // Send welcome message
      this.send(clientId, {
        type: 'connected',
        clientId,
        message: 'Connected to idegy Vectorizer WebSocket',
      });

      // Handle incoming messages
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (error) {
          this.send(clientId, {
            type: 'error',
            message: 'Invalid message format',
          });
        }
      });

      // Handle close
      ws.on('close', () => {
        logger.info('WebSocket client disconnected', { clientId });
        this.clients.delete(clientId);
      });

      // Handle errors
      ws.on('error', (error) => {
        logger.error('WebSocket error', { clientId, error: error.message });
        this.clients.delete(clientId);
      });

      // Ping/pong for keepalive
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });
    });

    // Heartbeat interval
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
          return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    logger.info('WebSocket server initialized');
  }

  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        // Subscribe to job updates
        if (message.jobId) {
          client.subscriptions.add(message.jobId);
          this.send(clientId, {
            type: 'subscribed',
            jobId: message.jobId,
          });
        }
        break;

      case 'unsubscribe':
        // Unsubscribe from job updates
        if (message.jobId) {
          client.subscriptions.delete(message.jobId);
          this.send(clientId, {
            type: 'unsubscribed',
            jobId: message.jobId,
          });
        }
        break;

      case 'authenticate':
        // Associate user with connection
        if (message.userId) {
          client.userId = message.userId;
          this.send(clientId, {
            type: 'authenticated',
            userId: message.userId,
          });
        }
        break;

      case 'ping':
        this.send(clientId, { type: 'pong' });
        break;

      case 'getJobStatus':
        if (message.jobId) {
          const job = this.jobProgress.get(message.jobId);
          this.send(clientId, {
            type: 'jobStatus',
            jobId: message.jobId,
            ...(job || { status: 'unknown' }),
          });
        }
        break;

      default:
        this.send(clientId, {
          type: 'error',
          message: `Unknown message type: ${message.type}`,
        });
    }
  }

  /**
   * Send message to a specific client
   */
  send(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Broadcast to all clients
   */
  broadcast(data, filter = null) {
    for (const [clientId, client] of this.clients) {
      if (filter && !filter(client)) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
      }
    }
  }

  /**
   * Send to all clients subscribed to a job
   */
  sendToJob(jobId, data) {
    for (const [clientId, client] of this.clients) {
      if (client.subscriptions.has(jobId) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({ ...data, jobId }));
      }
    }
  }

  /**
   * Create a new processing job
   */
  createJob(options = {}) {
    const jobId = uuidv4();
    const job = {
      id: jobId,
      status: 'pending',
      progress: 0,
      totalItems: options.totalItems || 1,
      completedItems: 0,
      results: [],
      errors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.jobProgress.set(jobId, job);

    return jobId;
  }

  /**
   * Update job progress
   */
  updateJobProgress(jobId, updates) {
    const job = this.jobProgress.get(jobId);
    if (!job) return;

    Object.assign(job, updates, { updatedAt: Date.now() });

    // Calculate progress percentage
    if (job.totalItems > 0) {
      job.progress = Math.round((job.completedItems / job.totalItems) * 100);
    }

    // Notify subscribed clients
    this.sendToJob(jobId, {
      type: 'jobProgress',
      status: job.status,
      progress: job.progress,
      completedItems: job.completedItems,
      totalItems: job.totalItems,
    });
  }

  /**
   * Add result to job
   */
  addJobResult(jobId, result) {
    const job = this.jobProgress.get(jobId);
    if (!job) return;

    job.results.push(result);
    job.completedItems++;
    job.updatedAt = Date.now();

    // Calculate progress
    job.progress = Math.round((job.completedItems / job.totalItems) * 100);

    // Notify subscribed clients
    this.sendToJob(jobId, {
      type: 'jobItemComplete',
      result,
      progress: job.progress,
      completedItems: job.completedItems,
      totalItems: job.totalItems,
    });
  }

  /**
   * Add error to job
   */
  addJobError(jobId, error) {
    const job = this.jobProgress.get(jobId);
    if (!job) return;

    job.errors.push(error);
    job.completedItems++;
    job.updatedAt = Date.now();

    // Calculate progress
    job.progress = Math.round((job.completedItems / job.totalItems) * 100);

    // Notify subscribed clients
    this.sendToJob(jobId, {
      type: 'jobItemError',
      error,
      progress: job.progress,
      completedItems: job.completedItems,
      totalItems: job.totalItems,
    });
  }

  /**
   * Complete a job
   */
  completeJob(jobId, status = 'completed') {
    const job = this.jobProgress.get(jobId);
    if (!job) return;

    job.status = status;
    job.progress = 100;
    job.completedAt = Date.now();
    job.updatedAt = Date.now();

    // Notify subscribed clients
    this.sendToJob(jobId, {
      type: 'jobComplete',
      status,
      results: job.results,
      errors: job.errors,
      duration: job.completedAt - job.createdAt,
    });

    // Clean up job after 5 minutes
    setTimeout(() => {
      this.jobProgress.delete(jobId);
    }, 5 * 60 * 1000);
  }

  /**
   * Get job status
   */
  getJob(jobId) {
    return this.jobProgress.get(jobId);
  }

  /**
   * Get connected clients count
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      connectedClients: this.clients.size,
      activeJobs: this.jobProgress.size,
      uptime: this.wss ? Date.now() - this.wss._server?.listening : 0,
    };
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.wss) {
      this.wss.close();
    }
  }
}

// Export singleton
module.exports = new WebSocketService();
