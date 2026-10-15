const router = require('express').Router();
const controller = require('../../controllers/uploadController');
const { auth, adminOnly } = require('../../middleware/auth');
const { upload } = require('../../middleware/upload');

router.post(
  '/image',
  auth,
  adminOnly,
  upload.single('image'),
  controller.uploadImage
);

module.exports = router;