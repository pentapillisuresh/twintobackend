
const crypto = require('crypto');

const {
  Order,
  Payment
} = require('../models');

const {
  ok,
  fail
} = require('../utils/response');

const {
  createCashfreeSession,
  syncCashfreeOrder,
  validCheckout,
  verifyWebhookSignature,
  env
} = require('../services/cashfreeService');

// ==========================================
// 1. ASYNC ERROR HANDLER
// ==========================================

const asyncHandler = (fn) =>
  (req, res, next) =>
    Promise.resolve(
      fn(req, res, next)
    ).catch(next);

// ==========================================
// 2. VALIDATE ORDER ID
// ==========================================

function validOrderId(value) {
  const id = Number(value);

  if (
    !Number.isSafeInteger(id) ||
    id <= 0
  ) {
    return null;
  }

  return id;
}

// ==========================================
// 3. SAFE ERROR PAGE
// ==========================================

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function paymentPage({
  title,
  message,
  status = 'pending'
}) {
  const color =
    status === 'success'
      ? '#16a34a'
      : status === 'failed'
        ? '#dc2626'
        : '#f59e0b';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>${escapeHtml(title)} - TWINTO</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f8fafc;
      font-family: Arial, sans-serif;
      color: #0f172a;
    }

    .card {
      width: 92%;
      max-width: 430px;
      padding: 32px 24px;
      background: #ffffff;
      border-radius: 18px;
      box-shadow: 0 10px 35px rgba(0,0,0,.08);
      text-align: center;
    }

    .status {
      width: 65px;
      height: 65px;
      margin: 0 auto 20px;
      border-radius: 50%;
      background: ${color};
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      font-weight: bold;
    }

    h1 {
      margin: 0 0 14px;
      font-size: 24px;
    }

    p {
      font-size: 15px;
      color: #475569;
      line-height: 1.7;
    }

    .brand {
      margin-top: 24px;
      font-size: 13px;
      color: #64748b;
    }
  </style>
</head>

<body>
  <div class="card">
    <div class="status">
      ${
        status === 'success'
          ? '&#10003;'
          : status === 'failed'
            ? '&#10005;'
            : '!'
      }
    </div>

    <h1>${escapeHtml(title)}</h1>

    <p>${escapeHtml(message)}</p>

    <div class="brand">
      TWINTO Grocery Delivery
    </div>
  </div>
