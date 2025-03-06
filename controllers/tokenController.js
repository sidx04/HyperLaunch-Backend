const fs = require("fs");
const bs58 = require("bs58");
const {
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} = require("@solana/web3.js");
const {
  connection,
  creatorKeyPair,
  creatorPublicKey,
  umi,
  signer,
} = require("../config/solanaConfig");
const {
  createMint,
  mintTo,
  getOrCreateAssociatedTokenAccount,
} = require("@solana/spl-token");
const {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
} = require("@metaplex-foundation/umi-web3js-adapters");
const {
  signerIdentity,
  createSignerFromKeypair,
} = require("@metaplex-foundation/umi");
const { irysUploader } = require("@metaplex-foundation/umi-uploader-irys");
const {
  createMetadataAccountV3,
  findMetadataPda,
} = require("@metaplex-foundation/mpl-token-metadata");

const createSolanaToken = async (tokenData, userWallet) => {
  try {
    // Token creation logic will go here.
    const userPublicKey = new PublicKey(userWallet);

    console.log(`Creating token for: ${userPublicKey}`);
    console.log(`Creator Authority: ${creatorPublicKey}`);

    const mint = await createMint(
      connection,
      creatorKeyPair,
      tokenData.checkMint ? userPublicKey : null,
      tokenData.checkFreeze ? userPublicKey : null,
      tokenData.decimals
    );

    // umi format
    const umiMint = fromWeb3JsPublicKey(mint);

    const metaData = {
      name: tokenData.tokenName,
      symbol: tokenData.tokenSymbol,
      description: tokenData.description,
      image: tokenData.imageUri,
      properties: {
        files: [
          {
            uri: tokenData.imageUri, // Same Irys URI here
            type: "image/png", // or detect from mimetype
          },
        ],
      },
      attributes: [],
    };

    const metadataUri = await umi.uploader.uploadJson({
      ...metaData,
      seller_fee_basis_points: 0,
    });
    console.log(`Metadata URI: ${metadataUri}`);

    const metaDataTransaction = await createMetadataAccountV3(umi, {
      mint: umiMint,
      mintAuthority: tokenData.checkMint ? userPublicKey : null,
      updateAuthority: tokenData.checkUpdate ? userPublicKey : null,
      data: {
        ...metaData,
        uri: metadataUri,
        creators: [
          {
            address: creatorPublicKey,
            verified: true,
            share: 100,
          },
        ],
        collection: null,
        uses: null,
      },
      isMutable: true,
      collectionDetails: null,
    }).sendAndConfirm(umi);

    console.log(
      `Metadata Transaction Signature: ${bs58.default.encode(
        metaDataTransaction.signature
      )}`
    );

    // Mint tokens
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creatorKeyPair,
      mint,
      new PublicKey(userWallet)
    );
    console.log(`Token Account: ${tokenAccount}`);

    const mintSig = await mintTo(
      connection,
      creatorKeyPair,
      mint,
      tokenAccount.address,
      creatorKeyPair.publicKey,
      tokenData.supply * LAMPORTS_PER_SOL
    );

    console.log(`Mint Signature: ${mintSig}`);

    return {
      mint: mint.toBase58(),
      metadata: findMetadataPda(umi, { mint: umiMint }).toString(),
      metadataUri,
      transactionId: metaDataTransaction.signature,
    };
  } catch (error) {
    console.error("Token creation failed:", error);
    throw error;
  }
};

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
    console.log(`Token Data: ${JSON.stringify(tokenCreateOptions, null, 2)}$`);

    if (!publicKey) {
      return res.status(400).json({ error: "Missing publicKey" });
    }

    const userPublicKey = new PublicKey(publicKey);

    // base tx
    let totalLamports = 0.1 * LAMPORTS_PER_SOL; // Base 0.1 SOL

    if (checkFreeze === true) totalLamports += 0.1 * LAMPORTS_PER_SOL;
    if (checkMint === true) totalLamports += 0.1 * LAMPORTS_PER_SOL;
    if (checkUpdate === true) totalLamports += 0.1 * LAMPORTS_PER_SOL;

    console.log(`Payable Fee: ${totalLamports}`);

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
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Failed to create transaction" });
  }
};

// upload to irys function
const uploadImageToIrys = async (file) => {
  try {
    const fileSize = fs.statSync(file.path).size;

    console.log(`Image path: ${file.path}`);

    if (typeof fileSize !== "number" || !Number.isInteger(fileSize)) {
      throw new Error("File size must be an integer");
    }

    const fileStream = fs.readFileSync(file.path);

    const fileObject = {
      buffer: fileStream,
      name: file.filename,
      type: file.mimetype || "image/png",
      size: fileSize,
    };

    // Upload the file to Irys
    const imageUri = await umi.uploader.upload([fileObject]); // Pass as an array
    console.log(`Image URI: ${imageUri}`);
    return imageUri;
  } catch (error) {
    console.error("Failed to upload image to Irys:", error);
    throw error;
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
      imageUri,
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
