const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Coupon = db.define('Coupon', {
  code: { type: DataTypes.STRING(60), unique: true, allowNull: false },
  description: DataTypes.STRING(255),
  discountType: { type: DataTypes.ENUM('PERCENTAGE', 'FIXED'), allowNull: false },
  discountValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  minimumOrderAmount: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  maximumDiscount: DataTypes.DECIMAL(12, 2),
  usageLimit: DataTypes.INTEGER,
  usedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  startDate: DataTypes.DATE,
  endDate: DataTypes.DATE,
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

module.exports = Coupon;
