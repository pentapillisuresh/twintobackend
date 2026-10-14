const { Cart, CartItem, Product, Coupon } = require('../models');
const { ok, fail } = require('../utils/response');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function cartFor(userId) {
  const [cart] = await Cart.findOrCreate({ where: { userId }, defaults: { userId } });
  return cart;
}

exports.getCart = asyncHandler(async (req, res) => {
  const cart = await cartFor(req.user.id);
  const items = await CartItem.findAll({
    where: { cartId: cart.id },
    include: [{ model: Product, as: 'product', include: [{ association: 'category' }] }]
  });
  return ok(res, { id: cart.id, items });
});

exports.addItem = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ where: { id: req.body.productId, isActive: true } });
  if (!product) return fail(res, 'Product not found', 404);
  const quantity = Number(req.body.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1) return fail(res, 'Quantity must be a positive integer');
  if (quantity > product.stock) return fail(res, 'Insufficient stock', 409);
  const cart = await cartFor(req.user.id);
  let item = await CartItem.findOne({ where: { cartId: cart.id, productId: product.id } });
  if (item) {
    if (item.quantity + quantity > product.stock) return fail(res, 'Insufficient stock', 409);
    await item.increment('quantity', { by: quantity });
    await item.reload();
  } else {
    item = await CartItem.create({ cartId: cart.id, productId: product.id, quantity });
  }
  return ok(res, item, 'Cart updated', 201);
});

exports.updateItem = asyncHandler(async (req, res) => {
  const cart = await cartFor(req.user.id);
  const item = await CartItem.findOne({
    where: { id: req.params.itemId, cartId: cart.id },
    include: [{ model: Product, as: 'product' }]
  });
  if (!item) return fail(res, 'Cart item not found', 404);
  const quantity = Number(req.body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return fail(res, 'Quantity must be a positive integer');
  if (!item.product || quantity > item.product.stock) return fail(res, 'Insufficient stock', 409);
  await item.update({ quantity });
  return ok(res, item, 'Cart updated');
});

exports.removeItem = asyncHandler(async (req, res) => {
  const cart = await cartFor(req.user.id);
  const item = await CartItem.findOne({ where: { id: req.params.itemId, cartId: cart.id } });
  if (!item) return fail(res, 'Cart item not found', 404);
  await item.destroy();
  return ok(res, null, 'Item removed');
});

exports.validateCoupon = asyncHandler(async (req, res) => {
  const itemTotal = Number(req.body.itemTotal);
  if (!Number.isFinite(itemTotal) || itemTotal < 0) return fail(res, 'Valid itemTotal required');
  const coupon = await Coupon.findOne({ where: { code: String(req.body.code || '').trim().toUpperCase(), isActive: true } });
  if (!coupon) return fail(res, 'Invalid coupon');
  const now = new Date();
  if ((coupon.startDate && now < coupon.startDate) || (coupon.endDate && now > coupon.endDate)) return fail(res, 'Coupon is not currently active');
  if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) return fail(res, 'Coupon usage limit reached');
  if (itemTotal < Number(coupon.minimumOrderAmount || 0)) return fail(res, 'Minimum order amount not reached');
  let discount = coupon.discountType === 'PERCENTAGE' ? itemTotal * Number(coupon.discountValue) / 100 : Number(coupon.discountValue);
  if (coupon.maximumDiscount != null) discount = Math.min(discount, Number(coupon.maximumDiscount));
  return ok(res, { code: coupon.code, discount: Number(Math.min(Math.max(discount, 0), itemTotal).toFixed(2)) });
});
