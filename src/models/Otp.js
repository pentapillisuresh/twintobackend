const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Otp = db.define('Otp', {
  mobile: { type: DataTypes.STRING(20), allowNull: false },
  otp: { type: DataTypes.STRING(10), allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false }
});

module.exports = Otp;
