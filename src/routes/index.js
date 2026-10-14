const express = require("express");
const router = express.Router();

// Authentication APIs
router.use("/", require("./domains/auth.routes"));

// Catalog APIs
router.use("/categories", require("./domains/categories.routes"));
router.use("/products", require("./domains/products.routes"));

// Location and address APIs
router.use("/locations", require("./domains/locations.routes"));
router.use("/addresses", require("./domains/addresses.routes"));

// Shopping APIs
router.use("/cart", require("./domains/cart.routes"));
router.use("/coupons", require("./domains/coupons.routes"));

// Order and payment APIs
router.use("/orders", require("./domains/orders.routes"));
router.use("/payments", require("./domains/payments.routes"));

// Settings APIs — required for platform and delivery fees
router.use("/settings", require("./domains/settings.routes"));

// Admin APIs
router.use("/admin", require("./domains/admin.routes"));

module.exports = router;