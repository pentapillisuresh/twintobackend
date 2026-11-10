
const { Op } = require("sequelize");
const crypto = require("crypto");

const {
  db,
  Address,
  Cart,
  CartItem,
  Product,
  Order,
  OrderItem,
  Payment,
  History,
  User,
} = require("../models");

const {
  getFees,
  calculateFees,
} = require("../services/feeService");

const {
  createCashfreeSession,
  syncCashfreeOrder,
} = require("../services/cashfreeService");

const { ok, fail } = require("../utils/response");

// ==========================================
// 1. COMMON HELPERS
// ==========================================

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function httpError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function validId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

function isOnlinePayment(order) {
  return order.paymentMethod === "CASHFREE";
}

function newOrderNumber() {
  return (
    "TW" +
    Date.now() +
    crypto.randomBytes(4).toString("hex").toUpperCase()
  );
}

const DELIVERY_STATUSES = [
  "PLACED",
  "PREPARING",
  "DELIVERED",
];

const ALL_STATUSES = [
  ...DELIVERY_STATUSES,
  "CANCELLED",
];

function isEligibleAdminOrder(order) {
  return (
    order.paymentMethod === "COD" ||
    (
      order.paymentMethod === "CASHFREE" &&
      order.paymentStatus === "PAID"
    )
  );
}

// Converts ordered packs into total quantity.
//
// 1kg x 2   -> 2 kg
// 500g x 3  -> 1.5 kg
// 250g x 2  -> 500 g
// 1L x 2    -> 2 L
// piece x 3 -> 3 pieces

function formatOrderedQuantity(unitValue, countValue) {
  const count = Number(countValue) || 0;
  const unit = String(unitValue || "").trim();

  if (!unit) {
    return `${count} ${count === 1 ? "item" : "items"}`;
  }

  const match = unit.match(
    /^(\d+(?:\.\d+)?)\s*(kg|g|gm|ml|l|ltr|litre|liter|pcs|pc|piece|pieces|pack|packs)$/i
  );

  if (!match) {
    const simpleUnit = unit.toLowerCase();

    if (
      ["piece", "pieces", "pc", "pcs"].includes(simpleUnit)
    ) {
      return `${count} ${count === 1 ? "piece" : "pieces"}`;
    }

    if (["pack", "packs"].includes(simpleUnit)) {
      return `${count} ${count === 1 ? "pack" : "packs"}`;
    }

    return `${count} x ${unit}`;
  }

  const amount = Number(match[1]) * count;
  const type = match[2].toLowerCase();

  if (type === "kg") {
    return `${amount} kg`;
  }

  if (type === "g" || type === "gm") {
    return amount >= 1000
      ? `${amount / 1000} kg`
      : `${amount} g`;
  }

  if (type === "ml") {
    return amount >= 1000
      ? `${amount / 1000} L`
      : `${amount} ml`;
  }

  if (["l", "ltr", "litre", "liter"].includes(type)) {
    return `${amount} L`;
  }

  if (
    ["pc", "pcs", "piece", "pieces"].includes(type)
  ) {
    return `${amount} ${amount === 1 ? "piece" : "pieces"}`;
  }

  if (["pack", "packs"].includes(type)) {
    return `${amount} ${amount === 1 ? "pack" : "packs"}`;
  }

  return `${count} x ${unit}`;
}

// ==========================================
// 2. CUSTOMER CART
// ==========================================

async function cartFor(userId, transaction) {
  const [cart] = await Cart.findOrCreate({
    where: { userId },
    defaults: { userId },
    ...(transaction ? { transaction } : {}),
  });

  return cart;
}

// ==========================================
// 3. COUPON DISCOUNT
// ==========================================

