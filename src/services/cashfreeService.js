
const crypto = require('crypto');
const { Order, Payment, db } = require('../models');

// ==========================================
// 1. CASHFREE ENVIRONMENT
// ==========================================

const env = () =>
  process.env.CASHFREE_ENV === 'production'
    ? 'production'
    : 'sandbox';

const baseUrl = () =>
  env() === 'production'
    ? 'https://api.cashfree.com/pg'
    : 'https://sandbox.cashfree.com/pg';

const apiPrefix = () =>
  process.env.API_PREFIX || '/api/v1';

// ==========================================
// 2. PUBLIC BACKEND URL
// ==========================================

function publicBase() {
  const value = String(
    process.env.PUBLIC_BACKEND_URL || ''
  ).replace(/\/$/, '');

  if (!/^https:\/\/[^/]+/i.test(value)) {
    throw new Error(
      'PUBLIC_BACKEND_URL must be a public HTTPS address'
    );
  }

  return value;
}

// ==========================================
// 3. CASHFREE API REQUEST
// ==========================================

async function cashfreeRequest(
  path,
  { method = 'GET', body } = {}
) {
  if (
    !process.env.CASHFREE_APP_ID ||
    !process.env.CASHFREE_SECRET_KEY
  ) {
    throw new Error(
      'Cashfree credentials not configured'
    );
  }

  const response = await fetch(
    `${baseUrl()}${path}`,
    {
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret':
          process.env.CASHFREE_SECRET_KEY,
        'x-api-version':
          process.env.CASHFREE_API_VERSION ||
          '2025-01-01'
      },
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(12000)
    }
  );

  const raw = await response.text();

  let data = {};

  try {
    data = JSON.parse(raw);
  } catch {
    // Cashfree returned a non-JSON response.
  }

  if (!response.ok) {
    const error = new Error(
      `Cashfree API request failed (${response.status})`
    );

    error.status = 502;

    console.error(
      'Cashfree API error:',
      response.status,
      data.message || data.type || 'Unknown error'
    );

    throw error;
  }

  return data;
}

// ==========================================
// 4. SIGN CHECKOUT URL
// ==========================================

