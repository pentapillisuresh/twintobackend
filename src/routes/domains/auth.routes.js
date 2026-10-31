
const router = require('express').Router();

const authController =
  require('../../controllers/authController');

const {
  auth
} = require('../../middleware/auth');

// Customer OTP login.
router.post(
  '/auth/send-otp',
  authController.sendOtp
);

router.post(
  '/auth/verify-otp',
  authController.verifyOtp
);

// Current authenticated user.
router.get(
  '/auth/me',
  auth,
  authController.me
);

// Admin email/password login.
router.post(
  '/admin/auth/login',
  authController.adminLogin
);

module.exports = router;
