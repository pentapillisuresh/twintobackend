
const { Address, Location } = require('../models');
const { ok, fail } = require('../utils/response');

const asyncHandler = (fn) =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

// ==========================================
// COMMON HELPERS
// ==========================================

function validId(value) {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0
    ? id
    : null;
}

// ==========================================
// VALIDATE SELECTED LOCATION
// ==========================================

async function validateLocation(locationId) {
  const id = validId(locationId);

  if (!id) {
    return {
      error: 'Valid delivery location is required'
    };
  }

  const location = await Location.findOne({
    where: {
      id,
      isActive: true,
      isAvailable: true
    }
  });

  if (!location) {
    return {
      error: 'Selected delivery location is unavailable'
    };
  }

  return { location };
}

// ==========================================
// VALIDATE DEFAULT ADDRESS
// ==========================================

function validateDefaultAddress(data) {
  if (
    data.isDefault !== undefined &&
    typeof data.isDefault !== 'boolean'
  ) {
    return 'isDefault must be true or false';
  }

  return null;
}

// ==========================================
// ALLOWED ADDRESS FIELDS
// ==========================================

function getAddressData(body) {
  const fields = [
    'name',
    'mobile',
    'addressLine1',
    'addressLine2',
    'landmark',
    'city',
    'state',
    'pincode',
    'lat',
    'lng',
    'type',
    'isDefault',
    'locationId'
  ];

  const data = {};

  fields.forEach((field) => {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  });

  return data;
}

// ==========================================
// NORMALIZE ADDRESS TEXT
// ==========================================

function normalizeAddressData(data) {
  const fields = [
    'name',
    'mobile',
    'addressLine1',
    'addressLine2',
    'landmark',
    'city',
    'state',
    'pincode'
  ];

  fields.forEach((field) => {
    if (
      data[field] !== undefined &&
      data[field] !== null
    ) {
      data[field] = String(data[field]).trim();
    }
  });

  return data;
}

// ==========================================
// VALIDATE REQUIRED ADDRESS FIELDS
// ==========================================

function validateRequiredAddressFields(
  data,
  existing = null
) {
  const requiredFields = [
    'name',
    'mobile',
    'addressLine1',
    'city',
    'state',
    'pincode'
  ];

  for (const field of requiredFields) {
    const value =
      data[field] !== undefined
        ? data[field]
        : existing?.[field];

    if (!value || !String(value).trim()) {
      return `${field} is required`;
    }
  }

  return null;
}

// ==========================================
// VALIDATE ADDRESS TYPE
// ==========================================

function validateAddressType(data) {
  if (
    data.type !== undefined &&
    !['HOME', 'WORK', 'OTHER'].includes(data.type)
  ) {
    return 'Invalid address type';
  }

  return null;
}

// ==========================================
// LOCATION RESPONSE ATTRIBUTES
// ==========================================

const locationAttributes = [
  'id',
  'name',
  'city',
  'state',
  'pincode',
  'isActive',
  'isAvailable',
  'platformFee',
  'minimumOrder',
  'deliveryCharge',
  'freeDeliveryEnabled',
  'freeDeliveryMaxItems',
  'deliveryTime'
];

// ==========================================
// LIST CUSTOMER ADDRESSES
// GET /addresses
// ==========================================

exports.listAddresses = asyncHandler(async (req, res) => {
  const addresses = await Address.findAll({
    where: {
      userId: req.user.id,
      isActive: true
    },

    include: [
      {
        model: Location,
        as: 'location',
        attributes: locationAttributes,
        required: false
      }
    ],

    order: [
      ['isDefault', 'DESC'],
      ['createdAt', 'DESC']
    ]
  });

  return ok(res, addresses);
});

// ==========================================
// CREATE CUSTOMER ADDRESS
// POST /addresses
// ==========================================