async function couponDiscount(code, itemTotal, transaction) {
  if (!code) {
    return {
      discount: 0,
      coupon: null,
    };
  }

  const { Coupon } = require("../models");

  const coupon = await Coupon.findOne({
    where: {
      code: String(code).trim().toUpperCase(),
      isActive: true,
    },
    transaction,
    lock: transaction
      ? transaction.LOCK.UPDATE
      : undefined,
  });

  if (!coupon) {
    throw httpError("Invalid coupon");
  }

  const now = new Date();

  if (coupon.startDate && now < coupon.startDate) {
    throw httpError("Coupon is not active yet");
  }

  if (coupon.endDate && now > coupon.endDate) {
    throw httpError("Coupon has expired");
  }

  if (
    coupon.usageLimit &&
    Number(coupon.usedCount) >= Number(coupon.usageLimit)
  ) {
    throw httpError("Coupon usage limit reached");
  }

  if (
    itemTotal <
    Number(coupon.minimumOrderAmount || 0)
  ) {
    throw httpError("Minimum order amount not reached");
  }

  let discount =
    coupon.discountType === "PERCENTAGE"
      ? (itemTotal * Number(coupon.discountValue)) / 100
      : Number(coupon.discountValue);

  if (
    coupon.maximumDiscount !== null &&
    coupon.maximumDiscount !== undefined
  ) {
    discount = Math.min(
      discount,
      Number(coupon.maximumDiscount)
    );
  }

  if (!Number.isFinite(discount)) {
    throw httpError("Invalid coupon discount");
  }

  return {
    discount: money(
      Math.min(Math.max(discount, 0), itemTotal)
    ),
    coupon,
  };
}

// ==========================================
// 4. CREATE ORDER
// COD + CASHFREE
// ==========================================

