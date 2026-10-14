const Razorpay = require('razorpay');
const { Op } = require('sequelize');
const { db, Address, Cart, CartItem, Product, Order, OrderItem, Payment, History, User, Setting } = require('../models');
const { getFees } = require('../services/feeService');
const { ok, fail } = require('../utils/response');

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function cartFor(userId) {
  const [cart] = await Cart.findOrCreate({ where: { userId }, defaults: { userId } });
  return cart;
}

async function couponDiscount(code, itemTotal) {
  if (!code) return { discount: 0, coupon: null };
  const { Coupon } = require('../models');
  const coupon = await Coupon.findOne({ where: { code: String(code).trim().toUpperCase(), isActive: true } });
  if (!coupon) throw Object.assign(new Error('Invalid coupon'), { status: 400 });
  const now = new Date();
  if (coupon.startDate && now < coupon.startDate) throw Object.assign(new Error('Coupon is not active yet'), { status: 400 });
  if (coupon.endDate && now > coupon.endDate) throw Object.assign(new Error('Coupon has expired'), { status: 400 });
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw Object.assign(new Error('Coupon usage limit reached'), { status: 400 });
  if (itemTotal < Number(coupon.minimumOrderAmount || 0)) throw Object.assign(new Error('Minimum order amount not reached'), { status: 400 });
  let discount = coupon.discountType === 'PERCENTAGE' ? itemTotal * Number(coupon.discountValue) / 100 : Number(coupon.discountValue);
  if (coupon.maximumDiscount !== null && coupon.maximumDiscount !== undefined) discount = Math.min(discount, Number(coupon.maximumDiscount));
  return { discount: Math.min(Math.max(discount, 0), itemTotal), coupon };
}

