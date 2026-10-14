const router = require('express').Router();
[
  './domains/auth.routes',
  './domains/catalog.routes',
  './domains/location.routes',
  './domains/cart.routes',
  './domains/coupon.routes',
  './domains/order.routes',
  './domains/payment.routes',
  './domains/admin.routes'
].forEach((routePath) => router.use(require(routePath)));
module.exports = router;
