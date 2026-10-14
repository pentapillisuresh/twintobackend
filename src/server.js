const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const app = require('./app');
const { db } = require('./models');

(async () => {
  try {
    const secret = process.env.JWT_SECRET;
    console.log('JWT_SECRET loaded:', Boolean(secret));
    console.log('JWT_SECRET length:', secret?.length || 0);

    if (!secret || secret.length < 24) {
      throw new Error('Set JWT_SECRET to at least 24 characters in backend/.env');
    }
    if (!process.env.DB_NAME || !process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
      throw new Error('Configure DB_NAME, DB_USER and DB_PASSWORD in backend/.env');
    }

    await db.authenticate();
    console.log('MySQL connected successfully');
    await db.sync();
    console.log('Database models synchronized');

    const port = Number(process.env.PORT || 5000);
    app.listen(port, () => {
      console.log(`TWINTO API running on port ${port}`);
      console.log(`Health check: http://localhost:${port}/health`);
    });
  } catch (error) {
    console.error('Startup failed:', error.message);
    process.exit(1);
  }
})();
