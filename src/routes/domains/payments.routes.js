
const router = require('express').Router();

const controller = require(
  '../../controllers/paymentController'
);

const {
  auth
} = require('../../middleware/auth');

// Customer: verify payment.
router.post(
  '/verify',
  auth,
  controller.verifyPayment
);

// Customer: check payment status.
router.get(
  '/status/:orderId',
  auth,
  controller.getPaymentStatus
);

// Admin: payment history.
// Controller also checks req.user.role.
router.get(
  '/order/:orderId',
  auth,
  controller.getOrderPayments
);

// Public signed checkout link.
router.get(
  '/checkout/:id',
  controller.checkout
);

// Cashfree browser return.
router.get(
  '/return',
  controller.returnFromCashfree
);

// IMPORTANT:
// Do not add the webhook here if you
// already registered it in app.js
// before express.json().

module.exports = router;
