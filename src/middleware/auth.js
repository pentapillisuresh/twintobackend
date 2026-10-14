const jwt = require('jsonwebtoken');
const { User } = require('../models');
const { fail } = require('../utils/response');

exports.auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization || '';

    // ---- DEBUG ----
    console.log('[AUTH] ----');
    console.log('[AUTH] path:', req.method, req.originalUrl);
    console.log('[AUTH] header present:', Boolean(header));
    console.log('[AUTH] header prefix:', header.slice(0, 30));
    console.log('[AUTH] token length:', header.length - 7);
    console.log('[AUTH] JWT_SECRET length:', process.env.JWT_SECRET?.length);
    console.log('[AUTH] JWT_SECRET preview:', process.env.JWT_SECRET?.slice(0, 8) + '...');
    // ----------------

    if (!header.startsWith('Bearer ')) {
      console.log('[AUTH] FAIL: no Bearer prefix');
      return fail(res, 'Authentication required', 401);
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtErr) {
      console.log('[AUTH] jwt.verify FAILED:');
      console.log('[AUTH]   name:', jwtErr.name);
      console.log('[AUTH]   message:', jwtErr.message);
      console.log('[AUTH]   token (first 60 chars):', token.slice(0, 60));
      return fail(res, 'Invalid or expired token', 401);
    }

    console.log('[AUTH] jwt.verify OK. payload:', payload);

    const user = await User.findByPk(payload.id);
    console.log('[AUTH] user found:', Boolean(user));
    if (!user || !user.isActive) {
      return fail(res, 'Account not available', 401);
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('[AUTH] outer catch:', error.message);
    return fail(res, 'Invalid or expired token', 401);
  }
};

exports.adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') return fail(res, 'Admin access required', 403);
  next();
};