exports.createOrder = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const paymentMethod = body.paymentMethod || "COD";

  if (!["COD", "CASHFREE"].includes(paymentMethod)) {
    return fail(
      res,
      "Invalid payment method. Use COD or CASHFREE.",
      400
    );
  }

  const addressId = validId(body.addressId);

  if (!addressId) {
    return fail(res, "Valid delivery address required", 400);
  }

  const tip = Number(body.tip || 0);

  if (
    !Number.isFinite(tip) ||
    tip < 0 ||
    tip > 10000
  ) {
    return fail(res, "Invalid tip", 400);
  }

  let createdOrder = null;

  // Create local order records atomically.
  await db.transaction(async (transaction) => {
    const address = await Address.findOne({
      where: {
        id: addressId,
        userId: req.user.id,
        isActive: true,
      },
      transaction,
    });

    if (!address) {
      throw httpError("Valid delivery address required");
    }

    const cart = await cartFor(
      req.user.id,
      transaction
    );

    const items = await CartItem.findAll({
      where: { cartId: cart.id },
      include: [
        {
          model: Product,
          as: "product",
        },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!items.length) {
      throw httpError("Cart is empty");
    }

    let itemTotal = 0;
    let itemCount = 0;

    for (const item of items) {
      const quantity = Number(item.quantity);

      if (
        !Number.isSafeInteger(quantity) ||
        quantity <= 0
      ) {
        throw httpError("Invalid cart item quantity");
      }

      if (
        !item.product ||
        !item.product.isActive ||
        quantity > Number(item.product.stock)
      ) {
        throw httpError(
          `Product unavailable or stock insufficient: ${
            item.product?.name || ""
          }`,
          409
        );
      }

      const price = Number(item.product.price);

      if (
        !Number.isFinite(price) ||
        price < 0
      ) {
        throw httpError("Invalid product price", 409);
      }

      itemTotal += price * quantity;
      itemCount += quantity;
    }

    itemTotal = money(itemTotal);

    // Location-based fees.
    const feeSettings = await getFees(
      address.locationId,
      transaction
    );

    const minimumOrder = Number(
      feeSettings.minimumOrder
    );

    const calculatedFees = calculateFees(
      feeSettings,
      itemCount
    );

    const platformFee = calculatedFees.platformFee;
    const deliveryFee = calculatedFees.deliveryCharge;

    if (
      !Number.isFinite(minimumOrder) ||
      minimumOrder < 0 ||
      !Number.isFinite(platformFee) ||
      platformFee < 0 ||
      !Number.isFinite(deliveryFee) ||
      deliveryFee < 0
    ) {
      throw httpError(
        "Invalid location fee configuration",
        500
      );
    }

    if (itemTotal < minimumOrder) {
      throw httpError(
        `Minimum order amount is ₹${minimumOrder}. ` +
        `Your cart total is ₹${itemTotal}. ` +
        `Please add ₹${money(minimumOrder - itemTotal)} more.`,
        400
      );
    }

    // Coupon discount.
    const couponResult = await couponDiscount(
      body.couponCode,
      itemTotal,
      transaction
    );

    const total = money(
      Math.max(
        0,
        itemTotal +
          platformFee +
          deliveryFee -
          couponResult.discount +
          tip
      )
    );

    if (!Number.isFinite(total)) {
      throw httpError("Invalid order total", 500);
    }

    if (
      paymentMethod === "CASHFREE" &&
      total <= 0
    ) {
      throw httpError(
        "Cashfree payment amount must be greater than zero"
      );
    }

    // Create order.
    createdOrder = await Order.create(
      {
        orderNumber: newOrderNumber(),
        userId: req.user.id,
        addressId: address.id,
        addressSnapshot: address.toJSON(),
        itemTotal,
        platformFee: money(platformFee),
        deliveryPartnerFee: money(deliveryFee),
        discount: couponResult.discount,
        tip: money(tip),
        total,
        couponCode: couponResult.coupon?.code || null,
        paymentMethod,
        paymentStatus: "PENDING",
        status: "PLACED",
        sendAddressToAdmin: Boolean(
          body.sendAddressToAdmin
        ),
        notes: body.notes || null,
        stockCommitted: false,
      },
      { transaction }
    );

    // Save each order item with its product unit.
    for (const item of items) {
      const quantity = Number(item.quantity);
      const price = Number(item.product.price);

      await OrderItem.create(
        {
          orderId: createdOrder.id,
          productId: item.product.id,
          productName: item.product.name,
          productImage: item.product.image,
          productUnit: item.product.unit || null,
          price,
          quantity,
          subtotal: money(price * quantity),
        },
        { transaction }
      );
    }

    // Initial order history.
    await History.create(
      {
        orderId: createdOrder.id,
        status: "PLACED",
        note: "Order placed by customer",
        changedBy: req.user.id,
      },
      { transaction }
    );

    // Increment coupon usage.
    if (couponResult.coupon) {
      await couponResult.coupon.increment(
        "usedCount",
        {
          by: 1,
          transaction,
        }
      );
    }

    // Create payment record.
    await Payment.create(
      {
        orderId: createdOrder.id,
        provider: paymentMethod,
        amount: total,
        currency: "INR",
        status: "PENDING",
      },
      { transaction }
    );

    // Clear cart after order creation.
    await CartItem.destroy({
      where: { cartId: cart.id },
      transaction,
    });
  });

  // Create Cashfree session after local order creation.
  let cashfree = null;

  if (paymentMethod === "CASHFREE") {
    try {
      cashfree = await createCashfreeSession(
        createdOrder,
        req.user
      );
    } catch (error) {
      console.error(
        "Cashfree session creation failed:",
        {
          orderId: createdOrder.id,
          message: error.message,
        }
      );

      // Local order exists. Return its ID for payment retry.
      const savedOrder = await Order.findByPk(
        createdOrder.id,
        {
          include: [
            {
              model: OrderItem,
              as: "items",
            },
          ],
        }
      );

      return ok(
        res,
        {
          order: savedOrder,
          cashfree: null,
          retryRequired: true,
        },
        "Order created. Cashfree payment can be retried.",
        201
      );
    }
  }

  const savedOrder = await Order.findByPk(
    createdOrder.id,
    {
      include: [
        {
          model: OrderItem,
          as: "items",
        },
      ],
    }
  );

  return ok(
    res,
    {
      order: savedOrder,
      cashfree,
    },
    "Order created",
    201
  );
});

