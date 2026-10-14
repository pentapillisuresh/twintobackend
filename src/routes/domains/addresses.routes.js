const router = require('express').Router();
const controller = require('../../controllers/addressController');
const { auth } = require('../../middleware/auth');
router.get('/', auth, controller.listAddresses);
router.post('/', auth, controller.createAddress);
router.put('/:id', auth, controller.updateAddress);
router.delete('/:id', auth, controller.deleteAddress);
module.exports = router;
