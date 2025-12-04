const { StatusCodes } = require('http-status-codes');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, StatusCodes.BAD_REQUEST, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, StatusCodes.UNAUTHORIZED, 'AUTH_ERROR');
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, StatusCodes.FORBIDDEN, 'FORBIDDEN');
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, StatusCodes.NOT_FOUND, 'NOT_FOUND');
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, StatusCodes.TOO_MANY_REQUESTS, 'RATE_LIMIT');
  }
}

class FileError extends AppError {
  constructor(message) {
    super(message, StatusCodes.BAD_REQUEST, 'FILE_ERROR');
  }
}

class ProcessingError extends AppError {
  constructor(message, details = null) {
    super(message, StatusCodes.UNPROCESSABLE_ENTITY, 'PROCESSING_ERROR');
    this.details = details;
  }
}

class ExternalServiceError extends AppError {
  constructor(service, message) {
    super(`${service} error: ${message}`, StatusCodes.SERVICE_UNAVAILABLE, 'EXTERNAL_SERVICE_ERROR');
    this.service = service;
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  const { logger } = require('./logger');

  // Default error values
  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let response = {
    success: false,
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  };

  // Handle known error types
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    response = {
      success: false,
      error: err.code,
      message: err.message
    };

    if (err.details) {
      response.details = err.details;
    }

    // Only log as error if it's a server error
    if (statusCode >= 500) {
      logger.error('Server error', { error: err.message, stack: err.stack });
    } else {
      logger.warn('Client error', { error: err.message, code: err.code });
    }
  } else if (err.name === 'MulterError') {
    // Multer file upload errors
    statusCode = StatusCodes.BAD_REQUEST;
    response = {
      success: false,
      error: 'FILE_UPLOAD_ERROR',
      message: getMulterErrorMessage(err)
    };
    logger.warn('File upload error', { error: err.message, code: err.code });
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    response = {
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Invalid authentication token'
    };
    logger.warn('JWT error', { error: err.message });
  } else if (err.name === 'TokenExpiredError') {
    statusCode = StatusCodes.UNAUTHORIZED;
    response = {
      success: false,
      error: 'TOKEN_EXPIRED',
      message: 'Authentication token has expired'
    };
    logger.warn('Token expired');
  } else {
    // Unknown errors
    logger.error('Unhandled error', {
      name: err.name,
      message: err.message,
      stack: err.stack
    });

    // In production, don't expose internal error details
    if (process.env.NODE_ENV === 'production') {
      response.message = 'An unexpected error occurred. Please try again later.';
    } else {
      response.message = err.message;
      response.stack = err.stack;
    }
  }

  res.status(statusCode).json(response);
};

// Helper to get user-friendly multer error messages
const getMulterErrorMessage = (err) => {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File size exceeds the maximum allowed limit (10MB)';
    case 'LIMIT_FILE_COUNT':
      return 'Too many files uploaded';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Unexpected file field';
    case 'LIMIT_FIELD_KEY':
      return 'Field name too long';
    case 'LIMIT_FIELD_VALUE':
      return 'Field value too long';
    case 'LIMIT_FIELD_COUNT':
      return 'Too many fields';
    case 'LIMIT_PART_COUNT':
      return 'Too many parts';
    default:
      return err.message;
  }
};

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  FileError,
  ProcessingError,
  ExternalServiceError,
  errorHandler,
  asyncHandler
};
