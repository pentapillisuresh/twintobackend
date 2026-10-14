const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Setting = db.define('AppSetting', {
  key: { type: DataTypes.STRING(100), unique: true, allowNull: false },
  value: { type: DataTypes.JSON, allowNull: false }
});

module.exports = Setting;
