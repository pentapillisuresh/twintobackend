
const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Payment = db.define('Payment', {
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  // Supported payment providers.
  provider: {
    type: DataTypes.ENUM(
      'COD',
      'CASHFREE'
    ),
    allowNull: false
  },

  // Cashfree order identifier.
  cashfreeOrderId: {
    type: DataTypes.STRING(120),
    allowNull: true
  },

  // Cashfree checkout session.
  cashfreeSessionId: {
    type: DataTypes.TEXT,
    allowNull: true
  },

  amount: {
    type: DataTypes.DECIMAL(12, 2),
    allowNull: false
  },

  currency: {
    type: DataTypes.STRING(5),
    allowNull: false,
    defaultValue: 'INR'
  },

  status: {
    type: DataTypes.ENUM(
      'PENDING',
      'PAID',
      'FAILED',
      'REFUNDED'
    ),
    allowNull: false,
    defaultValue: 'PENDING'
  }
});

module.exports = Payment;
