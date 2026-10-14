const { DataTypes } = require('sequelize');
const db = require('../config/db');

const User = db.define('User', {
  name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Customer' },
  mobile: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(190), allowNull: true, unique: true },
  password: DataTypes.STRING(255),
  role: { type: DataTypes.ENUM('user', 'admin'), defaultValue: 'user' },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

module.exports = User;
