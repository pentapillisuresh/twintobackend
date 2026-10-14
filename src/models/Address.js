const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Address = db.define('Address', {
  userId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING(120), allowNull: false },
  mobile: { type: DataTypes.STRING(20), allowNull: false },
  addressLine1: { type: DataTypes.STRING(255), allowNull: false },
  addressLine2: DataTypes.STRING(255),
  landmark: DataTypes.STRING(150),
  city: { type: DataTypes.STRING(100), allowNull: false },
  state: { type: DataTypes.STRING(100), allowNull: false },
  pincode: { type: DataTypes.STRING(12), allowNull: false },
  lat: DataTypes.DECIMAL(10, 7),
  lng: DataTypes.DECIMAL(10, 7),
  type: { type: DataTypes.ENUM('HOME', 'WORK', 'OTHER'), defaultValue: 'HOME' },
  isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

module.exports = Address;
