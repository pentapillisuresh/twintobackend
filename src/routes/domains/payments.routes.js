const router = require('express').Router();
const controller = require('../../controllers/paymentController');
const { auth } = require('../../middleware/auth');
router.post('/verify', auth, controller.verifyPayment);
module.exports = router;
