const fs = require("fs");
const {
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  connection,
  creatorPublicKey,
  logger,
} = require("../config/solanaConfig");

const { uploadImageToIrys } = require("../middleware/irysUpload");
const { createSolanaToken } = require("../middleware/createToken");

// route logic
const createTokenTx = async (req, res) => {
  try {
    const { publicKey, checkFreeze, checkMint, checkUpdate } = req.body;
    const tokenCreateOptions = {
      publicKey,
      checkFreeze,
      checkMint,
      checkUpdate,
    };
    logger.info(`Token Data: ${JSON.stringify(tokenCreateOptions, null, 2)}$`);

    if (!publicKey) {
      return res.status(400).json({ error: "Missing publicKey" });
    }

    const userPublicKey = new PublicKey(publicKey);

    // base tx
    let totalLamports = 0.1 * LAMPORTS_PER_SOL; // Base 0.1 SOL

    if (checkFreeze === true) totalLamports += 0.05 * LAMPORTS_PER_SOL;
    if (checkMint === true) totalLamports += 0.05 * LAMPORTS_PER_SOL;
    if (checkUpdate === true) totalLamports += 0.05 * LAMPORTS_PER_SOL;

    logger.info(`Payable Fee: ${totalLamports}`);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: creatorPublicKey,
        lamports: totalLamports,
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
    logger.error("Error creating transaction:", error);
    res.status(500).json({ error: "Failed to create transaction" });
  }
};

// route logic
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
      checkUpdate,
      twitterUrl,
      telegramUrl,
      websiteUrl,
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

    logger.info("SOL transfer confirmed. Proceeding to create token...");

    const imageFile = req.file;
    const imageUri = await uploadImageToIrys(imageFile);
    fs.unlinkSync(imageFile.path);

    const tokenData = {
      tokenName,
      tokenSymbol,
      decimals: parseInt(decimals),
      supply: parseInt(supply),
      description,
      checkFreeze: checkFreeze === "true",
      checkMint: checkMint === "true",
      checkUpdate: checkUpdate === "true",
      twitterUrl,
      telegramUrl,
      websiteUrl,
      imageUri,
    };

    const tokenCreationResult = await createSolanaToken(tokenData, publicKey);

    res.json({
      success: true,
      message: "Token created successfully",
      ...tokenCreationResult,
    });
  } catch (error) {
    logger.error("Error creating token:", error);
    res.status(500).json({
      error: "Failed to create token",
      details: error.message,
    });
  }
};

module.exports = { createToken, createTokenTx };
