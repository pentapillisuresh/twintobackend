const router = require('express').Router();
const controller = require('../../controllers/cartController');
const { auth } = require('../../middleware/auth');
router.get('/', auth, controller.getCart);
router.post('/items', auth, controller.addItem);
router.patch('/items/:itemId', auth, controller.updateItem);
router.delete('/items/:itemId', auth, controller.removeItem);
router.post('/validate-coupon', auth, controller.validateCoupon);
module.exports = router;
