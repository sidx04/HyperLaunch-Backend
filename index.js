require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const bs58 = require("bs58");

const {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} = require("@solana/web3.js");
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} = require("@solana/spl-token");

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("uploads"));

// Multer Storage Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = "uploads/";
    if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Load Wallet Secret from .env
const secretKeyString = process.env.WALLET_SECRET_KEY;
if (!secretKeyString) {
  throw new Error("WALLET_SECRET_KEY is not set in the environment variables!");
}
const secretKey = bs58.default.decode(secretKeyString);
const creatorKeyPair = Keypair.fromSecretKey(secretKey);

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

// Function to create token
const createSolanaToken = async (tokenData, userWallet) => {
  try {
    console.log("Creating token for: ", userWallet);

    // Step 1: Create a new mint
    const mint = await createMint(
      connection,
      creatorKeyPair,
      creatorKeyPair.publicKey,
      null,
      tokenData.decimals
    );
    console.log("Mint Address:", mint.toBase58());

    // Step 2: Create user token account (if not exists)
    const userPublicKey = new PublicKey(userWallet);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creatorKeyPair,
      mint,
      userPublicKey
    );

    // Step 3: Mint tokens to the user's wallet
    await mintTo(
      connection,
      creatorKeyPair,
      mint,
      tokenAccount.address,
      creatorKeyPair.publicKey,
      tokenData.supply * LAMPORTS_PER_SOL
    );
    console.log(`Minted ${tokenData.supply} tokens to`, userWallet);

    return {
      mintAddress: mint.toBase58(),
      userTokenAccount: tokenAccount.address.toBase58(),
      imageUrl: tokenData.imageUrl,
    };
  } catch (error) {
    console.error("Error creating token:", error);
    throw error;
  }
};

// Endpoint to create and return the transaction
app.post("/create-token-tx", async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: "Missing publicKey" });
    }

    const userPublicKey = new PublicKey(publicKey);

    // Step 1: Create a transaction to charge 0.1 SOL
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: creatorKeyPair.publicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    // Step 2: Serialize the transaction for the user to sign
    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    // Step 3: Send the serialized transaction to the frontend
    res.json({
      transaction: serializedTransaction,
      blockhash,
      lastValidBlockHeight,
    });
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

// Endpoint to submit the signed transaction and create the token
app.post("/create-token", upload.single("image"), async (req, res) => {
  try {
    const {
      tokenName,
      tokenSymbol,
      decimals,
      supply,
      description,
      checkFreeze,
      checkMint,
      checkRevoke,
      publicKey,
      signedTransaction, // User-signed transaction
    } = req.body;

    if (
      !tokenName ||
      !tokenSymbol ||
      !decimals ||
      !supply ||
      !publicKey ||
      !signedTransaction
    ) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const userPublicKey = new PublicKey(publicKey);

    // Step 1: Verify and submit the signed SOL transfer transaction
    const transactionBuffer = Buffer.from(signedTransaction, "base64");
    const transaction = Transaction.from(transactionBuffer);

    // Verify that the transaction is signed by the user
    if (
      !transaction.signatures.find((sig) => sig.publicKey.equals(userPublicKey))
    ) {
      return res
        .status(400)
        .json({ error: "Transaction not signed by the user" });
    }

    const confirmedSignature = await connection.sendRawTransaction(
      transactionBuffer,
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );

    await connection.confirmTransaction({
      signature: confirmedSignature,
      blockhash: (await connection.getLatestBlockhash()).blockhash,
      lastValidBlockHeight: (
        await connection.getLatestBlockhash()
      ).lastValidBlockHeight,
    });

    console.log("SOL transfer confirmed. Proceeding to create token...");

    // Step 2: Store Image Path
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Step 3: Prepare token data
    const tokenData = {
      tokenName,
      tokenSymbol,
      decimals: parseInt(decimals),
      supply: parseInt(supply),
      description,
      checkFreeze: checkFreeze === "true",
      checkMint: checkMint === "true",
      checkRevoke: checkRevoke === "true",
      imageUrl,
    };

    // Step 4: Create and mint the token
    const tokenCreationResult = await createSolanaToken(tokenData, publicKey);

    // Step 5: Return success response
    res.json({
      success: true,
      message: "Token created successfully",
      ...tokenCreationResult,
    });
  } catch (error) {
    console.error("Error creating token:", error);
    res.status(500).json({
      error: "Failed to create token",
      details: error.message,
    });
  }
});

app.listen(8080, () => console.log("Server running on http://localhost:8080"));
