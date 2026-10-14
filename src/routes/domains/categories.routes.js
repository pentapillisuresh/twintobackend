const router = require('express').Router();
const controller = require('../../controllers/categoryController');
const { auth, adminOnly } = require('../../middleware/auth');
router.get('/', controller.listCategories);
router.get('/admin/all', auth, adminOnly, controller.listAllCategories);
router.post('/', auth, adminOnly, controller.createCategory);
router.put('/:id', auth, adminOnly, controller.updateCategory);
router.delete('/:id', auth, adminOnly, controller.deleteCategory);
module.exports = router;
