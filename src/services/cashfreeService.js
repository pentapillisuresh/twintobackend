
const crypto = require("crypto");
const { Op } = require("sequelize");

const { Order, Payment, db } = require("../models");

// =====================================================
// 1. CASHFREE ENVIRONMENT
// =====================================================

const env = () => {
  return String(process.env.CASHFREE_ENV || "sandbox").toLowerCase() ===
    "production"
    ? "production"
    : "sandbox";
};

const baseUrl = () => {
  return env() === "production"
    ? "https://api.cashfree.com/pg"
    : "https://sandbox.cashfree.com/pg";
};

const apiPrefix = () => {
  return process.env.API_PREFIX || "/api/v1";
};

// =====================================================
// 2. PUBLIC BACKEND URL
// =====================================================

function publicBase() {
  const value = String(process.env.PUBLIC_BACKEND_URL || "")
    .trim()
    .replace(/\/+$/, "");

  if (!/^https:\/\/[^/]+$/i.test(value)) {
    throw new Error(
      "PUBLIC_BACKEND_URL must be a public HTTPS URL. Use ngrok for local development."
    );
  }

  return value;
}

// =====================================================
// 3. CASHFREE API REQUEST
// =====================================================

async function cashfreeRequest(path, { method = "GET", body } = {}) {
  const appId = process.env.CASHFREE_APP_ID;
  const secretKey = process.env.CASHFREE_SECRET_KEY;

  if (!appId || !secretKey) {
    throw new Error("Cashfree credentials are not configured.");
  }

  const url = `${baseUrl()}${path}`;

  console.log("[CASHFREE] API Request:", {
    method,
    environment: env(),
    endpoint: path,
  });

  let response;

  try {
    response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-client-id": appId,
        "x-client-secret": secretKey,
        "x-api-version": process.env.CASHFREE_API_VERSION || "2025-01-01",
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    console.error("[CASHFREE] Network error:", error.message);

    const networkError = new Error(
      "Unable to connect to Cashfree. Please try again."
    );

    networkError.status = 502;
    networkError.code = "CASHFREE_NETWORK_ERROR";

    throw networkError;
  }

  const raw = await response.text();

  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!response.ok) {
    console.error("[CASHFREE] API Error:", {
      status: response.status,
      code: data.code,
      message: data.message,
      environment: env(),
      endpoint: path,
    });

    const error = new Error(
      data.message ||
        data.type ||
        `Cashfree API failed with status ${response.status}`
    );

    error.status = 502;
    error.cashfreeStatus = response.status;
    error.cashfreeCode = data.code;
    error.cashfreeResponse = data;

    throw error;
  }

  return data;
}

// =====================================================
// 4. SIGN CHECKOUT URL
// =====================================================

function signCheckout(orderId, expires) {
  const secret = process.env.CASHFREE_CHECKOUT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      "CASHFREE_CHECKOUT_SECRET must contain at least 32 characters."
    );
  }

  return crypto
    .createHmac("sha256", secret)
    .update(`${orderId}:${expires}`)
    .digest("hex");
}

// =====================================================
// 5. GENERATE CHECKOUT URL
// =====================================================

function checkoutUrl(orderId) {
  const expires = Date.now() + 15 * 60 * 1000;
  const signature = signCheckout(orderId, expires);

  const url = new URL(
    `${publicBase()}${apiPrefix()}/payments/checkout/${orderId}`
  );

  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", signature);

  return url.toString();
}

// =====================================================
// 6. VALIDATE CHECKOUT SIGNATURE
// =====================================================

