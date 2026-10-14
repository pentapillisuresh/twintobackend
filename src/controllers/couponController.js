const { Coupon } = require('../models');
const { ok, fail } = require('../utils/response');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.listCoupons = asyncHandler(async (req, res) => ok(res, await Coupon.findAll({ order: [['createdAt', 'DESC']] })));

exports.createCoupon = asyncHandler(async (req, res) => {
  const body = { ...req.body, code: String(req.body.code || '').trim().toUpperCase() };
  if (!body.code || !['FIXED', 'PERCENTAGE'].includes(body.discountType) || Number(body.discountValue) <= 0) {
    return fail(res, 'Valid code, discount type and positive value required');
  }
  return ok(res, await Coupon.create(body), 'Coupon created', 201);
});

exports.updateCoupon = asyncHandler(async (req, res) => {
  const row = await Coupon.findByPk(req.params.id);
  if (!row) return fail(res, 'Coupon not found', 404);
  await row.update({ ...req.body, code: req.body.code ? String(req.body.code).trim().toUpperCase() : row.code });
  return ok(res, row, 'Coupon updated');
});

exports.deleteCoupon = asyncHandler(async (req, res) => {
  const row = await Coupon.findByPk(req.params.id);
  if (!row) return fail(res, 'Coupon not found', 404);
  await row.destroy();
  return ok(res, null, 'Coupon deleted');
});

