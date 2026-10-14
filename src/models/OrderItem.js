const { DataTypes } = require('sequelize');
const db = require('../config/db');

const OrderItem = db.define('OrderItem', {
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  productId: DataTypes.INTEGER,
  productName: { type: DataTypes.STRING(180), allowNull: false },
  productImage: DataTypes.STRING(1000),
  price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
});

module.exports = OrderItem;