// ==========================================
// 5. LIST MY ORDERS
// ==========================================

exports.listMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.findAll({
    where: {
      userId: req.user.id,
    },
    include: [
      {
        model: OrderItem,
        as: "items",
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return ok(res, orders);
});

// ==========================================
// 6. GET MY ORDER DETAILS
// ==========================================

exports.getMyOrder = asyncHandler(async (req, res) => {
  const orderId = validId(req.params.id);

  if (!orderId) {
    return fail(res, "Invalid order ID", 400);
  }

  const row = await Order.findOne({
    where: {
      id: orderId,
      userId: req.user.id,
    },
    include: [
      {
        model: OrderItem,
        as: "items",
      },
      {
        model: Payment,
        as: "payments",
      },
      {
        model: History,
        as: "history",
      },
    ],
  });

  if (!row) {
    return fail(res, "Order not found", 404);
  }

  const data = row.toJSON();
  data.address = data.addressSnapshot;

  return ok(res, data);
});

// ==========================================
// 7. CUSTOMER CANCEL ORDER
// ==========================================

exports.cancelMyOrder = asyncHandler(async (req, res) => {
  const orderId = validId(req.params.id);

  if (!orderId) {
    return fail(res, "Invalid order ID", 400);
  }

  let row = await Order.findOne({
    where: {
      id: orderId,
      userId: req.user.id,
    },
  });

  if (!row) {
    return fail(res, "Order not found", 404);
  }

  // Customer cancellation only before preparation.
  if (row.status !== "PLACED") {
    return fail(
      res,
      "Order can no longer be cancelled",
      409
    );
  }

  // Never cancel a verified paid order without a refund workflow.
  // For unpaid Cashfree orders, check the provider only
  // when a Cashfree reference exists.

  if (
    isOnlinePayment(row) &&
    row.paymentStatus !== "PAID"
  ) {
    const payment = await Payment.findOne({
      where: {
        orderId: row.id,
        provider: "CASHFREE",
      },
    });

    if (payment?.cashfreeOrderId) {
      row = await syncCashfreeOrder(row.id);
    }
  }

  if (row.paymentStatus === "PAID") {
    return fail(
      res,
      "Paid order requires refund workflow",
      409
    );
  }

  await db.transaction(async (transaction) => {
    const locked = await Order.findByPk(
      orderId,
      {
        transaction,
        lock: transaction.LOCK.UPDATE,
      }
    );

    if (
      !locked ||
      locked.userId !== req.user.id
    ) {
      throw httpError("Order not found", 404);
    }

    if (locked.status !== "PLACED") {
      throw httpError(
        "Order can no longer be cancelled",
        409
      );
    }

    if (locked.paymentStatus === "PAID") {
      throw httpError(
        "Paid order requires refund workflow",
        409
      );
    }

    await locked.update(
      {
        status: "CANCELLED",
        cancelledAt: new Date(),
      },
      { transaction }
    );

    await History.create(
      {
        orderId: locked.id,
        status: "CANCELLED",
        note: "Cancelled by customer",
        changedBy: req.user.id,
      },
      { transaction }
    );
  });

  const updated = await Order.findByPk(orderId);

  return ok(res, updated, "Order cancelled");
});

// ==========================================
// 8. ADMIN STATISTICS
// ==========================================

exports.adminStats = asyncHandler(async (req, res) => {
  const totalOrders = await Order.count();

  const totalCustomers = await User.count({
    where: {
      role: "user",
    },
  });

  const totalSales =
    (await Order.sum("total", {
      where: {
        status: {
          [Op.ne]: "CANCELLED",
        },
      },
    })) || 0;

  const paidSales =
    (await Order.sum("total", {
      where: {
        paymentStatus: "PAID",
      },
    })) || 0;

  const statusCounts = {};

  for (const status of ALL_STATUSES) {
    statusCounts[status] = await Order.count({
      where: { status },
    });
  }

  return ok(res, {
    totalOrders,
    totalCustomers,
    totalSales: Number(totalSales),
    paidSales: Number(paidSales),
    statusCounts,
  });
});

// ==========================================
// 9. ADMIN ORDER LIST
// COD + PAID CASHFREE
// ==========================================

exports.adminOrders = asyncHandler(async (req, res) => {
  const where = {
    [Op.or]: [
      {
        paymentMethod: "COD",
      },
      {
        paymentMethod: "CASHFREE",
        paymentStatus: "PAID",
      },
    ],
  };

  if (req.query.status) {
    if (!ALL_STATUSES.includes(req.query.status)) {
      return fail(
        res,
        "Invalid order status",
        400
      );
    }

    where.status = req.query.status;
  }

  if (req.query.search) {
    where.orderNumber = {
      [Op.like]:
        `%${String(req.query.search).slice(0, 80)}%`,
    };
  }

  const requestedLimit = Number(
    req.query.limit || 100
  );

  const requestedOffset = Number(
    req.query.offset || 0
  );

  const limit = Number.isSafeInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 200)
    : 100;

  const offset = Number.isSafeInteger(requestedOffset)
    ? Math.max(requestedOffset, 0)
    : 0;

  const orders = await Order.findAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "id",
          "name",
          "mobile",
          "email",
        ],
      },
      {
        model: OrderItem,
        as: "items",
      },
    ],
  });

  return ok(res, {
    orders,
    limit,
    offset,
  });
});

