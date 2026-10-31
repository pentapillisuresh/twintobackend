
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const routes = require('./routes');

const paymentController = require(
  './controllers/paymentController'
);

const errorHandler = require(
  './middleware/errorHandler'
);

const { ok, fail } = require('./utils/response');

const app = express();

// ==========================================
// 1. BASIC SECURITY
// ==========================================

app.disable('x-powered-by');

// Security headers.
// Allow cross-origin loading of uploaded images.
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    },
  })
);

// ==========================================
// 2. CORS CONFIGURATION
// ==========================================

// Allowed frontend origins.
// FRONTEND_URL can contain multiple URLs,
// separated by commas.

const origins = String(
  process.env.FRONTEND_URL ||
    'http://localhost:5173,https://admin.twinto.store,https://twinto.store'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests
      // that have no Origin header.
      if (!origin || origins.includes(origin)) {
        return callback(null, true);
      }

      console.error(
        'CORS blocked origin:',
        origin
      );

      return callback(
        new Error('Origin not allowed by CORS')
      );
    },

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization',
    ],

    credentials: true,

    optionsSuccessStatus: 204,
  })
);

// ==========================================
// 3. CASHFREE WEBHOOK
// ==========================================

// IMPORTANT:
// Register the Cashfree webhook BEFORE
// express.json().
//
// Cashfree signs the original request body.
// Parsing JSON first would prevent reliable
// signature verification.
//
// This endpoint must be publicly accessible
// over HTTPS.
//
// Cashfree webhook authentication is handled
// by verifyWebhookSignature() in
// cashfreeService.js.
//
// Do not add customer JWT authentication
// to this webhook endpoint.

const API_PREFIX =
  process.env.API_PREFIX || '/api/v1';

app.post(
  `${API_PREFIX}/payments/webhook`,

  express.raw({
    type: 'application/json',
    limit: '1mb',
  }),

  paymentController.webhook
);

// ==========================================
// 4. REQUEST BODY PARSING
// ==========================================

// Parse normal API JSON requests.
// This is intentionally AFTER the webhook.

app.use(
  express.json({
    limit: '1mb',
  })
);

// Parse URL-encoded request bodies,
// if needed by existing API routes.

app.use(
  express.urlencoded({
    extended: true,
    limit: '1mb',
  })
);

// ==========================================
// 5. REQUEST LOGGING
// ==========================================

app.use(morgan('dev'));

// ==========================================
// 6. STATIC UPLOADS
// ==========================================

// Serve uploaded images and other files.

app.use(
  '/uploads',

  express.static(
    path.resolve(
      __dirname,
      '../uploads'
    )
  )
);

// ==========================================
// 7. HEALTH CHECK
// ==========================================

app.get('/health', (req, res) => {
  return ok(
    res,
    {
      status: 'running',
    },
    'TWINTO API is running'
  );
});

// ==========================================
// 8. MAIN API ROUTES
// ==========================================

app.use(
  API_PREFIX,
  routes
);

// ==========================================
// 9. UNKNOWN ROUTES
// ==========================================

app.use((req, res) => {
  return fail(
    res,
    'Route not found',
    404
  );
});

// ==========================================
// 10. CENTRAL ERROR HANDLER
// ==========================================

app.use(errorHandler);

// ==========================================
// 11. EXPORT EXPRESS APP
// ==========================================

module.exports = app;
