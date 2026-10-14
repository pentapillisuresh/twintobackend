const { Setting } = require("../models");
const { ok, fail } = require("../utils/response");
const { getFees } = require("../services/feeService");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

exports.getFeeSettings = asyncHandler(async (req, res) => {
  const settings = await getFees();
  return ok(res, settings);
});

exports.updateFeeSettings = asyncHandler(async (req, res) => {
  const platformFee = Number(req.body.platformFee);
  const deliveryPartnerFee = Number(req.body.deliveryPartnerFee);
  const freeDeliveryMaxItems = Number(req.body.freeDeliveryMaxItems);

  if (
    !Number.isFinite(platformFee) ||
    platformFee < 0 ||
    !Number.isFinite(deliveryPartnerFee) ||
    deliveryPartnerFee < 0 ||
    !Number.isInteger(freeDeliveryMaxItems) ||
    freeDeliveryMaxItems < 0 ||
    freeDeliveryMaxItems > 100 ||
    typeof req.body.freeDeliveryEnabled !== "boolean"
  ) {
    return fail(
      res,
      "Enter valid non-negative fees, a boolean free-delivery setting, and an integer item limit from 0 to 100"
    );
  }

  const value = {
    platformFee,
    deliveryPartnerFee,
    freeDeliveryEnabled: req.body.freeDeliveryEnabled,
    freeDeliveryMaxItems,
  };

  const [row] = await Setting.findOrCreate({
    where: { key: "feeSettings" },
    defaults: {
      key: "feeSettings",
      value,
    },
  });

  await row.update({ value });

  return ok(res, value, "Fee settings updated");
});