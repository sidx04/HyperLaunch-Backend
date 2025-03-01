const {
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} = require("@solana/web3.js");
const { connection, creatorPublicKey } = require("../config/solanaConfig");

const createSolanaToken = async (tokenData, userWallet) => {
  try {
    // Token creation logic will go here.
    const userPublicKey = new PublicKey(userWallet);

    console.log(`Creating token for: ${userPublicKey}`);
    console.log(`Creator Authority: ${creatorPublicKey}`);

    return {
      tokenData,
    };
  } catch (error) {
    console.error("Token creation failed:", error);
    throw error;
  }
};

const createTokenTx = async (req, res) => {
  try {
    const { publicKey } = req.body;

    if (!publicKey) {
      return res.status(400).json({ error: "Missing publicKey" });
    }

    const userPublicKey = new PublicKey(publicKey);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: creatorPublicKey,
        lamports: 0.1 * LAMPORTS_PER_SOL,
      })
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;

    const serializedTransaction = transaction
      .serialize({ requireAllSignatures: false })
      .toString("base64");

    res.json({
      transaction: serializedTransaction,
      blockhash,
      lastValidBlockHeight,
    });
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Failed to create transaction" });
  }
};

const createToken = async (req, res) => {
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
      signedTransaction,
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
    const transactionBuffer = Buffer.from(signedTransaction, "base64");
    const transaction = Transaction.from(transactionBuffer);

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

    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

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

    const tokenCreationResult = await createSolanaToken(tokenData, publicKey);

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
};

module.exports = { createToken, createTokenTx };
