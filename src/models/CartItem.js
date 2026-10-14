const { DataTypes } = require('sequelize');
const db = require('../config/db');

const CartItem = db.define('CartItem', {
  cartId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.INTEGER, defaultValue: 1 }
});

module.exports = CartItem;
