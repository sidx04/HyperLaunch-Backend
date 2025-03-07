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
    origin: "http://localhost:5173",
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
app.listen(8080, () => logger.info("Server running on http://localhost:8080"));
