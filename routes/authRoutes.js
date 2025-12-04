const express = require('express');
const router = express.Router();
const { AuthService, requireAuth } = require('../services/authService');
const { validate } = require('../middleware/validation');
const { asyncHandler } = require('../utils/errors');

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', validate('register'), asyncHandler(async (req, res) => {
  const { email, password, name } = req.body;

  const result = await AuthService.register(email, password, name);

  res.status(201).json({
    success: true,
    message: 'Registration successful',
    ...result,
  });
}));

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', validate('login'), asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const result = await AuthService.login(email, password);

  res.json({
    success: true,
    message: 'Login successful',
    ...result,
  });
}));

/**
 * POST /api/auth/refresh
 * Refresh access token
 */
router.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_TOKEN',
      message: 'Refresh token is required',
    });
  }

  const result = AuthService.refreshToken(refreshToken);

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = AuthService.getUserById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: 'User not found',
    });
  }

  res.json({
    success: true,
    user,
  });
}));

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', requireAuth, validate('updateProfile'), asyncHandler(async (req, res) => {
  const updates = req.body;

  const user = await AuthService.updateProfile(req.user.id, updates);

  res.json({
    success: true,
    message: 'Profile updated successfully',
    user,
  });
}));

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', requireAuth, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'Current password and new password are required',
    });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'WEAK_PASSWORD',
      message: 'New password must be at least 8 characters',
    });
  }

  await AuthService.changePassword(req.user.id, currentPassword, newPassword);

  res.json({
    success: true,
    message: 'Password changed successfully',
  });
}));

/**
 * GET /api/auth/usage
 * Get current user's usage statistics
 */
router.get('/usage', requireAuth, asyncHandler(async (req, res) => {
  const usage = AuthService.checkUsageLimits(req.user.id);
  const limits = AuthService.getPlanLimits(req.user.plan);

  res.json({
    success: true,
    usage,
    plan: req.user.plan,
    limits,
  });
}));

/**
 * GET /api/auth/plans
 * Get available plans
 */
router.get('/plans', (req, res) => {
  res.json({
    success: true,
    plans: [
      {
        id: 'free',
        name: 'Free',
        price: 0,
        features: ['50 vectorizations/month', 'Batch up to 5 images', 'SVG, PNG export'],
      },
      {
        id: 'basic',
        name: 'Basic',
        price: 9.99,
        features: ['500 vectorizations/month', 'Batch up to 20 images', 'SVG, PNG, PDF export'],
      },
      {
        id: 'pro',
        name: 'Pro',
        price: 29.99,
        features: ['5000 vectorizations/month', 'Batch up to 50 images', 'All export formats', 'Priority processing'],
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        price: 99.99,
        features: ['Unlimited vectorizations', 'Batch up to 100 images', 'All export formats', 'Priority support', 'Custom integrations'],
      },
    ],
  });
});

module.exports = router;
