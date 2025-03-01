const express = require("express");
const {
  createTokenTx,
  createToken,
} = require("../controllers/tokenController");
const upload = require("../middleware/upload");

const router = express.Router();

router.post("/create-token-tx", createTokenTx);
router.post("/create-token", upload.single("image"), createToken);

module.exports = router;