</body>
</html>`;
}

function sendPaymentPage(
  res,
  {
    title,
    message,
    status = 'pending',
    httpStatus = 200
  }
) {
  res.set({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
  });

  return res.status(httpStatus).send(
    paymentPage({
      title,
      message,
      status
    })
  );
}

// ==========================================
// 4. VERIFY CASHFREE PAYMENT
// POST /payments/verify
// Authentication required
// ==========================================

exports.verifyPayment = asyncHandler(
  async (req, res) => {
    const orderId = validOrderId(
      req.body?.orderId
    );

    if (!orderId) {
      return fail(
        res,
        'Valid order ID required',
        400
      );
    }

    const order = await Order.findOne({
      where: {
        id: orderId,
        userId: req.user.id,
        paymentMethod: 'CASHFREE'
      }
    });

    if (!order) {
      return fail(
        res,
        'Cashfree order not found',
        404
      );
    }

    // Always verify through Cashfree API.
    // Never trust a success flag from the app.
    const updatedOrder =
      await syncCashfreeOrder(order.id);

    return ok(
      res,
      {
        orderId: updatedOrder.id,
        paymentMethod:
          updatedOrder.paymentMethod,
        paymentStatus:
          updatedOrder.paymentStatus,
        orderStatus:
          updatedOrder.status,
        isPaid:
          updatedOrder.paymentStatus ===
          'PAID'
      },
      'Payment status verified'
    );
  }
);

// ==========================================
// 5. CUSTOMER PAYMENT STATUS
// GET /payments/status/:orderId
// Authentication required
// ==========================================

exports.getPaymentStatus = asyncHandler(
  async (req, res) => {
    const orderId = validOrderId(
      req.params.orderId
    );

    if (!orderId) {
      return fail(
        res,
        'Valid order ID required',
        400
      );
    }

    const order = await Order.findOne({
      where: {
        id: orderId,
        userId: req.user.id
      }
    });

    if (!order) {
      return fail(
        res,
        'Order not found',
        404
      );
    }

    const updatedOrder =
      order.paymentMethod === 'CASHFREE'
        ? await syncCashfreeOrder(order.id)
        : order;

    return ok(res, {
      orderId: updatedOrder.id,
      orderNumber:
        updatedOrder.orderNumber,
      paymentMethod:
        updatedOrder.paymentMethod,
      paymentStatus:
        updatedOrder.paymentStatus,
      orderStatus:
        updatedOrder.status,
      isPaid:
        updatedOrder.paymentStatus ===
        'PAID'
    });
  }
);

// ==========================================
// 6. ADMIN PAYMENT HISTORY
// GET /payments/order/:orderId
// Admin authentication required in routes
// ==========================================

exports.getOrderPayments = asyncHandler(
  async (req, res) => {
    // Defense in depth:
    // the route must ALSO use admin middleware.
    if (
      !req.user ||
      req.user.role !== 'admin'
    ) {
      return fail(
        res,
        'Admin access required',
        403
      );
    }

    const orderId = validOrderId(
      req.params.orderId
    );

    if (!orderId) {
      return fail(
        res,
        'Valid order ID required',
        400
      );
    }

    const order = await Order.findByPk(
      orderId
    );

    if (!order) {
      return fail(
        res,
        'Order not found',
        404
      );
    }

    const payments = await Payment.findAll({
      where: {
        orderId: order.id
      },
      order: [
        ['createdAt', 'DESC']
      ]
    });

    return ok(
      res,
      payments,
      'Payment history retrieved'
    );
  }
);

// ==========================================
// 7. CASHFREE CHECKOUT
// GET /payments/checkout/:id
//
// This route is accessed through a signed,
// time-limited checkout URL.
//
// No customer JWT is required because the
// URL contains a validated HMAC signature.
// ==========================================

exports.checkout = asyncHandler(
  async (req, res) => {
    const orderId = validOrderId(
      req.params.id
    );

    if (!orderId) {
      return sendPaymentPage(res, {
        title: 'Invalid Order',
        message:
          'The payment order ID is invalid.',
        status: 'failed',
        httpStatus: 400
      });
    }

    const expires = req.query.expires;
    const signature = req.query.sig;

    if (
      !validCheckout(
        orderId,
        expires,
        signature
      )
    ) {
      return sendPaymentPage(res, {
        title: 'Payment Link Expired',
        message:
          'This payment link is invalid or expired. Please return to TWINTO and try again.',
        status: 'failed',
        httpStatus: 403
      });
    }

    const order = await Order.findByPk(
      orderId
    );

    if (
      !order ||
      order.paymentMethod !== 'CASHFREE'
    ) {
      return sendPaymentPage(res, {
        title: 'Order Not Found',
        message:
          'The Cashfree order could not be found.',
        status: 'failed',
        httpStatus: 404
      });
    }

    if (order.status === 'CANCELLED') {
      return sendPaymentPage(res, {
        title: 'Order Cancelled',
        message:
          'This order has been cancelled. Payment is not available.',
        status: 'failed',
        httpStatus: 409
      });
    }

    if (order.paymentStatus === 'PAID') {
      return sendPaymentPage(res, {
        title: 'Already Paid',
        message:
          'Payment has already been completed for this order.',
        status: 'success'
      });
    }

    const payment = await Payment.findOne({
      where: {
        orderId: order.id,
        provider: 'CASHFREE'
      }
    });

    if (
      !payment ||
      !payment.cashfreeSessionId
    ) {
      return sendPaymentPage(res, {
        title: 'Payment Unavailable',
        message:
          'The payment session is not ready. Please try again from the app.',
        status: 'failed',
        httpStatus: 409
      });
    }

    // Refresh status before showing checkout.
    const updatedOrder =
      await syncCashfreeOrder(order.id);

    if (
      updatedOrder.paymentStatus ===
      'PAID'
    ) {
      return sendPaymentPage(res, {
        title: 'Payment Successful',
        message:
          'Your order has already been paid.',
        status: 'success'
      });
    }

    const sessionId =
      JSON.stringify(
        payment.cashfreeSessionId
      );

    const mode =
      JSON.stringify(
        env() === 'production'
          ? 'production'
          : 'sandbox'
      );

    // Render Cashfree hosted checkout.
    // Session ID is intentionally provided
    // to Cashfree's browser SDK.
    //
    // Do not expose CASHFREE_SECRET_KEY.

    res.set({
      'Content-Type':
        'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; " +
        "script-src https://sdk.cashfree.com 'unsafe-inline'; " +
        "connect-src https://*.cashfree.com; " +
        "frame-src https://*.cashfree.com; " +
        "style-src 'unsafe-inline'; " +
        "base-uri 'none'; " +
        "form-action https://*.cashfree.com"
    });

    return res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />

  <title>TWINTO Secure Payment</title>

  <script
    src="https://sdk.cashfree.com/js/v3/cashfree.js">
  </script>

  <style>
    body {
      margin: 0;
      font-family: Arial, sans-serif;
      background: #f8fafc;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .card {
      background: white;
      padding: 32px 24px;
      max-width: 420px;
      width: 90%;
      border-radius: 16px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,.08);
    }

    button {
      padding: 14px 25px;
      background: #16a34a;
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 16px;
      cursor: pointer;
    }

    p {
      color: #64748b;
      line-height: 1.6;
    }
  </style>
</head>

<body>
  <div class="card">
    <h2>TWINTO Secure Checkout</h2>

    <p>
      Complete your payment securely
      using Cashfree.
    </p>

    <button
      id="payButton"
      type="button">
      Pay Now
    </button>

    <p id="message">
      Preparing secure payment...
    </p>
  </div>

  <script>
    (function () {
      const button =
        document.getElementById('payButton');

      const message =
        document.getElementById('message');

      const paymentSessionId =
        ${sessionId};

      const cashfreeMode =
        ${mode};

      let started = false;

      async function startPayment() {
        if (started) return;

        started = true;
        button.disabled = true;

        message.textContent =
          'Opening Cashfree payment...';

        try {
          if (
            typeof window.Cashfree !==
            'function'
          ) {
            throw new Error(
              'Cashfree SDK could not load'
            );
          }

          const cashfree =
            window.Cashfree({
              mode: cashfreeMode
            });

          const result =
            await cashfree.checkout({
              paymentSessionId:
                paymentSessionId,
              redirectTarget: '_self'
            });

          if (result && result.error) {
            throw new Error(
              'Unable to start payment'
            );
          }
        } catch (error) {
          started = false;
          button.disabled = false;

          message.textContent =
            'Unable to open payment. Please try again.';
        }
      }

      button.addEventListener(
        'click',
        startPayment
      );

      message.textContent =
        'Click Pay Now to continue.';
    })();
  </script>
</body>
</html>
    `);
  }
);

