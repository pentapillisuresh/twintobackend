const router = require('express').Router();
const controller = require('../../controllers/locationController');
const { auth, adminOnly } = require('../../middleware/auth');
router.get('/', controller.listLocations);
router.get('/admin/all', auth, adminOnly, controller.listAllLocations);
router.post('/', auth, adminOnly, controller.createLocation);
router.put('/:id', auth, adminOnly, controller.updateLocation);
router.delete('/:id', auth, adminOnly, controller.deleteLocation);
module.exports = router;
