require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const bs58 = require("bs58");
const { Connection, Keypair } = require("@solana/web3.js");

const tokenRoutes = require("./routes/tokenRoute");
const walletRoutes = require("./routes/walletRoute");
const { logger } = require("./config/solanaConfig");

const app = express();

// Middleware
app.use(
  cors({
    origin: process.env.FRONTEND_URI,
    credentials: true,
  })
);
app.options("*", cors());
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static("uploads"));

// Load Wallet Secret
const secretKeyString = process.env.WALLET_SECRET_KEY;
if (!secretKeyString) {
  throw new Error("WALLET_SECRET_KEY is not set in the environment variables!");
}

// Routes
app.use("/", tokenRoutes);
app.use("/", walletRoutes);

// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () =>
  logger.info(`Server running on http://localhost:${PORT}`)
);
