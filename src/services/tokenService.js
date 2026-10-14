const jwt = require('jsonwebtoken');

exports.createToken = (user) =>
  jwt.sign(
    { id: user.id, role: user.role, mobile: user.mobile, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
