const router = require('express').Router();
const controller = require('../../controllers/orderController');
const { auth } = require('../../middleware/auth');
router.post('/', auth, controller.createOrder);
router.get('/', auth, controller.listMyOrders);
router.get('/:id', auth, controller.getMyOrder);
router.patch('/:id/cancel', auth, controller.cancelMyOrder);
module.exports = router;