function validCheckout(orderId, expires, signature) {
  const expiry = Number(expires);

  if (
    !Number.isSafeInteger(expiry) ||
    expiry <= Date.now() ||
    expiry > Date.now() + 16 * 60 * 1000
  ) {
    return false;
  }

  if (!/^[a-f0-9]{64}$/i.test(String(signature || ""))) {
    return false;
  }

  try {
    const expected = Buffer.from(signCheckout(orderId, expires), "hex");
    const actual = Buffer.from(signature, "hex");

    return (
      expected.length === actual.length &&
      crypto.timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}

// =====================================================
// 7. CREATE CASHFREE PAYMENT SESSION
// =====================================================

async function createCashfreeSession(order, user) {
  if (order.paymentMethod !== "CASHFREE") {
    throw new Error("Not a Cashfree order.");
  }

  if (!user?.id || !user?.mobile) {
    throw new Error(
      "Customer ID and mobile number are required for Cashfree."
    );
  }

  if (order.paymentStatus === "PAID") {
    throw new Error("This order is already paid.");
  }

  const payment = await Payment.findOne({
    where: {
      orderId: order.id,
      provider: "CASHFREE",
    },
  });

  if (!payment) {
    throw new Error("Cashfree payment record not found.");
  }

  const backendUrl = publicBase();
  const callbackBase = `${backendUrl}${apiPrefix()}`;

  // ---------------------------------------------------
  // REUSE ONLY A VALID ACTIVE CASHFREE SESSION
  // ---------------------------------------------------

  if (payment.cashfreeOrderId && payment.cashfreeSessionId) {
    try {
      const existingOrder = await cashfreeRequest(
        `/orders/${encodeURIComponent(payment.cashfreeOrderId)}`
      );

      if (existingOrder.order_id !== payment.cashfreeOrderId) {
        throw new Error("Cashfree order ID mismatch.");
      }

      const existingStatus = String(
        existingOrder.order_status || ""
      ).toUpperCase();

      if (existingStatus === "PAID") {
        await syncCashfreeOrder(order.id);
        throw new Error("This order is already paid.");
      }

      if (existingStatus === "ACTIVE") {
        console.log(
          "[CASHFREE] Reusing validated ACTIVE session:",
          payment.cashfreeOrderId
        );

        return {
          paymentSessionId: payment.cashfreeSessionId,
          cashfreeOrderId: payment.cashfreeOrderId,
          checkoutUrl: null,
          environment: env(),
        };
      }

      console.warn("[CASHFREE] Existing order is not ACTIVE:", {
        cashfreeOrderId: payment.cashfreeOrderId,
        status: existingStatus,
      });

      await payment.update({
        cashfreeOrderId: null,
        cashfreeSessionId: null,
        status: "PENDING",
      });
    } catch (error) {
      if (
        error.cashfreeStatus === 404 &&
        error.cashfreeCode === "order_not_found"
      ) {
        console.warn(
          "[CASHFREE] Stale order reference cleared:",
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
  } else if (payment.cashfreeOrderId || payment.cashfreeSessionId) {
    await payment.update({
      cashfreeOrderId: null,
      cashfreeSessionId: null,
      status: "PENDING",
    });
  }

  // ---------------------------------------------------
  // CREATE NEW CASHFREE ORDER
  // ---------------------------------------------------

  const cashfreeOrderReference =
    `twinto_${order.id}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;

  const result = await cashfreeRequest("/orders", {
    method: "POST",
    body: {
      order_id: cashfreeOrderReference,

      order_amount: Number(Number(order.total).toFixed(2)),

      order_currency: "INR",

      customer_details: {
        customer_id: String(user.id),
        customer_phone: String(user.mobile),

        ...(user.email
          ? {
              customer_email: user.email,
            }
          : {}),
      },

      order_meta: {
        return_url: `${callbackBase}/payments/return?order_id=${order.id}`,
        notify_url: `${callbackBase}/payments/webhook`,
      },

      order_note: `TWINTO ${order.orderNumber}`,
    },
  });

  if (!result.payment_session_id || !result.order_id) {
    console.error("[CASHFREE] Invalid session response:", result);

    throw new Error("Cashfree did not return a valid payment session.");
  }

  if (result.order_id !== cashfreeOrderReference) {
    throw new Error("Cashfree returned an unexpected order ID.");
  }

  // ---------------------------------------------------
  // SAVE CASHFREE DETAILS IN MYSQL
  // ---------------------------------------------------

  await payment.update({
    cashfreeOrderId: result.order_id,
    cashfreeSessionId: result.payment_session_id,
    status: "PENDING",
  });

  console.log("[CASHFREE] Payment session created:", {
    internalOrderId: order.id,
    cashfreeOrderId: result.order_id,
    environment: env(),
  });

  return {
    paymentSessionId: result.payment_session_id,
    cashfreeOrderId: result.order_id,

    // Native React Native SDK does not need a hosted checkout URL.
    checkoutUrl: null,

    environment: env(),
  };
}

// =====================================================
// 8. VERIFY CASHFREE ORDER STATUS
// =====================================================

async function syncCashfreeOrder(orderId) {
  const order = await Order.findByPk(orderId);

  if (!order) {
    throw new Error("Order not found.");
  }

  if (order.paymentMethod !== "CASHFREE") {
    return order;
  }

  const payment = await Payment.findOne({
    where: {
      orderId,
      provider: "CASHFREE",
    },
  });

  if (!payment) {
    throw new Error("Cashfree payment record not found.");
  }

  // No Cashfree reference means session creation has not happened yet.
  if (!payment.cashfreeOrderId) {
    console.log("[CASHFREE] No Cashfree order to verify yet:", {
      internalOrderId: orderId,
      paymentStatus: order.paymentStatus,
    });

    return order;
  }

  const data = await cashfreeRequest(
    `/orders/${encodeURIComponent(payment.cashfreeOrderId)}`
  );

  if (data.order_id !== payment.cashfreeOrderId) {
    throw new Error("Cashfree order ID mismatch.");
  }

  if (
    Number(data.order_amount) !== Number(order.total) ||
    data.order_currency !== "INR"
  ) {
    throw new Error("Cashfree amount or currency mismatch.");
  }

  const cashfreeStatus = String(data.order_status || "").toUpperCase();

  console.log("[CASHFREE] Payment status:", {
    internalOrderId: orderId,
    cashfreeOrderId: data.order_id,
    status: cashfreeStatus,
  });

  // ---------------------------------------------------
  // UPDATE DATABASE TRANSACTIONALLY
  // ---------------------------------------------------

  if (cashfreeStatus === "PAID") {
    await db.transaction(async (transaction) => {
      const lockedOrder = await Order.findByPk(orderId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (
        !lockedOrder ||
        lockedOrder.paymentMethod !== "CASHFREE"
      ) {
        throw new Error(
          "Order changed during payment verification."
        );
      }

      if (lockedOrder.status === "CANCELLED") {
        console.error(
          "[CASHFREE] Paid cancelled order needs manual refund review:",
          orderId
        );
      }

      if (lockedOrder.paymentStatus !== "PAID") {
        await lockedOrder.update(
          {
            paymentStatus: "PAID",
          },
          {
            transaction,
          }
        );
      }

      await Payment.update(
        {
          status: "PAID",
        },
        {
          where: {
            id: payment.id,
          },
          transaction,
        }
      );
    });
  } else if (cashfreeStatus === "EXPIRED") {
    await db.transaction(async (transaction) => {
      await Payment.update(
        {
          status: "FAILED",
        },
        {
          where: {
            id: payment.id,
            status: {
              [Op.ne]: "PAID",
            },
          },
          transaction,
        }
      );
    });
  }

  return Order.findByPk(orderId);
}

// =====================================================
// 9. VERIFY CASHFREE WEBHOOK SIGNATURE
// =====================================================

function verifyWebhookSignature(rawBody, timestamp, signature) {
  const secret = process.env.CASHFREE_SECRET_KEY;

  if (
    !secret ||
    !timestamp ||
    !signature ||
    !Buffer.isBuffer(rawBody)
  ) {
    return false;
  }

  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(
        Buffer.concat([
          Buffer.from(String(timestamp), "utf8"),
          rawBody,
        ])
      )
      .digest("base64");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const actualBuffer = Buffer.from(String(signature), "utf8");

    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  } catch (error) {
    console.error(
      "[CASHFREE] Webhook signature error:",
      error.message
    );

    return false;
  }
}

// =====================================================
// 10. EXPORTS
// =====================================================

module.exports = {
  cashfreeRequest,
  createCashfreeSession,
  syncCashfreeOrder,
  validCheckout,
  verifyWebhookSignature,
  env,
};