// ==========================================
// 8. CASHFREE PAYMENT RETURN
// GET /payments/return?order_id=123
//
// Cashfree redirects the browser here.
//
// IMPORTANT:
// A redirect does not prove payment.
// We verify using Cashfree's API.
// ==========================================

exports.returnFromCashfree = asyncHandler(
  async (req, res) => {
    const orderId = validOrderId(
      req.query.order_id
    );

    if (!orderId) {
      return sendPaymentPage(res, {
        title: 'Invalid Payment Return',
        message:
          'The payment return URL is invalid.',
        status: 'failed',
        httpStatus: 400
      });
    }

    const order = await Order.findByPk(
      orderId
    );

    if (
      !order ||
      order.paymentMethod !== 'CASHFREE'
    ) {
      return sendPaymentPage(res, {
        title: 'Order Not Found',
        message:
          'The Cashfree order could not be found.',
        status: 'failed',
        httpStatus: 404
      });
    }

    try {
      const updatedOrder =
        await syncCashfreeOrder(
          order.id
        );

      if (
        updatedOrder.paymentStatus ===
        'PAID'
      ) {
        return sendPaymentPage(res, {
          title: 'Payment Successful',
          message:
            `Your TWINTO order ${order.orderNumber} has been paid successfully. You can return to the app.`,
          status: 'success'
        });
      }

      if (
        updatedOrder.paymentStatus ===
        'FAILED'
      ) {
        return sendPaymentPage(res, {
          title: 'Payment Failed',
          message:
            'Your payment was not completed. Please return to the app to check the order.',
          status: 'failed'
        });
      }

      return sendPaymentPage(res, {
        title: 'Payment Pending',
        message:
          'We have not received payment confirmation yet. Please return to the app and check your order status.',
        status: 'pending'
      });
    } catch (error) {
      console.error(
        'Cashfree return verification failed:',
        error.message
      );

      return sendPaymentPage(res, {
        title: 'Verification Pending',
        message:
          'We could not confirm your payment right now. Please check your order in the app. Do not pay again until its status is confirmed.',
        status: 'pending',
        httpStatus: 503
      });
    }
  }
);

