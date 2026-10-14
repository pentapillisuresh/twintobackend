const router = require('express').Router();
const controller = require('../../controllers/productController');
const { auth, adminOnly } = require('../../middleware/auth');
router.get('/', controller.listProducts);
router.get('/:id', controller.getProduct);
router.post('/', auth, adminOnly, controller.createProduct);
router.put('/:id', auth, adminOnly, controller.updateProduct);
router.delete('/:id', auth, adminOnly, controller.deleteProduct);
module.exports = router;