exports.createOrder = asyncHandler(async (req, res) => {
  const transaction = await db.transaction();
  let committed = false;
  try {
    const body = req.body;
    const paymentMethod = body.paymentMethod || 'COD';
    if (!['COD', 'RAZORPAY'].includes(paymentMethod)) throw Object.assign(new Error('Invalid payment method'), { status: 400 });

    const address = await Address.findOne({ where: { id: body.addressId, userId: req.user.id, isActive: true }, transaction });
    if (!address) throw Object.assign(new Error('Valid delivery address required'), { status: 400 });

    const cart = await cartFor(req.user.id);
    const items = await CartItem.findAll({
      where: { cartId: cart.id },
      include: [{ model: Product, as: 'product' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!items.length) throw Object.assign(new Error('Cart is empty'), { status: 400 });

    let itemTotal = 0;
    let count = 0;
    for (const item of items) {
      if (!item.product || !item.product.isActive || item.quantity > item.product.stock) {
        throw Object.assign(new Error(`Product unavailable or stock insufficient: ${item.product?.name || ''}`), { status: 409 });
      }
      itemTotal += Number(item.product.price) * item.quantity;
      count += item.quantity;
    }
    itemTotal = Number(itemTotal.toFixed(2));

    const feeSettings = await getFees();
    const deliveryFee = feeSettings.freeDeliveryEnabled && count > 0 && count <= Number(feeSettings.freeDeliveryMaxItems)
      ? 0 : Number(feeSettings.deliveryPartnerFee);
    const coupon = await couponDiscount(body.couponCode, itemTotal);
    const tip = Number(body.tip || 0);
    if (!Number.isFinite(tip) || tip < 0 || tip > 10000) throw Object.assign(new Error('Invalid tip'), { status: 400 });

    const total = Number(Math.max(0, itemTotal + Number(feeSettings.platformFee) + deliveryFee - coupon.discount + tip).toFixed(2));
    const order = await Order.create({
      orderNumber: `TW${Date.now()}${Math.floor(100 + Math.random() * 900)}`,
      userId: req.user.id,
      addressId: address.id,
      addressSnapshot: address.toJSON(),
      itemTotal,
      platformFee: Number(feeSettings.platformFee),
      deliveryPartnerFee: deliveryFee,
      discount: Number(coupon.discount.toFixed(2)),
      tip,
      total,
      couponCode: coupon.coupon?.code || null,
      paymentMethod,
      status: 'PLACED',
      paymentStatus: 'PENDING',
      sendAddressToAdmin: Boolean(body.sendAddressToAdmin),
      notes: body.notes || null
    }, { transaction });

    for (const item of items) {
      await OrderItem.create({
        orderId: order.id,
        productId: item.product.id,
        productName: item.product.name,
        productImage: item.product.image,
        price: item.product.price,
        quantity: item.quantity,
        subtotal: Number((Number(item.product.price) * item.quantity).toFixed(2))
      }, { transaction });
    }
    await History.create({ orderId: order.id, status: 'PLACED', note: 'Order placed by customer', changedBy: req.user.id }, { transaction });
    if (coupon.coupon) await coupon.coupon.increment('usedCount', { by: 1, transaction });
    await Payment.create({ orderId: order.id, provider: paymentMethod, amount: total, status: 'PENDING' }, { transaction });
    await CartItem.destroy({ where: { cartId: cart.id }, transaction });

    await transaction.commit();
    committed = true;

    let paymentOrder = null;
    if (paymentMethod === 'RAZORPAY') {
      if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        await order.update({ paymentStatus: 'FAILED' });
        await Payment.update({ status: 'FAILED' }, { where: { orderId: order.id } });
        throw Object.assign(new Error('Razorpay is not configured'), { status: 503 });
      }
      const razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      paymentOrder = await razorpay.orders.create({ amount: Math.round(total * 100), currency: 'INR', receipt: order.orderNumber.slice(0, 40) });
      await Payment.update({ razorpayOrderId: paymentOrder.id }, { where: { orderId: order.id } });
    }

    const savedOrder = await Order.findByPk(order.id, { include: [{ model: OrderItem, as: 'items' }] });
    return ok(res, { order: savedOrder, paymentOrder, razorpayKeyId: process.env.RAZORPAY_KEY_ID || null }, 'Order created', 201);
  } catch (error) {
    if (!committed && !transaction.finished) await transaction.rollback();
    throw error;
  }
});

exports.listMyOrders = asyncHandler(async (req, res) =>
  ok(res, await Order.findAll({ where: { userId: req.user.id }, include: [{ model: OrderItem, as: 'items' }], order: [['createdAt', 'DESC']] }))
);

exports.getMyOrder = asyncHandler(async (req, res) => {
  const row = await Order.findOne({ where: { id: req.params.id, userId: req.user.id }, include: [{ model: OrderItem, as: 'items' }, { model: Payment, as: 'payments' }, { model: History, as: 'history' }] });
  if (!row) return fail(res, 'Order not found', 404);
  const data = row.toJSON();
  data.address = data.addressSnapshot;
  return ok(res, data);
});

exports.cancelMyOrder = asyncHandler(async (req, res) => {
  const row = await Order.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!row) return fail(res, 'Order not found', 404);
  if (!['PLACED', 'CONFIRMED'].includes(row.status)) return fail(res, 'Order can no longer be cancelled', 409);
  if (row.paymentStatus === 'PAID') return fail(res, 'Paid order requires refund workflow', 409);
  await row.update({ status: 'CANCELLED', cancelledAt: new Date() });
  await History.create({ orderId: row.id, status: 'CANCELLED', note: 'Cancelled by customer', changedBy: req.user.id });
  return ok(res, row, 'Order cancelled');
});

exports.adminStats = asyncHandler(async (req, res) => {
  const totalOrders = await Order.count();
  const totalCustomers = await User.count({ where: { role: 'user' } });
  const totalSales = await Order.sum('total', { where: { status: { [Op.ne]: 'CANCELLED' } } }) || 0;
  const paidSales = await Order.sum('total', { where: { paymentStatus: 'PAID' } }) || 0;
  const statusCounts = {};
  for (const status of ['PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED']) statusCounts[status] = await Order.count({ where: { status } });
  return ok(res, { totalOrders, totalCustomers, totalSales: Number(totalSales), paidSales: Number(paidSales), statusCounts });
});

exports.adminOrders = asyncHandler(async (req, res) => {
  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.search) where.orderNumber = { [Op.like]: `%${String(req.query.search).slice(0, 80)}%` };
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 200);
  const offset = Math.max(Number(req.query.offset || 0), 0);
  return ok(res, {
    orders: await Order.findAll({
      where, limit, offset, order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'mobile', 'email'] }, { model: OrderItem, as: 'items' }]
    }), limit, offset
  });
});

