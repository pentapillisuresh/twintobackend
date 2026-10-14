const { Op } = require('sequelize');
const { User } = require('../models');
const { ok, fail } = require('../utils/response');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.listCustomers = asyncHandler(async (req, res) => {
  const where = { role: 'user' };
  if (req.query.search) {
    const search = `%${String(req.query.search).slice(0, 80)}%`;
    where[Op.or] = [{ name: { [Op.like]: search } }, { mobile: { [Op.like]: search } }, { email: { [Op.like]: search } }];
  }
  return ok(res, { customers: await User.findAll({
    where, attributes: ['id', 'name', 'mobile', 'email', 'isActive', 'createdAt'],
    order: [['createdAt', 'DESC']], limit: Math.min(Number(req.query.limit || 100), 200)
  }) });
});

exports.updateCustomerStatus = asyncHandler(async (req, res) => {
  if (typeof req.body.isActive !== 'boolean') return fail(res, 'isActive must be true or false');
  const row = await User.findOne({ where: { id: req.params.id, role: 'user' } });
  if (!row) return fail(res, 'Customer not found', 404);
  await row.update({ isActive: req.body.isActive });
  return ok(res, { id: row.id, isActive: row.isActive }, 'Customer status updated');
});

