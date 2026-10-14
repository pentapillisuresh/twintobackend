const { Category } = require('../models');
const { ok, fail } = require('../utils/response');
const slug = require('../utils/slug');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.listCategories = asyncHandler(async (req, res) =>
  ok(res, await Category.findAll({
    where: { isActive: true },
    include: [{ model: Category, as: 'parent', attributes: ['id', 'name', 'slug'] }],
    order: [['sortOrder', 'ASC']]
  }))
);

exports.listAllCategories = asyncHandler(async (req, res) =>
  ok(res, await Category.findAll({ include: [{ model: Category, as: 'parent', attributes: ['id', 'name'] }], order: [['sortOrder', 'ASC']] }))
);

exports.createCategory = asyncHandler(async (req, res) => {
  if (!req.body.name) return fail(res, 'Category name is required');
  const category = await Category.create({ ...req.body, slug: req.body.slug || slug(req.body.name) });
  return ok(res, category, 'Category created', 201);
});

exports.updateCategory = asyncHandler(async (req, res) => {
  const row = await Category.findByPk(req.params.id);
  if (!row) return fail(res, 'Category not found', 404);
  const body = { ...req.body };
  if (body.name && !body.slug) body.slug = slug(body.name);
  await row.update(body);
  return ok(res, row, 'Category updated');
});

exports.deleteCategory = asyncHandler(async (req, res) => {
  const row = await Category.findByPk(req.params.id);
  if (!row) return fail(res, 'Category not found', 404);
  if (await Category.count({ where: { parentId: row.id } })) return fail(res, 'Remove subcategories first', 409);
  await row.destroy();
  return ok(res, null, 'Category deleted');
});

