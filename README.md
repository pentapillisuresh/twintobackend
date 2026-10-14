# TWINTO Backend API (MVC)

Backend-only starter for TWINTO grocery delivery using Node.js, Express, Sequelize, and MySQL. JavaScript/CommonJS; no frontend included.

## Professional structure

```text
backend/
├── .env.example
├── package.json
├── README.md
└── src/
    ├── app.js
    ├── server.js
    ├── seed.js
    ├── config/
    │   └── db.js
    ├── models/
    │   ├── index.js                 # Model registry + associations
    │   ├── User.js
    │   ├── Otp.js
    │   ├── Category.js
    │   ├── Product.js
    │   ├── Location.js
    │   ├── Address.js
    │   ├── Cart.js
    │   ├── CartItem.js
    │   ├── Order.js
    │   ├── OrderItem.js
    │   ├── Payment.js
    │   ├── Coupon.js
    │   ├── OrderStatusHistory.js
    │   └── AppSetting.js
    ├── controllers/
    │   ├── authController.js
    │   ├── categoryController.js
    │   ├── productController.js
    │   ├── locationController.js
    │   ├── addressController.js
    │   ├── couponController.js
    │   ├── customerController.js
    │   ├── settingsController.js
    │   ├── cartController.js
    │   ├── orderController.js
    │   └── adminController.js
    ├── routes/
    │   ├── index.js
    │   └── domains/
    │       ├── auth.routes.js
    │       ├── catalog.routes.js
    │       ├── location.routes.js
    │       ├── address.routes.js
    │       ├── cart.routes.js
    │       ├── coupon.routes.js
    │       ├── order.routes.js
    │       ├── payment.routes.js
    │       └── admin.routes.js
    ├── middleware/
    │   ├── auth.js
    │   └── errorHandler.js
    ├── services/
    │   ├── feeService.js
    │   └── tokenService.js
    └── utils/
        ├── response.js
        └── slug.js
```

## Requirements
- Node.js 20+ recommended
- MySQL 8+ (or compatible MySQL server)

## Run locally
1. Create a MySQL database named `twinto`.
2. Copy `.env.example` to `.env` and set DB credentials, a unique `JWT_SECRET` (32+ characters), and a strong admin password.
3. From this folder run:
   ```bash
   npm install
   npm run seed
   npm run dev
   ```
4. Health check: `http://localhost:5000/health`
5. API prefix defaults to `/api/v1`.

The seed command creates an admin using `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, and `ADMIN_MOBILE` from `.env`. It does not use a hard-coded production password.

## API route map

| Module | Routes |
|---|---|
| Customer auth | `POST /auth/send-otp`, `POST /auth/verify-otp`, `GET /auth/me` |
| Admin auth | `POST /admin/auth/login` |
| Products | `GET /products`, `GET /products/:id`; admin create/update/delete |
| Categories | `GET /categories`; admin CRUD and `/categories/admin/all` |
| Locations | `GET /locations`; admin CRUD and `/admin/locations` |
| Addresses | authenticated list/create/update/delete at `/addresses` |
| Cart | authenticated `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:itemId`, `DELETE /cart/items/:itemId` |
| Coupons | admin CRUD at `/coupons`; authenticated `POST /coupons/validate` |
| Orders | authenticated create/list/detail/cancel at `/orders` |
| Payments | authenticated `POST /payments/verify` (Razorpay signature verification) |
| Admin orders | dashboard stats, order list/detail/status update, delivery person assignment by name/mobile, WhatsApp URL |
| Admin operations | customer list/activation, fee settings |

## Core implementation notes
- Customer authentication is mobile OTP + JWT. OTP delivery is intentionally a development stub; integrate an SMS provider before production. `OTP_FIXED_FOR_DEVELOPMENT` must not be enabled in production.
- Admin authentication uses email/password and bcrypt-hashed credentials.
- Order records keep an address snapshot so changes to an address do not rewrite old orders.
- Platform fee, delivery fee, free-delivery threshold, and tip are represented in the fee settings/order totals.
- Delivery assignments store a delivery person's name and mobile on the order; no separate delivery-partner entity is required.
- Razorpay keys must be configured. Complete production payment deployment with Razorpay webhooks, idempotency, refunds, and reconciliation before accepting live payments.

## Production checklist (do not skip)
- Replace OTP stub with SMS gateway and add OTP rate limits, resend cooldown, and abuse monitoring.
- Use database migrations rather than relying on `sequelize.sync()` for production schema changes.
- Add request schema validation, centralized structured logging, automated tests, and API rate limiting.
- Harden stock reservation and cancellation restoration with transaction-safe inventory operations.
- Implement Razorpay webhooks, idempotent payment processing, refund handling, and reconciliation.
- Configure HTTPS, production CORS origins, secrets management, backups, and monitoring.


## Model architecture
Each Sequelize model has its own file under `src/models/` (for example `User.js`, `Product.js`, `Order.js`, and `Payment.js`). `src/models/index.js` imports those models, defines associations in one place, and exports the complete model registry. Keep field definitions inside each model file and relationship declarations in `index.js`.


## Route organization

Routes are separated by domain: authentication, categories, products, locations, addresses, cart, coupons, orders, payments, and admin. The admin router exposes dashboard, order management, customer management, payment lookup, delivery assignment, WhatsApp sharing, and fee settings.
