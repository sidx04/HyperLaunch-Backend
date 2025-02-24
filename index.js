const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.post("/connect-wallet", (req, res) => {
  const { publicKey } = req.body;

  if (!publicKey) {
    return res.status(400).json({ error: "Public key not found!" });
  }

  console.log("Received wallet address:", publicKey);

  res.json({ message: "Wallet connected: ", publicKey });
});

app.listen(8080, () => console.log("Server running on http://localhost:8080"));
