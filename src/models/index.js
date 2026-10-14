const db = require('../config/db');
const User = require('./User');
const Otp = require('./Otp');
const Category = require('./Category');
const Product = require('./Product');
const Location = require('./Location');
const Address = require('./Address');
const Cart = require('./Cart');
const CartItem = require('./CartItem');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Payment = require('./Payment');
const Coupon = require('./Coupon');
const History = require('./OrderStatusHistory');
const Setting = require('./AppSetting');


// Centralized associations keep model definitions independent and easy to maintain.
User.hasMany(Address, { foreignKey: 'userId', as: 'addresses' });
Address.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasOne(Cart, { foreignKey: 'userId', as: 'cart' });
Cart.hasMany(CartItem, { foreignKey: 'cartId', as: 'items', onDelete: 'CASCADE' });
CartItem.belongsTo(Cart, { foreignKey: 'cartId', as: 'cart' });
CartItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Product.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });
Category.belongsTo(Category, { foreignKey: 'parentId', as: 'parent' });
Category.hasMany(Category, { foreignKey: 'parentId', as: 'children' });
User.hasMany(Order, { foreignKey: 'userId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Order.belongsTo(Address, { foreignKey: 'addressId', as: 'address' });
Order.hasMany(OrderItem, { foreignKey: 'orderId', as: 'items', onDelete: 'CASCADE' });
Order.hasMany(Payment, { foreignKey: 'orderId', as: 'payments' });
Order.hasMany(History, { foreignKey: 'orderId', as: 'history' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
OrderItem.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Payment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
History.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

module.exports = { db, User, Otp, Category, Product, Location, Address, Cart, CartItem, Order, OrderItem, Payment, Coupon, History, Setting };
