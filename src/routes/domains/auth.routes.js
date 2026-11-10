
const router = require('express').Router();

const authController =
  require('../../controllers/authController');

const {
  auth
} = require('../../middleware/auth');

// ==========================================
// CUSTOMER OTP LOGIN
// ==========================================

// Send 4-digit OTP.
router.post(
  '/auth/send-otp',
  authController.sendOtp
);

// Verify OTP and login.
router.post(
  '/auth/verify-otp',
  authController.verifyOtp
);

// ==========================================
// CUSTOMER PROFILE
// ==========================================

// Get current authenticated user.
router.get(
  '/auth/me',
  auth,
  authController.me
);

// Complete customer profile after OTP login.
// Used when customer name is not yet saved.
router.put(
  '/auth/complete-profile',
  auth,
  authController.completeProfile
);

// Update customer name from Edit Profile screen.
router.put(
  '/auth/profile',
  auth,
  authController.updateProfile
);

// ==========================================
// ADMIN AUTHENTICATION
// ==========================================

// Admin email/password login.
router.post(
  '/admin/auth/login',
  authController.adminLogin
);

module.exports = router;
