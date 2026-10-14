const { Setting } = require("../models");

const DEFAULT_FEES = {
  platformFee: 5,
  deliveryPartnerFee: 30,
  freeDeliveryEnabled: true,
  freeDeliveryMaxItems: 3,
};

async function getFees() {
  const setting = await Setting.findOne({
    where: { key: "feeSettings" },
  });

  if (!setting || !setting.value) {
    return { ...DEFAULT_FEES };
  }

  return {
    ...DEFAULT_FEES,
    ...setting.value,
  };
}

function calculateFees({ itemCount = 0 } = {}, settings) {
  const fees = {
    ...DEFAULT_FEES,
    ...(settings || {}),
  };

  const count = Number(itemCount);

  const freeDelivery =
    fees.freeDeliveryEnabled &&
    Number.isFinite(count) &&
    count > 0 &&
    count <= Number(fees.freeDeliveryMaxItems);

  return {
    platformFee: Number(fees.platformFee),
    deliveryPartnerFee: freeDelivery
      ? 0
      : Number(fees.deliveryPartnerFee),
    freeDeliveryApplied: freeDelivery,
  };
}

module.exports = {
  getFees,
  calculateFees,
};