exports.adminOrderDetail = asyncHandler(async (req, res) => {
  const row = await Order.findByPk(req.params.id, { include: [{ model: User, as: 'user', attributes: ['id', 'name', 'mobile', 'email'] }, { model: OrderItem, as: 'items' }, { model: Payment, as: 'payments' }, { model: History, as: 'history' }] });
  if (!row) return fail(res, 'Order not found', 404);
  const data = row.toJSON();
  data.address = data.addressSnapshot;
  return ok(res, data);
});

exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const allowed = ['PLACED', 'CONFIRMED', 'PACKING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];
  const nextStatus = req.body.status;
  if (!allowed.includes(nextStatus)) return fail(res, 'Invalid status');
  const row = await Order.findByPk(req.params.id);
  if (!row) return fail(res, 'Order not found', 404);
  const transitions = {
    PLACED: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['PACKING', 'CANCELLED'],
    PACKING: ['OUT_FOR_DELIVERY', 'CANCELLED'],
    OUT_FOR_DELIVERY: ['DELIVERED'],
    DELIVERED: [],
    CANCELLED: []
  };
  if (row.status !== nextStatus && !transitions[row.status].includes(nextStatus)) return fail(res, `Cannot change ${row.status} to ${nextStatus}`, 409);
  if (nextStatus === 'DELIVERED' && row.paymentMethod === 'RAZORPAY' && row.paymentStatus !== 'PAID') return fail(res, 'Cannot deliver unpaid online order', 409);
  if (nextStatus === 'CANCELLED' && row.paymentStatus === 'PAID') return fail(res, 'Paid order requires refund workflow', 409);
  await db.transaction(async (transaction) => {
    await row.update({
      status: nextStatus,
      ...(nextStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
      ...(nextStatus === 'CANCELLED' ? { cancelledAt: new Date() } : {})
    }, { transaction });
    await History.create({ orderId: row.id, status: nextStatus, note: `Updated by admin ${req.user.id}`, changedBy: req.user.id }, { transaction });
  });
  return ok(res, await Order.findByPk(row.id, { include: [{ model: OrderItem, as: 'items' }] }), 'Order status updated');
});

exports.assignDeliveryPerson = asyncHandler(async (req, res) => {
  const name = String(req.body.assignedPersonName || '').trim();
  const mobile = String(req.body.assignedPersonMobile || '').replace(/[^\d+]/g, '');
  if (!name || mobile.replace(/\D/g, '').length < 10) return fail(res, 'Valid delivery person name and mobile required');
  const row = await Order.findByPk(req.params.id);
  if (!row) return fail(res, 'Order not found', 404);
  if (['DELIVERED', 'CANCELLED'].includes(row.status)) return fail(res, 'Cannot assign closed order', 409);
  await row.update({ assignedPersonName: name, assignedPersonMobile: mobile, assignedAt: new Date() });
  return ok(res, row, 'Delivery person assigned');
});

exports.whatsappOrder = asyncHandler(async (req, res) => {
  const row = await Order.findByPk(req.params.id, { include: [{ model: User, as: 'user' }, { model: OrderItem, as: 'items' }] });
  if (!row) return fail(res, 'Order not found', 404);
  const a = row.addressSnapshot || {};
  const items = row.items.map((i) => `${i.productName} x ${i.quantity}`).join('\n');
  const message = [
    `TWINTO Order ${row.orderNumber}`,
    `Customer: ${row.user?.name || ''} (${row.user?.mobile || ''})`,
    `Delivery: ${a.name || ''}, ${a.addressLine1 || ''} ${a.addressLine2 || ''}, ${a.city || ''}, ${a.state || ''} ${a.pincode || ''}`,
    `Items:\n${items}`,
    `Total: ₹${row.total}`,
    `Assigned: ${row.assignedPersonName || 'Not assigned'} ${row.assignedPersonMobile || ''}`,
    `Status: ${row.status}`
  ].join('\n');
  const number = String(row.assignedPersonMobile || row.user?.mobile || '').replace(/\D/g, '');
  return ok(res, { whatsappUrl: `https://wa.me/${number}?text=${encodeURIComponent(message)}`, message });
});
