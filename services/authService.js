const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const cacheService = require('./cacheService');
const { AuthenticationError, AuthorizationError, ValidationError } = require('../utils/errors');

// In-memory user store (replace with database in production)
const users = new Map();

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'idegy-vectorizer-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

class AuthService {
  constructor() {
    // Create a demo user for testing
    this.createDemoUser();
  }

  async createDemoUser() {
    const demoEmail = 'demo@idegy.com';
    if (!users.has(demoEmail)) {
      const hashedPassword = await bcrypt.hash('demo123', 10);
      users.set(demoEmail, {
        id: uuidv4(),
        email: demoEmail,
        password: hashedPassword,
        name: 'Demo User',
        role: 'user',
        plan: 'free',
        createdAt: new Date().toISOString(),
        usage: {
          vectorizations: 0,
          lastReset: new Date().toISOString(),
        },
      });
    }
  }

  /**
   * Register a new user
   */
  async register(email, password, name = '') {
    // Check if user exists
    if (users.has(email)) {
      throw new ValidationError('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user
    const user = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      role: 'user',
      plan: 'free',
      createdAt: new Date().toISOString(),
      usage: {
        vectorizations: 0,
        lastReset: new Date().toISOString(),
      },
    };

    users.set(email, user);

    // Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Login user
   */
  async login(email, password) {
    const user = users.get(email);

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Check password
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Refresh access token
   */
  refreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);

      const user = users.get(decoded.email);

      if (!user) {
        throw new AuthenticationError('User not found');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      return { accessToken };
    } catch (error) {
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  /**
   * Verify JWT token
   */
  verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new AuthenticationError('Token has expired');
      }
      throw new AuthenticationError('Invalid token');
    }
  }

  /**
   * Generate access and refresh tokens
   */
  generateTokens(user) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, type: 'refresh' },
      JWT_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Generate access token
   */
  generateAccessToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
        type: 'access',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
  }

  /**
   * Get user by ID
   */
  getUserById(userId) {
    for (const user of users.values()) {
      if (user.id === userId) {
        return this.sanitizeUser(user);
      }
    }
    return null;
  }

  /**
   * Get user by email
   */
  getUserByEmail(email) {
    const user = users.get(email);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Update user profile
   */
  async updateProfile(userId, updates) {
    for (const [email, user] of users.entries()) {
      if (user.id === userId) {
        // Update allowed fields
        if (updates.name) user.name = updates.name;
        if (updates.email && updates.email !== email) {
          // Check if new email is taken
          if (users.has(updates.email)) {
            throw new ValidationError('Email already in use');
          }
          user.email = updates.email;
          users.delete(email);
          users.set(updates.email, user);
        }

        return this.sanitizeUser(user);
      }
    }
    throw new AuthenticationError('User not found');
  }

  /**
   * Change password
   */
  async changePassword(userId, currentPassword, newPassword) {
    for (const user of users.values()) {
      if (user.id === userId) {
        const isValid = await bcrypt.compare(currentPassword, user.password);

        if (!isValid) {
          throw new AuthenticationError('Current password is incorrect');
        }

        user.password = await bcrypt.hash(newPassword, 12);
        return true;
      }
    }
    throw new AuthenticationError('User not found');
  }

  /**
   * Track usage
   */
  trackUsage(userId, operation = 'vectorization') {
    for (const user of users.values()) {
      if (user.id === userId) {
        user.usage.vectorizations++;
        return user.usage;
      }
    }
    return null;
  }

  /**
   * Check usage limits
   */
  checkUsageLimits(userId) {
    for (const user of users.values()) {
      if (user.id === userId) {
        const limits = this.getPlanLimits(user.plan);
        return {
          current: user.usage.vectorizations,
          limit: limits.vectorizations,
          remaining: Math.max(0, limits.vectorizations - user.usage.vectorizations),
          canProcess: user.usage.vectorizations < limits.vectorizations,
        };
      }
    }
    return null;
  }

  /**
   * Get plan limits
   */
  getPlanLimits(plan) {
    const plans = {
      free: { vectorizations: 50, batchSize: 5, formats: ['svg', 'png'] },
      basic: { vectorizations: 500, batchSize: 20, formats: ['svg', 'png', 'pdf'] },
      pro: { vectorizations: 5000, batchSize: 50, formats: ['svg', 'png', 'pdf', 'eps', 'ai'] },
      enterprise: { vectorizations: Infinity, batchSize: 100, formats: ['svg', 'png', 'pdf', 'eps', 'ai'] },
    };
    return plans[plan] || plans.free;
  }

  /**
   * Remove sensitive data from user object
   */
  sanitizeUser(user) {
    const { password, ...sanitized } = user;
    return sanitized;
  }
}

// Auth middleware
const authMiddleware = (options = {}) => {
  const { required = true, roles = [] } = options;
  const authService = new AuthService();

  return (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      if (required) {
        throw new AuthenticationError('Authorization header required');
      }
      return next();
    }

    const parts = authHeader.split(' ');

    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      throw new AuthenticationError('Invalid authorization format. Use: Bearer <token>');
    }

    const token = parts[1];

    try {
      const decoded = authService.verifyToken(token);

      // Check if it's an access token
      if (decoded.type !== 'access') {
        throw new AuthenticationError('Invalid token type');
      }

      // Check role if specified
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        throw new AuthorizationError('Insufficient permissions');
      }

      // Attach user to request
      req.user = decoded;
      next();
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        throw error;
      }
      throw new AuthenticationError('Invalid token');
    }
  };
};

// Optional auth middleware (doesn't require auth but attaches user if present)
const optionalAuth = authMiddleware({ required: false });

// Required auth middleware
const requireAuth = authMiddleware({ required: true });

// Role-based auth middleware
const requireRole = (...roles) => authMiddleware({ required: true, roles });

module.exports = {
  AuthService: new AuthService(),
  authMiddleware,
  optionalAuth,
  requireAuth,
  requireRole,
};
