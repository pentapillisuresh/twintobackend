const { Location } = require('../models');
const { ok, fail } = require('../utils/response');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.listLocations = asyncHandler(async (req, res) =>
  ok(res, await Location.findAll({ where: { isActive: true, isAvailable: true }, order: [['city', 'ASC']] }))
);

exports.listAllLocations = asyncHandler(async (req, res) => ok(res, await Location.findAll({ order: [['city', 'ASC']] })));

exports.createLocation = asyncHandler(async (req, res) => ok(res, await Location.create(req.body), 'Location created', 201));

exports.updateLocation = asyncHandler(async (req, res) => {
  const row = await Location.findByPk(req.params.id);
  if (!row) return fail(res, 'Location not found', 404);
  await row.update(req.body);
  return ok(res, row, 'Location updated');
});

exports.deleteLocation = asyncHandler(async (req, res) => {
  const row = await Location.findByPk(req.params.id);
  if (!row) return fail(res, 'Location not found', 404);
  await row.update({ isActive: false, isAvailable: false });
  return ok(res, null, 'Location deactivated');
});

