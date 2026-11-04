
const { Location } = require('../models');

// ==========================================
// DEFAULT LOCATION FEES
// ==========================================

const DEFAULT_FEES = {
  platformFee: 5,
  minimumOrder: 5,
  deliveryCharge: 30,
  freeDeliveryEnabled: true,
  freeDeliveryMaxItems: 3
};

// ==========================================
// COMMON VALIDATION
// ==========================================

function validateFeeSettings(fees) {
  const platformFee = Number(fees.platformFee);
  const minimumOrder = Number(fees.minimumOrder);
  const deliveryCharge = Number(fees.deliveryCharge);

  const freeDeliveryEnabled = fees.freeDeliveryEnabled;

  const freeDeliveryMaxItems = Number(
    fees.freeDeliveryMaxItems
  );

  if (
    !Number.isFinite(platformFee) ||
    platformFee < 0 ||
    platformFee > 1000000
  ) {
    throw new Error('Invalid platform fee configuration');
  }

  if (
    !Number.isFinite(minimumOrder) ||
    minimumOrder < 0 ||
    minimumOrder > 1000000
  ) {
    throw new Error('Invalid minimum order configuration');
  }

  if (
    !Number.isFinite(deliveryCharge) ||
    deliveryCharge < 0 ||
    deliveryCharge > 1000000
  ) {
    throw new Error('Invalid delivery charge configuration');
  }

  if (typeof freeDeliveryEnabled !== 'boolean') {
    throw new Error('Invalid free delivery configuration');
  }

  if (
    !Number.isSafeInteger(freeDeliveryMaxItems) ||
    freeDeliveryMaxItems < 0 ||
    freeDeliveryMaxItems > 10000
  ) {
    throw new Error('Invalid free delivery item limit');
  }

  return {
    platformFee: Number(platformFee.toFixed(2)),
    minimumOrder: Number(minimumOrder.toFixed(2)),
    deliveryCharge: Number(deliveryCharge.toFixed(2)),
    freeDeliveryEnabled,
    freeDeliveryMaxItems
  };
}

// ==========================================
// GET FEES FOR SELECTED LOCATION
// ==========================================

async function getFees(locationId, transaction = null) {
  const id = Number(locationId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    const error = new Error(
      'Valid delivery location is required'
    );

    error.status = 400;
    throw error;
  }

  const location = await Location.findOne({
    where: {
      id,
      isActive: true,
      isAvailable: true
    },

    ...(transaction ? { transaction } : {})
  });

  if (!location) {
    const error = new Error(
      'Selected delivery location is unavailable'
    );

    error.status = 400;
    throw error;
  }

  // Always read configuration from the database.
  // Never trust fee values sent by the mobile app.

  try {
    return validateFeeSettings({
      platformFee: location.platformFee,
      minimumOrder: location.minimumOrder,
      deliveryCharge: location.deliveryCharge,
      freeDeliveryEnabled: location.freeDeliveryEnabled,
      freeDeliveryMaxItems: location.freeDeliveryMaxItems
    });
  } catch (error) {
    error.status = 500;
    throw error;
  }
}

// ==========================================
// CALCULATE LOCATION-BASED DELIVERY FEES
// ==========================================

function calculateFees(fees, itemCount) {
  if (!fees || typeof fees !== 'object') {
    throw new Error(
      'Location fee settings are required'
    );
  }

  const settings = validateFeeSettings(fees);

  const quantity = Number(itemCount);

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 0
  ) {
    throw new Error('Invalid cart item quantity');
  }

  let deliveryCharge = settings.deliveryCharge;

  let freeDeliveryApplied = false;

  // Free delivery applies when the total quantity
  // is within the selected location's configured limit.

  if (
    settings.freeDeliveryEnabled &&
    quantity > 0 &&
    quantity <= settings.freeDeliveryMaxItems
  ) {
    deliveryCharge = 0;
    freeDeliveryApplied = true;
  }

  return {
    platformFee: settings.platformFee,

    minimumOrder: settings.minimumOrder,

    // Actual delivery charge for this order
    deliveryCharge,

    // Original configured delivery charge
    configuredDeliveryCharge: settings.deliveryCharge,

    freeDeliveryEnabled: settings.freeDeliveryEnabled,

    freeDeliveryMaxItems: settings.freeDeliveryMaxItems,

    freeDeliveryApplied
  };
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  DEFAULT_FEES,
  getFees,
  calculateFees
};
