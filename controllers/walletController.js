const connectWallet = (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) {
    return res.status(400).json({ error: "Public key not found!" });
  }
  console.log("Received wallet address:", publicKey);
  res.json({ message: "Wallet connected", publicKey });
};

module.exports = { connectWallet };
