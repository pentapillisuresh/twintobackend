
const router = require('express').Router();

const controller = require('../../controllers/orderController');
const { auth } = require('../../middleware/auth');

// Create order
router.post('/', auth, controller.createOrder);

// List customer orders
router.get('/', auth, controller.listMyOrders);

// Retry Cashfree payment
router.post(
  '/:id/retry-payment',
  auth,
  controller.retryCashfreePayment
);

// Get order details
router.get('/:id', auth, controller.getMyOrder);

// Cancel order
router.patch(
  '/:id/cancel',
  auth,
  controller.cancelMyOrder
);

module.exports = router;
