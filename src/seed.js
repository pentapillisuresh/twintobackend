const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const { db, User, Setting } = require('./models');
const { DEFAULT_FEES } = require('./services/feeService');

(async () => {
  try {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) {
      throw new Error('Set JWT_SECRET to at least 24 characters in backend/.env');
    }
    await db.authenticate();
    await db.sync();

    const email = String(process.env.ADMIN_EMAIL || 'admin@twinto.com').trim().toLowerCase();
    const password = String(process.env.ADMIN_PASSWORD || '');
    if (password.length < 10) throw new Error('Set ADMIN_PASSWORD to at least 10 characters in backend/.env');

    const hashedPassword = await bcrypt.hash(password, 12);
    const mobile = String(process.env.ADMIN_MOBILE || '9999999999');

    const [admin] = await User.findOrCreate({
      where: { email },
      defaults: {
        name: process.env.ADMIN_NAME || 'TWINTO Admin',
        email,
        mobile,
        password: hashedPassword,
        role: 'admin',
        isActive: true
      }
    });

    await admin.update({
      name: process.env.ADMIN_NAME || 'TWINTO Admin',
      mobile,
      password: hashedPassword,
      role: 'admin',
      isActive: true
    });

    await Setting.findOrCreate({
      where: { key: 'feeSettings' },
      defaults: { key: 'feeSettings', value: DEFAULT_FEES }
    });

    console.log(`Admin seed completed for ${email}`);
    console.log('Use ADMIN_PASSWORD from .env to sign in.');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error.message);
    process.exit(1);
  }
})();
