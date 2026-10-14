const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Location = db.define('Location', {
  name: { type: DataTypes.STRING(120), allowNull: false },
  city: { type: DataTypes.STRING(100), allowNull: false },
  state: { type: DataTypes.STRING(100), allowNull: false },
  pincode: { type: DataTypes.STRING(12), allowNull: false },
  deliveryTime: { type: DataTypes.STRING(60), defaultValue: '30-45 minutes' },
  isAvailable: { type: DataTypes.BOOLEAN, defaultValue: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

module.exports = Location;