// ==========================================
// 10. ADMIN ORDER DETAIL
// ==========================================

exports.adminOrderDetail = asyncHandler(async (req, res) => {
  const orderId = validId(req.params.id);

  if (!orderId) {
    return fail(res, "Invalid order ID", 400);
  }

  const row = await Order.findByPk(orderId, {
    include: [
      {
        model: User,
        as: "user",
        attributes: [
          "id",
          "name",
          "mobile",
          "email",
        ],
      },
      {
        model: OrderItem,
        as: "items",
      },
      {
        model: Payment,
        as: "payments",
      },
      {
        model: History,
        as: "history",
      },
    ],
  });

  if (!row) {
    return fail(res, "Order not found", 404);
  }

  const data = row.toJSON();
  data.address = data.addressSnapshot;

  return ok(res, data);
});

// ==========================================
// 11. ADMIN UPDATE ORDER STATUS
// DIRECT THREE-STATUS UPDATE
// ==========================================

exports.updateOrderStatus = asyncHandler(
  async (req, res) => {
    const orderId = validId(req.params.id);

    if (!orderId) {
      return fail(res, "Invalid order ID", 400);
    }

    const nextStatus = req.body?.status;

    if (!DELIVERY_STATUSES.includes(nextStatus)) {
      return fail(
        res,
        "Invalid order status. Use PLACED, PREPARING or DELIVERED.",
        400
      );
    }

    let row = await Order.findByPk(orderId);

    if (!row) {
      return fail(res, "Order not found", 404);
    }

    if (row.status === "CANCELLED") {
      return fail(
        res,
        "Cancelled orders cannot be updated",
        409
      );
    }

    // Already-verified paid Cashfree orders
    // do not require another Cashfree lookup.
    //
    // This assumes PAID is set only by trusted
    // server-side Cashfree verification.

    if (
      isOnlinePayment(row) &&
      row.paymentStatus !== "PAID"
    ) {
      const payment = await Payment.findOne({
        where: {
          orderId: row.id,
          provider: "CASHFREE",
        },
      });

      if (payment?.cashfreeOrderId) {
        row = await syncCashfreeOrder(row.id);
      }
    }

    if (
      isOnlinePayment(row) &&
      row.paymentStatus !== "PAID"
    ) {
      return fail(
        res,
        "Online payment must be verified before updating order status",
        409
      );
    }

    if (!isEligibleAdminOrder(row)) {
      return fail(
        res,
        "Only COD and paid Cashfree orders can be updated",
        409
      );
    }

    await db.transaction(async (transaction) => {
      const locked = await Order.findByPk(
        orderId,
        {
          transaction,
          lock: transaction.LOCK.UPDATE,
        }
      );

      if (!locked) {
        throw httpError("Order not found", 404);
      }

      if (locked.status === "CANCELLED") {
        throw httpError(
          "Cancelled orders cannot be updated",
          409
        );
      }

      if (!isEligibleAdminOrder(locked)) {
        throw httpError(
          "Order payment is not eligible for fulfilment",
          409
        );
      }

      // No sequential transition restriction.
      // PLACED -> DELIVERED is allowed.
      // DELIVERED -> PREPARING is allowed
      // when correcting a mistaken status.

      if (locked.status === nextStatus) {
        return;
      }

      await locked.update(
        {
          status: nextStatus,
          deliveredAt:
            nextStatus === "DELIVERED"
              ? new Date()
              : null,
          cancelledAt: null,
        },
        { transaction }
      );

      await History.create(
        {
          orderId: locked.id,
          status: nextStatus,
          note: `Updated by admin ${req.user.id}`,
          changedBy: req.user.id,
        },
        { transaction }
      );
    });

    const updatedOrder = await Order.findByPk(
      orderId,
      {
        include: [
          {
            model: OrderItem,
            as: "items",
          },
        ],
      }
    );

    return ok(
      res,
      updatedOrder,
      "Order status updated"
    );
  }
);

