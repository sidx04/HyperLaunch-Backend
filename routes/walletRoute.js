const express = require("express");
const { connectWallet } = require("../controllers/walletController");

const router = express.Router();

router.post("/connect-wallet", connectWallet);

module.exports = router;
