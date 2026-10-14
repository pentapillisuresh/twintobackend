const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Payment = db.define('Payment', {
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  provider: { type: DataTypes.ENUM('RAZORPAY', 'COD'), allowNull: false },
  razorpayOrderId: DataTypes.STRING(100),
  razorpayPaymentId: DataTypes.STRING(100),
  razorpaySignature: DataTypes.STRING(255),
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  currency: { type: DataTypes.STRING(5), defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED'), defaultValue: 'PENDING' }
});

module.exports = Payment;
