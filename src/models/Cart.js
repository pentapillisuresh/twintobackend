const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Cart = db.define('Cart', {
  userId: { type: DataTypes.INTEGER, unique: true, allowNull: false }
});

module.exports = Cart;
