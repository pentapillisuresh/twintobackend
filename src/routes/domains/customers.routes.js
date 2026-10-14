const router = require('express').Router();
const controller = require('../../controllers/customerController');
const { auth, adminOnly } = require('../../middleware/auth');
router.get('/', auth, adminOnly, controller.listCustomers);
router.patch('/:id/status', auth, adminOnly, controller.updateCustomerStatus);
module.exports = router;
