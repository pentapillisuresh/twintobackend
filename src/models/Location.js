
const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Location = db.define('Location', {
  name: {
    type: DataTypes.STRING(120),
    allowNull: false
  },

  city: {
    type: DataTypes.STRING(100),
    allowNull: false
  },

  state: {
    type: DataTypes.STRING(100),
    allowNull: false
  },

  pincode: {
    type: DataTypes.STRING(12),
    allowNull: false
  },

  // ========================================
  // LOCATION-BASED PLATFORM FEE
  // ========================================

  platformFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 5,
    validate: {
      min: 0
    }
  },

  // ========================================
  // LOCATION-BASED MINIMUM ORDER
  // ========================================

  minimumOrder: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 5,
    validate: {
      min: 0
    }
  },

  // ========================================
  // LOCATION-BASED DELIVERY CHARGE
  // ========================================

  deliveryCharge: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 30,
    validate: {
      min: 0
    }
  },

  // ========================================
  // FREE DELIVERY SETTINGS
  // ========================================

  freeDeliveryEnabled: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },

  freeDeliveryMaxItems: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3,
    validate: {
      min: 0
    }
  },

  // ========================================
  // OTHER LOCATION SETTINGS
  // ========================================

  deliveryTime: {
    type: DataTypes.STRING(60),
    defaultValue: '30-45 minutes'
  },

  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
});

module.exports = Location;