// ==========================================
// 9. CASHFREE WEBHOOK
// POST /payments/webhook
//
// Must receive RAW application/json body.
// Do not apply express.json() before it.
//
// No customer JWT authentication.
// Cashfree authenticates using signature.
// ==========================================

exports.webhook = asyncHandler(
  async (req, res) => {
    const timestamp =
      req.get('x-webhook-timestamp');

    const signature =
      req.get('x-webhook-signature');

    if (!Buffer.isBuffer(req.body)) {
      return res.status(400).json({
        success: false,
        message:
          'Raw webhook body required'
      });
    }

    const validSignature =
      verifyWebhookSignature(
        req.body,
        timestamp,
        signature
      );

    if (!validSignature) {
      return res.status(401).json({
        success: false,
        message:
          'Invalid webhook signature'
      });
    }

    let event;

    try {
      event = JSON.parse(
        req.body.toString('utf8')
      );
    } catch {
      return res.status(400).json({
        success: false,
        message:
          'Invalid webhook JSON'
      });
    }

    const cashfreeOrderId =
      event?.data?.order?.order_id;

    if (
      typeof cashfreeOrderId !==
        'string'
    ) {
      return res.status(400).json({
        success: false,
        message:
          'Cashfree order ID missing'
      });
    }

    const payment = await Payment.findOne({
      where: {
        provider: 'CASHFREE',
        cashfreeOrderId
      }
    });

    if (!payment) {
      // Unknown order: do not update anything.
      console.error(
        'Cashfree webhook order not found'
      );

      return res.status(404).json({
        success: false,
        message:
          'Payment record not found'
      });
    }

    const order = await Order.findByPk(
      payment.orderId
    );

    if (
      !order ||
      order.paymentMethod !== 'CASHFREE'
    ) {
      return res.status(404).json({
        success: false,
        message:
          'Cashfree order not found'
      });
    }

    // Never mark an order PAID solely
    // from the webhook JSON.
    //
    // Query Cashfree's API for its
    // authoritative order status.
    const updatedOrder =
      await syncCashfreeOrder(order.id);

    return res.status(200).json({
      success: true,
      message: 'Webhook processed',
      orderId: updatedOrder.id,
      paymentStatus:
        updatedOrder.paymentStatus
    });
  }
);
