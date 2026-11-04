
const { ok, fail } = require("../utils/response");
const { getFees } = require("../services/feeService");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ==========================================
// GET LOCATION-SPECIFIC FEE SETTINGS
// GET /settings/fees?locationId=1
// ==========================================

exports.getFeeSettings = asyncHandler(async (req, res) => {
  const locationId = Number(req.query.locationId);

  if (!Number.isSafeInteger(locationId) || locationId <= 0) {
    return fail(
      res,
      "A valid locationId is required to fetch fee settings",
      400
    );
  }

  const fees = await getFees(locationId);

  return ok(res, fees);
});

// ==========================================
// GLOBAL FEE UPDATES ARE DISABLED
// Fees are now managed per location
// ==========================================

exports.updateFeeSettings = asyncHandler(async (req, res) => {
  return fail(
    res,
    "Global fee settings are no longer supported. Update fees through Admin > Locations > Edit Location.",
    410
  );
});
