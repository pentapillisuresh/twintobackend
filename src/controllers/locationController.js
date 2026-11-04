
const { Location } = require('../models');
const { ok, fail } = require('../utils/response');

const asyncHandler = (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ==========================================
// DEFAULT LOCATION SETTINGS
// ==========================================

const DEFAULT_LOCATION_SETTINGS = {
  platformFee: 5,
  minimumOrder: 5,
  deliveryCharge: 30,
  freeDeliveryEnabled: true,
  freeDeliveryMaxItems: 3
};

// ==========================================
// VALIDATE FEE VALUES
// ==========================================

function validateFee(value, fieldName) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return `${fieldName} is required`;
  }

  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    return `${fieldName} must be a valid non-negative amount`;
  }

  if (amount > 1000000) {
    return `${fieldName} cannot exceed ₹10,00,000`;
  }

  return null;
}

// ==========================================
// VALIDATE FREE DELIVERY SETTINGS
// ==========================================

function validateFreeDelivery(data) {
  if (
    data.freeDeliveryEnabled !== undefined &&
    typeof data.freeDeliveryEnabled !== 'boolean'
  ) {
    return 'Free delivery enabled must be true or false';
  }

  if (data.freeDeliveryMaxItems !== undefined) {
    const limit = Number(data.freeDeliveryMaxItems);

    if (
      !Number.isSafeInteger(limit) ||
      limit < 0 ||
      limit > 10000
    ) {
      return 'Free delivery item limit must be a whole number between 0 and 10000';
    }
  }

  return null;
}

// ==========================================
// VALIDATE LOCATION STATUS
// ==========================================

function validateLocationStatus(data) {
  for (const field of ['isActive', 'isAvailable']) {
    if (
      data[field] !== undefined &&
      typeof data[field] !== 'boolean'
    ) {
      return `${field} must be true or false`;
    }
  }

  return null;
}

// ==========================================
// GET ALLOWED LOCATION DATA
// ==========================================

function getLocationData(body, isCreate = false) {
  const data = {};

  const fields = [
    'name',
    'city',
    'state',
    'pincode',
    'deliveryTime',
    'isAvailable',
    'isActive'
  ];

  fields.forEach((field) => {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  });

  const feeFields = [
    'platformFee',
    'minimumOrder',
    'deliveryCharge'
  ];

  feeFields.forEach((field) => {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  });

  const freeDeliveryFields = [
    'freeDeliveryEnabled',
    'freeDeliveryMaxItems'
  ];

  freeDeliveryFields.forEach((field) => {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  });

  // Apply defaults only when creating a location
  if (isCreate) {
    Object.entries(DEFAULT_LOCATION_SETTINGS).forEach(
      ([field, defaultValue]) => {
        if (data[field] === undefined) {
          data[field] = defaultValue;
        }
      }
    );
  }

  return data;
}

// ==========================================
// NORMALIZE FEE VALUES
// ==========================================

function normalizeLocationFees(data) {
  const feeFields = [
    'platformFee',
    'minimumOrder',
    'deliveryCharge'
  ];

  feeFields.forEach((field) => {
    if (data[field] !== undefined) {
      data[field] = Number(data[field]);
    }
  });

  if (data.freeDeliveryMaxItems !== undefined) {
    data.freeDeliveryMaxItems =
      Number(data.freeDeliveryMaxItems);
  }

  return data;
}

// ==========================================
// VALIDATE REQUIRED LOCATION FIELDS
// ==========================================

function validateLocationFields(data, isCreate = false) {
  const requiredFields = [
    'name',
    'city',
    'state',
    'pincode'
  ];

  for (const field of requiredFields) {
    if (
      isCreate &&
      !String(data[field] || '').trim()
    ) {
      return `${field} is required`;
    }

    if (
      !isCreate &&
      data[field] !== undefined &&
      !String(data[field]).trim()
    ) {
      return `${field} cannot be empty`;
    }
  }

  // Validate delivery time when provided
  if (
    data.deliveryTime !== undefined &&
    !String(data.deliveryTime).trim()
  ) {
    return 'Delivery time cannot be empty';
  }

  return null;
}

// ==========================================
// VALIDATE ALL FEE SETTINGS
// ==========================================

function validateLocationFees(data) {
  const feeFields = [
    ['platformFee', 'Platform fee'],
    ['minimumOrder', 'Minimum order'],
    ['deliveryCharge', 'Delivery charge']
  ];

  for (const [field, label] of feeFields) {
    if (data[field] !== undefined) {
      const error = validateFee(data[field], label);

      if (error) {
        return error;
      }
    }
  }

  return null;
}

