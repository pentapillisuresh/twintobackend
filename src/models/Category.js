const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Category = db.define('Category', {
  name: { type: DataTypes.STRING(120), allowNull: false },
  slug: { type: DataTypes.STRING(160), unique: true, allowNull: false },
  image: DataTypes.STRING(1000),
  parentId: DataTypes.INTEGER,
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 }
});

module.exports = Category;
