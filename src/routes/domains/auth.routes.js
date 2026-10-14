const router = require('express').Router();
const authController = require('../../controllers/authController');
const { auth } = require('../../middleware/auth');
router.post('/auth/send-otp', authController.sendOtp);
router.post('/auth/verify-otp', authController.verifyOtp);
router.get('/auth/me', auth, authController.me);
router.post('/admin/auth/login', authController.adminLogin);
module.exports = router;
