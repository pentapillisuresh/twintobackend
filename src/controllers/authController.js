const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, Otp } = require('../models');
const { createToken } = require('../services/tokenService');
const { ok, fail } = require('../utils/response');

const cleanMobile = (value) => String(value || '').replace(/\D/g, '').slice(-15);

exports.sendOtp = async (req, res, next) => {
  try {
    const mobile = cleanMobile(req.body.mobile);
    if (mobile.length < 10) return fail(res, 'Valid mobile number is required');
    if (process.env.NODE_ENV === 'production') {
      return fail(res, 'Configure an SMS provider before production', 503);
    }
    const otp = process.env.OTP_FIXED_FOR_DEVELOPMENT || '123456';
    await Otp.destroy({ where: { mobile } });
    await Otp.create({
      mobile, otp,
      expiresAt: new Date(Date.now() + Number(process.env.OTP_EXPIRES_MINUTES || 5) * 60000)
    });
    console.log(`[DEV OTP] ${mobile}: ${otp}`);
    return ok(res, { mobile }, 'Development OTP generated');
  } catch (error) { next(error); }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const mobile = cleanMobile(req.body.mobile);
    const record = await Otp.findOne({
      where: { mobile, otp: String(req.body.otp || ''), isVerified: false }
    });
    if (!record || record.expiresAt < new Date()) return fail(res, 'Invalid or expired OTP');
    record.isVerified = true;
    await record.save();
    let user = await User.findOne({ where: { mobile } });
    if (!user) user = await User.create({ mobile, name: req.body.name || 'Customer' });
    if (!user.isActive) return fail(res, 'Account is inactive', 403);
    return ok(res, {
      token: createToken(user),
      user: { id: user.id, name: user.name, mobile: user.mobile, email: user.email, role: user.role }
    }, 'Login successful');
  } catch (error) { next(error); }
};

exports.adminLogin = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) return fail(res, 'Email and password are required');
    const user = await User.findOne({ where: { email, role: 'admin' } });
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) {
      return fail(res, 'Invalid email or password', 401);
    }
    if (!user.isActive) return fail(res, 'Admin account is inactive', 403);
    return ok(res, {
      token: createToken(user),
      user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile, role: user.role }
    }, 'Admin login successful');
  } catch (error) { next(error); }
};

exports.me = (req, res) => ok(res, {
  id: req.user.id, name: req.user.name, mobile: req.user.mobile,
  email: req.user.email, role: req.user.role
});
