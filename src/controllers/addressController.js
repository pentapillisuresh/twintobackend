const { Address } = require('../models');
const { ok, fail } = require('../utils/response');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.listAddresses = asyncHandler(async (req, res) =>
  ok(res, await Address.findAll({ where: { userId: req.user.id, isActive: true }, order: [['isDefault', 'DESC'], ['createdAt', 'DESC']] }))
);

exports.createAddress = asyncHandler(async (req, res) => {
  const body = { ...req.body, userId: req.user.id };
  if (!body.name || !body.mobile || !body.addressLine1 || !body.city || !body.state || !body.pincode) {
    return fail(res, 'Name, mobile, address, city, state and pincode are required');
  }
  if (body.isDefault) await Address.update({ isDefault: false }, { where: { userId: req.user.id } });
  return ok(res, await Address.create(body), 'Address created', 201);
});

exports.updateAddress = asyncHandler(async (req, res) => {
  const row = await Address.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!row) return fail(res, 'Address not found', 404);
  if (req.body.isDefault) await Address.update({ isDefault: false }, { where: { userId: req.user.id } });
  await row.update(req.body);
  return ok(res, row, 'Address updated');
});

exports.deleteAddress = asyncHandler(async (req, res) => {
  const row = await Address.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!row) return fail(res, 'Address not found', 404);
  await row.update({ isActive: false });
  return ok(res, null, 'Address deleted');
});