// ==========================================
// 12. ASSIGN DELIVERY PERSON
// ==========================================

exports.assignDeliveryPerson = asyncHandler(
  async (req, res) => {
    const orderId = validId(req.params.id);

    if (!orderId) {
      return fail(res, "Invalid order ID", 400);
    }

    const name = String(
      req.body?.assignedPersonName || ""
    ).trim();

    const mobile = String(
      req.body?.assignedPersonMobile || ""
    ).replace(/[^\d+]/g, "");

    if (
      !name ||
      mobile.replace(/\D/g, "").length < 10
    ) {
      return fail(
        res,
        "Valid delivery person name and mobile required",
        400
      );
    }

    const row = await Order.findByPk(orderId);

    if (!row) {
      return fail(res, "Order not found", 404);
    }

    if (
      ["DELIVERED", "CANCELLED"].includes(row.status)
    ) {
      return fail(
        res,
        "Cannot assign closed order",
        409
      );
    }

    await row.update({
      assignedPersonName: name,
      assignedPersonMobile: mobile,
      assignedAt: new Date(),
    });

    return ok(
      res,
      row,
      "Delivery person assigned"
    );
  }
);

// ==========================================
// 13. RETRY CASHFREE PAYMENT
// POST /orders/:id/retry-payment
// ==========================================

