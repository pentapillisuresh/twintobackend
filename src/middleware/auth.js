
const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { fail } = require('../utils/response');

/**
 * JWT authentication middleware
 *
 * Validates Bearer token, checks the user account,
 * and attaches the authenticated user to req.user.
 */
exports.auth = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    // Check authorization header
    if (
      typeof authorization !== 'string' ||
      !/^Bearer\s+\S+$/i.test(authorization)
    ) {
      return fail(res, 'Authentication required', 401);
    }

    // Extract JWT token
    const token = authorization.replace(/^Bearer\s+/i, '');

    // Check JWT secret configuration
    if (!process.env.JWT_SECRET) {
      console.error('[AUTH] JWT_SECRET is not configured');

      return fail(
        res,
        'Authentication service unavailable',
        500
      );
    }

    // Verify JWT token
    let payload;

    try {
      payload = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256'],
      });
    } catch (error) {
      // Do not log JWT tokens or secrets
      if (error.name === 'TokenExpiredError') {
        return fail(res, 'Session expired. Please login again', 401);
      }

      return fail(res, 'Invalid or expired token', 401);
    }

    // Validate JWT payload
    if (
      !payload ||
      typeof payload !== 'object' ||
      !Number.isSafeInteger(Number(payload.id)) ||
      Number(payload.id) <= 0
    ) {
      return fail(res, 'Invalid authentication token', 401);
    }

    // Find authenticated user
    const user = await User.findByPk(Number(payload.id));

    if (!user || !user.isActive) {
      return fail(res, 'Account not available', 401);
    }

    // Attach user to request
    req.user = user;

    return next();
  } catch (error) {
    console.error('[AUTH] Authentication middleware error:', error.name);

    return fail(res, 'Authentication service unavailable', 500);
  }
};

/**
 * Admin-only authorization middleware
 *
 * Must be used after auth middleware.
 */
exports.adminOnly = (req, res, next) => {
  if (!req.user) {
    return fail(res, 'Authentication required', 401);
  }

  if (req.user.role !== 'admin') {
    return fail(res, 'Admin access required', 403);
  }

  return next();
};