function signCheckout(orderId, expires) {
  const secret =
    process.env.CASHFREE_CHECKOUT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error(
      'CASHFREE_CHECKOUT_SECRET is not configured'
    );
  }

  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}:${expires}`)
    .digest('hex');
}

// ==========================================
// 5. GENERATE CHECKOUT URL
// ==========================================

function checkoutUrl(orderId) {
  const expires =
    Date.now() + 15 * 60 * 1000;

  return (
    `${publicBase()}` +
    `${apiPrefix()}` +
    `/payments/checkout/${orderId}` +
    `?expires=${expires}` +
    `&sig=${signCheckout(orderId, expires)}`
  );
}

// ==========================================
// 6. VALIDATE CHECKOUT SIGNATURE
// ==========================================

function validCheckout(
  orderId,
  expires,
  signature
) {
  const expiry = Number(expires);

  if (
    !Number.isSafeInteger(expiry) ||
    expiry < Date.now() ||
    expiry > Date.now() + 16 * 60 * 1000
  ) {
    return false;
  }

  if (
    !/^[a-f0-9]{64}$/i.test(
      String(signature || '')
    )
  ) {
    return false;
  }

  const expected = Buffer.from(
    signCheckout(orderId, expires),
    'hex'
  );

  const actual = Buffer.from(
    signature,
    'hex'
  );

  return crypto.timingSafeEqual(
    expected,
    actual
  );
}

// ==========================================
// 7. CREATE CASHFREE PAYMENT SESSION
// ==========================================

async function createCashfreeSession(
  order,
  user
) {
  if (order.paymentMethod !== 'CASHFREE') {
    throw new Error(
      'Not a Cashfree order'
    );
  }

  const payment = await Payment.findOne({
    where: {
      orderId: order.id,
      provider: 'CASHFREE'
    }
  });

  if (!payment) {
    throw new Error(
      'Cashfree payment record missing'
    );
  }

  // Reuse an existing session.
  if (
    payment.cashfreeSessionId &&
    payment.cashfreeOrderId
  ) {
    return {
      paymentSessionId:
        payment.cashfreeSessionId,
      checkoutUrl: checkoutUrl(order.id),
      environment: env()
    };
  }

  const result = await cashfreeRequest(
    '/orders',
    {
      method: 'POST',
      body: {
        order_id: `twinto_${order.id}`,
        order_amount: Number(order.total),
        order_currency: 'INR',

        customer_details: {
          customer_id: String(user.id),
          customer_phone: String(user.mobile),

          ...(user.email
            ? { customer_email: user.email }
            : {})
        },

        order_meta: {
          return_url:
            `${publicBase()}` +
            `${apiPrefix()}` +
            `/payments/return?order_id=${order.id}`,

          notify_url:
            `${publicBase()}` +
            `${apiPrefix()}` +
            '/payments/webhook'
        },

        order_note:
          `TWINTO ${order.orderNumber}`
      }
    }
  );

  if (
    !result.payment_session_id ||
    !result.order_id
  ) {
    throw new Error(
      'Cashfree did not return a payment session'
    );
  }

  await payment.update({
    cashfreeOrderId: result.order_id,
    cashfreeSessionId:
      result.payment_session_id
  });

  return {
    paymentSessionId:
      result.payment_session_id,
    checkoutUrl: checkoutUrl(order.id),
    environment: env()
  };
}

// ==========================================
// 8. VERIFY CASHFREE ORDER STATUS
// ==========================================

async function syncCashfreeOrder(orderId) {
  const order = await Order.findByPk(
    orderId
  );

  if (
    !order ||
    order.paymentMethod !== 'CASHFREE'
  ) {
    return order;
  }

  const payment = await Payment.findOne({
    where: {
      orderId,
      provider: 'CASHFREE'
    }
  });

  if (!payment?.cashfreeOrderId) {
    return order;
  }

  // Fetch the payment status directly
  // from Cashfree's server.
  const data = await cashfreeRequest(
    `/orders/${encodeURIComponent(
      payment.cashfreeOrderId
    )}`
  );

  if (
    data.order_id !==
    payment.cashfreeOrderId
  ) {
    throw new Error(
      'Cashfree order ID mismatch'
    );
  }

  if (
    Number(data.order_amount) !==
      Number(order.total) ||
    data.order_currency !== 'INR'
  ) {
    throw new Error(
      'Cashfree order amount or currency mismatch'
    );
  }

  if (data.order_status === 'PAID') {
    await db.transaction(
      async transaction => {
        const locked =
          await Order.findByPk(
            orderId,
            {
              transaction,
              lock:
                transaction.LOCK.UPDATE
            }
          );

        if (
          !locked ||
          locked.paymentMethod !==
            'CASHFREE'
        ) {
          throw new Error(
            'Order changed during verification'
          );
        }

        if (
          locked.status === 'CANCELLED'
        ) {
          // Requires refund or manual review.
          console.error(
            'Cashfree paid a cancelled order; refund review required:',
            orderId
          );
        }

        if (
          locked.paymentStatus !== 'PAID'
        ) {
          await locked.update(
            {
              paymentStatus: 'PAID'
            },
            { transaction }
          );
        }

        await Payment.update(
          {
            status: 'PAID'
          },
          {
            where: {
              id: payment.id
            },
            transaction
          }
        );
      }
    );
  }

  return Order.findByPk(orderId);
}

// ==========================================
// 9. VERIFY CASHFREE WEBHOOK SIGNATURE
// ==========================================

function verifyWebhookSignature(
  rawBody,
  timestamp,
  signature
) {
  const secret =
    process.env.CASHFREE_SECRET_KEY;

  if (
    !secret ||
    !timestamp ||
    !signature ||
    !Buffer.isBuffer(rawBody)
  ) {
    return false;
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(
      Buffer.concat([
        Buffer.from(
          String(timestamp),
          'utf8'
        ),
        rawBody
      ])
    )
    .digest('base64');

  const a = Buffer.from(
    expected,
    'utf8'
  );

  const b = Buffer.from(
    String(signature),
    'utf8'
  );

  return (
    a.length === b.length &&
    crypto.timingSafeEqual(a, b)
  );
}

// ==========================================
// 10. EXPORTS
// ==========================================

module.exports = {
  cashfreeRequest,
  createCashfreeSession,
  syncCashfreeOrder,
  validCheckout,
  verifyWebhookSignature,
  env
};
