const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { ok, fail } = require('./utils/response');

const app = express();
app.disable('x-powered-by');

// Relax helmet's crossOriginResourcePolicy so images load cross-origin
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const origins = String(process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((x) => x.trim());

app.use(
  cors({
    origin: (origin, callback) =>
      !origin || origins.includes('*') || origins.includes(origin)
        ? callback(null, true)
        : callback(new Error('Origin not allowed by CORS')),
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// Serve uploaded images
app.use('/uploads', express.static(path.resolve(__dirname, '../uploads')));

app.get('/health', (req, res) =>
  ok(res, { status: 'running' }, 'TWINTO API is running')
);

app.use(process.env.API_PREFIX || '/api/v1', routes);
app.use((req, res) => fail(res, 'Route not found', 404));
app.use(errorHandler);

module.exports = app;