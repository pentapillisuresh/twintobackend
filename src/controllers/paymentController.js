const crypto = require('crypto');
const { db, Order, Payment } = require('../models');
const { ok, fail } = require('../utils/response');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

exports.verifyPayment = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const order = await Order.findOne({ where: { id: body.orderId, userId: req.user.id, paymentMethod: 'RAZORPAY' } });
  if (!order) return fail(res, 'Order not found', 404);
  const payment = await Payment.findOne({ where: { orderId: order.id, razorpayOrderId: body.razorpay_order_id } });
  if (!payment || !process.env.RAZORPAY_KEY_SECRET) return fail(res, 'Payment record or configuration missing', 400);
  if (!body.razorpay_payment_id || !body.razorpay_signature) return fail(res, 'Payment verification details required', 400);
  const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${body.razorpay_order_id}|${body.razorpay_payment_id}`).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(String(body.razorpay_signature));
  if (expectedBuffer.length !== actualBuffer.length || !crypto.timingSafeEqual(expectedBuffer, actualBuffer)) {
    await db.transaction(async (transaction) => {
      await order.update({ paymentStatus: 'FAILED' }, { transaction });
      await payment.update({ status: 'FAILED' }, { transaction });
    });
    return fail(res, 'Payment verification failed', 400);
  }
  await db.transaction(async (transaction) => {
    await order.update({ paymentStatus: 'PAID' }, { transaction });
    await payment.update({ status: 'PAID', razorpayPaymentId: body.razorpay_payment_id, razorpaySignature: body.razorpay_signature }, { transaction });
  });
  return ok(res, await Order.findByPk(order.id), 'Payment verified');
});

exports.getOrderPayments = asyncHandler(async (req, res) => {
  const order = await Order.findByPk(req.params.orderId);
  if (!order) return fail(res, 'Order not found', 404);
  const payments = await Payment.findAll({ where: { orderId: order.id }, order: [['createdAt', 'DESC']] });
  return ok(res, payments);
});
