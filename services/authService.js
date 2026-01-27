const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { AuthenticationError, AuthorizationError, ValidationError } = require('../utils/errors');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'idegy-vectorizer-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const REFRESH_TOKEN_EXPIRES_IN = '7d';

// Environment-based credentials (works on serverless)
// Format: DEMO_USER_EMAIL, DEMO_USER_PASSWORD, or use defaults
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo@idegy.com';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || 'demo123';

// Allowed email domains (set via env or default to @idegy.com)
const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'idegy.com').split(',').map(d => d.trim().toLowerCase());

/**
 * Check if email domain is allowed
 */
const isEmailDomainAllowed = (email) => {
  if (!email || typeof email !== 'string') return false;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
};

/**
 * Get user from environment-based credentials
 * This works on serverless because it reads from env vars on each request
 */
const getEnvUser = (email) => {
  if (email.toLowerCase() === DEMO_EMAIL.toLowerCase()) {
    return {
      id: 'demo-user-id',
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD, // Plain text comparison for env-based auth
      name: 'Demo User',
      role: 'user',
      plan: 'pro',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
  }
  return null;
};

class AuthService {
  constructor() {
    console.log(`Auth service initialized. Demo login: ${DEMO_EMAIL}`);
  }

  /**
   * Register a new user
   * Note: In env-based auth, registration creates a session but doesn't persist
   */
  async register(email, password, name = '') {
    // Check if email domain is allowed
    if (!isEmailDomainAllowed(email)) {
      throw new ValidationError('Registration is restricted to @idegy.com email addresses only');
    }

    // For env-based auth, just check if it matches demo credentials
    if (email.toLowerCase() === DEMO_EMAIL.toLowerCase()) {
      throw new ValidationError('This email is already registered. Please login instead.');
    }

    // Create a temporary user session (won't persist across serverless invocations)
    const user = {
      id: uuidv4(),
      email,
      name,
      role: 'user',
      plan: 'free',
      createdAt: new Date().toISOString(),
    };

    // Generate tokens
    const tokens = this.generateTokens(user);

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * Login user - validates against environment credentials
   */
  async login(email, password) {
    // Check if email domain is allowed
    if (!isEmailDomainAllowed(email)) {
      throw new AuthenticationError('Access restricted to @idegy.com email addresses only');
    }

    // Get user from environment-based credentials
    const user = getEnvUser(email);

    if (!user) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Direct password comparison for env-based auth
    if (password !== user.password) {
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

      // Get user from env-based credentials
      const user = getEnvUser(decoded.email);

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
    // For env-based auth, check if it's the demo user
    if (userId === 'demo-user-id') {
      const user = getEnvUser(DEMO_EMAIL);
      return user ? this.sanitizeUser(user) : null;
    }
    return null;
  }

  /**
   * Get user by email
   */
  getUserByEmail(email) {
    const user = getEnvUser(email);
    return user ? this.sanitizeUser(user) : null;
  }

  /**
   * Update user profile (limited in env-based auth)
   */
  async updateProfile(userId, updates) {
    // In env-based auth, profile updates are not persisted
    const user = this.getUserById(userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }
    // Return user with requested updates (not persisted)
    return { ...user, ...updates };
  }

  /**
   * Change password (not supported in env-based auth)
   */
  async changePassword(userId, currentPassword, newPassword) {
    throw new ValidationError('Password changes are not supported. Contact administrator.');
  }

  /**
   * Track usage (no-op in env-based auth)
   */
  trackUsage(userId, operation = 'vectorization') {
    return { vectorizations: 0, lastReset: new Date().toISOString() };
  }

  /**
   * Check usage limits (unlimited in env-based auth)
   */
  checkUsageLimits(userId) {
    return {
      current: 0,
      limit: Infinity,
      remaining: Infinity,
      canProcess: true,
    };
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
