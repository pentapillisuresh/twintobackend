const router = require("express").Router();
const controller = require("../../controllers/settingsController");
const { auth, adminOnly } = require("../../middleware/auth");

router.get("/fees", auth, adminOnly, controller.getFeeSettings);
router.put("/fees", auth, adminOnly, controller.updateFeeSettings);

module.exports = router;