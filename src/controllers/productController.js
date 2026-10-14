const { Op } = require('sequelize');
const { Product, Category } = require('../models');
const { ok, fail } = require('../utils/response');
const slug = require('../utils/slug');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.listProducts = asyncHandler(async (req, res) => {
  const where = { isActive: true };
  if (req.query.categoryId) where.categoryId = Number(req.query.categoryId);
  if (req.query.search) where.name = { [Op.like]: `%${String(req.query.search).slice(0, 80)}%` };
  if (req.query.featured === 'true') where.isFeatured = true;
  return ok(res, await Product.findAll({
    where, include: [{ model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }],
    limit: Math.min(Math.max(Number(req.query.limit || 100), 1), 200),
    order: [['createdAt', 'DESC']]
  }));
});

exports.getProduct = asyncHandler(async (req, res) => {
  const row = await Product.findByPk(req.params.id, { include: [{ model: Category, as: 'category' }] });
  if (!row || !row.isActive) return fail(res, 'Product not found', 404);
  return ok(res, row);
});

exports.createProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (!body.name || body.price === undefined || !body.categoryId) return fail(res, 'Name, price and category are required');
  if (!Number.isFinite(Number(body.price)) || Number(body.price) < 0 || Number(body.stock || 0) < 0) return fail(res, 'Invalid price or stock');
  body.slug = body.slug || slug(body.name);
  body.mrp = Number(body.mrp || body.price);
  return ok(res, await Product.create(body), 'Product created', 201);
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const row = await Product.findByPk(req.params.id);
  if (!row) return fail(res, 'Product not found', 404);
  const body = { ...req.body };
  if (body.name && !body.slug) body.slug = slug(body.name);
  await row.update(body);
  return ok(res, row, 'Product updated');
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const row = await Product.findByPk(req.params.id);
  if (!row) return fail(res, 'Product not found', 404);
  await row.update({ isActive: false });
  return ok(res, null, 'Product deactivated');
});

