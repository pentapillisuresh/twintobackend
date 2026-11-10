
const router = require("express").Router();

const orders = require("../../controllers/orderController");
const customers = require("../../controllers/customerController");
const settings = require("../../controllers/settingsController");
const payments = require("../../controllers/paymentController");

// FIX: Import authentication controller
const authController = require("../../controllers/authController");

const {
  auth,
  adminOnly,
} = require("../../middleware/auth");

// ==========================================
// DASHBOARD
// ==========================================

router.get(
  "/dashboard/stats",
  auth,
  adminOnly,
  orders.adminStats
);

// ==========================================
// ORDERS
// ==========================================

router.get(
  "/orders",
  auth,
  adminOnly,
  orders.adminOrders
);

router.get(
  "/orders/:id",
  auth,
  adminOnly,
  orders.adminOrderDetail
);

router.patch(
  "/orders/:id/status",
  auth,
  adminOnly,
  orders.updateOrderStatus
);

router.patch(
  "/orders/:id/assign",
  auth,
  adminOnly,
  orders.assignDeliveryPerson
);

router.get(
  "/orders/:id/whatsapp",
  auth,
  adminOnly,
  orders.whatsappOrder
);

// ==========================================
// ORDER PAYMENTS
// ==========================================

router.get(
  "/orders/:orderId/payments",
  auth,
  adminOnly,
  payments.getOrderPayments
);

// ==========================================
// CUSTOMERS
// ==========================================

router.get(
  "/customers",
  auth,
  adminOnly,
  customers.listCustomers
);

router.patch(
  "/customers/:id/status",
  auth,
  adminOnly,
  customers.updateCustomerStatus
);

// ==========================================
// FEE SETTINGS
// ==========================================

router.get(
  "/fee-settings",
  auth,
  adminOnly,
  settings.getFeeSettings
);

router.put(
  "/fee-settings",
  auth,
  adminOnly,
  settings.updateFeeSettings
);

// ==========================================
// ADMIN CHANGE PASSWORD
// ==========================================

router.put(
  "/change-password",
  auth,
  adminOnly,
  authController.adminChangePassword
);

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