// ==========================================
// CUSTOMER: LIST AVAILABLE LOCATIONS
// GET /locations
// ==========================================

exports.listLocations = asyncHandler(async (req, res) => {
  const locations = await Location.findAll({
    where: {
      isActive: true,
      isAvailable: true
    },

    attributes: [
      'id',
      'name',
      'city',
      'state',
      'pincode',
      'platformFee',
      'minimumOrder',
      'deliveryCharge',
      'freeDeliveryEnabled',
      'freeDeliveryMaxItems',
      'deliveryTime',
      'isAvailable',
      'isActive'
    ],

    order: [
      ['city', 'ASC']
    ]
  });

  return ok(res, locations);
});

// ==========================================
// ADMIN: LIST ALL LOCATIONS
// GET /admin/locations
// ==========================================

exports.listAllLocations = asyncHandler(async (req, res) => {
  const locations = await Location.findAll({
    order: [
      ['city', 'ASC']
    ]
  });

  return ok(res, locations);
});

// ==========================================
// ADMIN: CREATE LOCATION
// POST /admin/locations
// ==========================================

exports.createLocation = asyncHandler(async (req, res) => {
  const data = getLocationData(req.body || {}, true);

  // Validate required fields
  const fieldError = validateLocationFields(data, true);

  if (fieldError) {
    return fail(res, fieldError, 400);
  }

  // Validate monetary fees
  const feeError = validateLocationFees(data);

  if (feeError) {
    return fail(res, feeError, 400);
  }

  // Validate free delivery settings
  const freeDeliveryError = validateFreeDelivery(data);

  if (freeDeliveryError) {
    return fail(res, freeDeliveryError, 400);
  }

  // Validate location status
  const statusError = validateLocationStatus(data);

  if (statusError) {
    return fail(res, statusError, 400);
  }

  // Normalize valid numeric values
  normalizeLocationFees(data);

  // Normalize text fields
  data.name = data.name.trim();
  data.city = data.city.trim();
  data.state = data.state.trim();
  data.pincode = data.pincode.trim();

  if (data.deliveryTime !== undefined) {
    data.deliveryTime = data.deliveryTime.trim();
  }

  const location = await Location.create(data);

  return ok(
    res,
    location,
    'Location created successfully',
    201
  );
});

// ==========================================
// ADMIN: UPDATE LOCATION
// PUT /admin/locations/:id
// ==========================================

exports.updateLocation = asyncHandler(async (req, res) => {
  const locationId = Number(req.params.id);

  if (
    !Number.isSafeInteger(locationId) ||
    locationId <= 0
  ) {
    return fail(res, 'Invalid location ID', 400);
  }

  const location = await Location.findByPk(locationId);

  if (!location) {
    return fail(res, 'Location not found', 404);
  }

  const data = getLocationData(req.body || {});

  if (Object.keys(data).length === 0) {
    return fail(
      res,
      'No valid fields provided for update',
      400
    );
  }

  // Validate text fields
  const fieldError = validateLocationFields(data, false);

  if (fieldError) {
    return fail(res, fieldError, 400);
  }

  // Validate monetary fees
  const feeError = validateLocationFees(data);

  if (feeError) {
    return fail(res, feeError, 400);
  }

  // Validate free delivery settings
  const freeDeliveryError = validateFreeDelivery(data);

  if (freeDeliveryError) {
    return fail(res, freeDeliveryError, 400);
  }

  // Validate location status
  const statusError = validateLocationStatus(data);

  if (statusError) {
    return fail(res, statusError, 400);
  }

  // Normalize valid numeric values
  normalizeLocationFees(data);

  // Normalize text fields
  [
    'name',
    'city',
    'state',
    'pincode',
    'deliveryTime'
  ].forEach((field) => {
    if (data[field] !== undefined) {
      data[field] = data[field].trim();
    }
  });

  await location.update(data);

  return ok(
    res,
    location,
    'Location updated successfully'
  );
});

// ==========================================
// ADMIN: DEACTIVATE LOCATION
// DELETE /admin/locations/:id
// ==========================================

exports.deleteLocation = asyncHandler(async (req, res) => {
  const locationId = Number(req.params.id);

  if (
    !Number.isSafeInteger(locationId) ||
    locationId <= 0
  ) {
    return fail(res, 'Invalid location ID', 400);
  }

  const location = await Location.findByPk(locationId);

  if (!location) {
    return fail(res, 'Location not found', 404);
  }

  await location.update({
    isActive: false,
    isAvailable: false
  });

  return ok(
    res,
    null,
    'Location deactivated successfully'
  );
});
