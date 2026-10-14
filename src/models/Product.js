const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Product = db.define('Product', {
  name: { type: DataTypes.STRING(180), allowNull: false },
  slug: { type: DataTypes.STRING(200), unique: true, allowNull: false },
  description: DataTypes.TEXT,
  image: DataTypes.STRING(1000),
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  mrp: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  unit: { type: DataTypes.STRING(50), defaultValue: 'piece' },
  stock: { type: DataTypes.INTEGER, defaultValue: 0 },
  categoryId: { type: DataTypes.INTEGER, allowNull: false },
  rating: { type: DataTypes.DECIMAL(3, 2), defaultValue: 0 },
  reviewCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  isBestseller: { type: DataTypes.BOOLEAN, defaultValue: false },
  isFeatured: { type: DataTypes.BOOLEAN, defaultValue: false },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
});

module.exports = Product;