exports.createAddress = asyncHandler(async (req, res) => {
  const data = getAddressData(req.body || {});

  // Location is mandatory for new addresses
  if (
    data.locationId === undefined ||
    data.locationId === null ||
    data.locationId === ''
  ) {
    return fail(
      res,
      'Please select a delivery location',
      400
    );
  }

  // Validate selected location
  const locationResult = await validateLocation(
    data.locationId
  );

  if (locationResult.error) {
    return fail(
      res,
      locationResult.error,
      400
    );
  }

  data.locationId = locationResult.location.id;

  // Validate default address
  const defaultError = validateDefaultAddress(data);

  if (defaultError) {
    return fail(res, defaultError, 400);
  }

  // Validate address type
  const typeError = validateAddressType(data);

  if (typeError) {
    return fail(res, typeError, 400);
  }

  normalizeAddressData(data);

  // Validate required fields
  const fieldError = validateRequiredAddressFields(data);

  if (fieldError) {
    return fail(res, fieldError, 400);
  }

  // Always use authenticated customer ID
  data.userId = req.user.id;

  // Create address and update default atomically
  const address = await Address.sequelize.transaction(
    async (transaction) => {
      if (data.isDefault === true) {
        await Address.update(
          {
            isDefault: false
          },
          {
            where: {
              userId: req.user.id
            },
            transaction
          }
        );
      }

      return Address.create(
        data,
        { transaction }
      );
    }
  );

  // Return address with selected location details
  const savedAddress = await Address.findByPk(
    address.id,
    {
      include: [
        {
          model: Location,
          as: 'location',
          attributes: locationAttributes,
          required: false
        }
      ]
    }
  );

  return ok(
    res,
    savedAddress,
    'Address created successfully',
    201
  );
});

// ==========================================
// UPDATE CUSTOMER ADDRESS
// PUT /addresses/:id
// ==========================================

exports.updateAddress = asyncHandler(async (req, res) => {
  const addressId = validId(req.params.id);

  if (!addressId) {
    return fail(res, 'Invalid address ID', 400);
  }

  // Only access logged-in customer's address
  const address = await Address.findOne({
    where: {
      id: addressId,
      userId: req.user.id,
      isActive: true
    }
  });

  if (!address) {
    return fail(res, 'Address not found', 404);
  }

  const data = getAddressData(req.body || {});

  if (Object.keys(data).length === 0) {
    return fail(
      res,
      'No valid address fields provided',
      400
    );
  }

  // Validate location only when changed
  if (data.locationId !== undefined) {
    const locationResult = await validateLocation(
      data.locationId
    );

    if (locationResult.error) {
      return fail(
        res,
        locationResult.error,
        400
      );
    }

    data.locationId = locationResult.location.id;
  }

  // Validate default address
  const defaultError = validateDefaultAddress(data);

  if (defaultError) {
    return fail(res, defaultError, 400);
  }

  // Validate address type
  const typeError = validateAddressType(data);

  if (typeError) {
    return fail(res, typeError, 400);
  }

  normalizeAddressData(data);

  // Validate required fields against existing values
  const fieldError = validateRequiredAddressFields(
    data,
    address
  );

  if (fieldError) {
    return fail(res, fieldError, 400);
  }

  // Update address atomically
  await Address.sequelize.transaction(
    async (transaction) => {
      if (data.isDefault === true) {
        await Address.update(
          {
            isDefault: false
          },
          {
            where: {
              userId: req.user.id
            },
            transaction
          }
        );
      }

      await address.update(
        data,
        { transaction }
      );
    }
  );

  // Return updated address with location details
  const updatedAddress = await Address.findByPk(
    address.id,
    {
      include: [
        {
          model: Location,
          as: 'location',
          attributes: locationAttributes,
          required: false
        }
      ]
    }
  );

  return ok(
    res,
    updatedAddress,
    'Address updated successfully'
  );
});

// ==========================================
// DELETE CUSTOMER ADDRESS
// DELETE /addresses/:id
// ==========================================

exports.deleteAddress = asyncHandler(async (req, res) => {
  const addressId = validId(req.params.id);

  if (!addressId) {
    return fail(res, 'Invalid address ID', 400);
  }

  const address = await Address.findOne({
    where: {
      id: addressId,
      userId: req.user.id,
      isActive: true
    }
  });

  if (!address) {
    return fail(res, 'Address not found', 404);
  }

  await address.update({
    isActive: false,
    isDefault: false
  });

  return ok(
    res,
    null,
    'Address deleted successfully'
  );
});
