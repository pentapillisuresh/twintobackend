
const { DataTypes } = require('sequelize');
const db = require('../config/db');

const Otp = db.define(
  'Otp',
  {
    mobile: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true
    },

    otp: {
      type: DataTypes.STRING(64),
      allowNull: false
    },

    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false
    },

    attempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },

    isVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    indexes: [
      {
        unique: true,
        fields: ['mobile'],
        name: 'otp_mobile_unique'
      }
    ]
  }
);

module.exports = Otp;
