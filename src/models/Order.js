const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Order = db.define('Order', {
  orderNumber: { type: DataTypes.STRING(40), unique: true, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  addressId: DataTypes.INTEGER,
  addressSnapshot: { type: DataTypes.JSON, allowNull: false },
  itemTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  platformFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  deliveryPartnerFee: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  discount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  tip: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  couponCode: DataTypes.STRING(60),
  paymentMethod: { type: DataTypes.ENUM('COD', 'RAZORPAY'), defaultValue: 'COD' },
  paymentStatus: { type: DataTypes.ENUM('PENDING', 'PAID', 'FAILED', 'REFUNDED'), defaultValue: 'PENDING' },
  status: { type: DataTypes.ENUM('PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'), defaultValue: 'PLACED' },
  sendAddressToAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
  assignedPersonName: DataTypes.STRING(120),
  assignedPersonMobile: DataTypes.STRING(20),
  assignedAt: DataTypes.DATE,
  notes: DataTypes.TEXT,
  cancelledAt: DataTypes.DATE,
  deliveredAt: DataTypes.DATE,
  stockCommitted: { type: DataTypes.BOOLEAN, defaultValue: false }
});

module.exports = Order;
