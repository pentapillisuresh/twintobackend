// Admin resource controllers are separated from routes for MVC organization.
const { ok } = require('../utils/response');
const { User } = require('../models');

exports.profile = (req, res) => ok(res, {
  id: req.user.id, name: req.user.name, email: req.user.email,
  mobile: req.user.mobile, role: req.user.role
});
