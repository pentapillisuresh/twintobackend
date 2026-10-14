const { DataTypes } = require('sequelize');
const db = require('../config/db');

const History = db.define('OrderStatusHistory', {
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING(40), allowNull: false },
  note: DataTypes.STRING(255),
  changedBy: DataTypes.INTEGER
});

module.exports = History;