exports.retryCashfreePayment = asyncHandler(
  async (req, res) => {
    const orderId = validId(req.params.id);

    if (!orderId) {
      return fail(res, "Invalid order ID", 400);
    }

    const order = await Order.findOne({
      where: {
        id: orderId,
        userId: req.user.id,
        paymentMethod: "CASHFREE",
      },
    });

    if (!order) {
      return fail(
        res,
        "Cashfree order not found",
        404
      );
    }

    if (order.status === "CANCELLED") {
      return fail(
        res,
        "Cancelled orders cannot be paid",
        409
      );
    }

    if (order.paymentStatus === "PAID") {
      return ok(
        res,
        {
          order,
          orderId: order.id,
          paymentStatus: "PAID",
          isPaid: true,
          cashfree: null,
        },
        "Order is already paid"
      );
    }

    const payment = await Payment.findOne({
      where: {
        orderId: order.id,
        provider: "CASHFREE",
      },
    });

    if (!payment) {
      return fail(
        res,
        "Cashfree payment record not found",
        404
      );
    }

    // Verify only when a real Cashfree reference exists.
    if (payment.cashfreeOrderId) {
      try {
        const verifiedOrder = await syncCashfreeOrder(
          order.id
        );

        if (
          verifiedOrder.paymentStatus === "PAID"
        ) {
          return ok(
            res,
            {
              order: verifiedOrder,
              orderId: verifiedOrder.id,
              paymentStatus: "PAID",
              isPaid: true,
              cashfree: null,
            },
            "Order is already paid"
          );
        }
      } catch (error) {
        if (
          error.cashfreeStatus === 404 &&
          error.cashfreeCode === "order_not_found"
        ) {
          console.warn(
            "[RETRY PAYMENT] Clearing stale Cashfree order:",
            payment.cashfreeOrderId
          );

          await payment.update({
            cashfreeOrderId: null,
            cashfreeSessionId: null,
            status: "PENDING",
          });
        } else {
          throw error;
        }
      }
    }

    const latestOrder = await Order.findByPk(
      orderId
    );

    if (
      !latestOrder ||
      latestOrder.status === "CANCELLED"
    ) {
      return fail(
        res,
        "Order is not available for payment",
        409
      );
    }

    const cashfree = await createCashfreeSession(
      latestOrder,
      req.user
    );

    if (
      !cashfree ||
      !cashfree.paymentSessionId ||
      !cashfree.cashfreeOrderId ||
      !cashfree.environment
    ) {
      return fail(
        res,
        "Cashfree did not return complete payment session details",
        502
      );
    }

    return ok(
      res,
      {
        order: latestOrder,
        orderId: latestOrder.id,
        paymentStatus: latestOrder.paymentStatus,
        isPaid: false,
        cashfree: {
          paymentSessionId:
            cashfree.paymentSessionId,
          cashfreeOrderId:
            cashfree.cashfreeOrderId,
          environment:
            cashfree.environment,
        },
      },
      "Cashfree payment session ready"
    );
  }
);

// ==========================================
// 14. WHATSAPP ORDER SHARING
// ==========================================

exports.whatsappOrder = asyncHandler(
  async (req, res) => {
    const orderId = validId(req.params.id);

    if (!orderId) {
      return fail(res, "Invalid order ID", 400);
    }

    const row = await Order.findByPk(
      orderId,
      {
        include: [
          {
            model: User,
            as: "user",
          },
          {
            model: OrderItem,
            as: "items",
          },
        ],
      }
    );

    if (!row) {
      return fail(res, "Order not found", 404);
    }

    const a = row.addressSnapshot || {};

    // Display total product quantity with unit.
    //
    // Product unit: 1kg
    // Ordered quantity: 2
    // WhatsApp: banana - 2 kg

    const items = row.items
      .map((item) => {
        const quantityText = formatOrderedQuantity(
          item.productUnit,
          item.quantity
        );

        return `${item.productName} - ${quantityText}`;
      })
      .join("\n");

    const message = [
      `TWINTO Order ${row.orderNumber}`,

      `Customer: ${
        row.user?.name || ""
      } (${
        row.user?.mobile || ""
      })`,

      `Delivery: ${
        a.name || ""
      }, ${
        a.addressLine1 || ""
      } ${
        a.addressLine2 || ""
      }, ${
        a.city || ""
      }, ${
        a.state || ""
      } ${
        a.pincode || ""
      }`,

      `Items:\n${items}`,

      `Total: ₹${row.total}`,

      `Payment Method: ${row.paymentMethod}`,

      `Payment Status: ${row.paymentStatus}`,

      `Assigned: ${
        row.assignedPersonName || "Not assigned"
      } ${
        row.assignedPersonMobile || ""
      }`,

      `Status: ${row.status}`,
    ].join("\n");

    const number = String(
      row.assignedPersonMobile ||
      row.user?.mobile ||
      ""
    ).replace(/\D/g, "");

    return ok(res, {
      whatsappUrl:
        `https://wa.me/${number}` +
        `?text=${encodeURIComponent(message)}`,
      message,
    });
  }
);
