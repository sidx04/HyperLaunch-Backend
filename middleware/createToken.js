const {
  fromWeb3JsPublicKey,
} = require("@metaplex-foundation/umi-web3js-adapters");
const {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  AuthorityType,
  setAuthority,
} = require("@solana/spl-token");
const { PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const bs58 = require("bs58");
const {
  connection,
  creatorKeyPair,
  creatorPublicKey,
  umi,
  signer,
} = require("../config/solanaConfig");
const {
  createMetadataAccountV3,
  findMetadataPda,
  updateMetadataAccountV2,
} = require("@metaplex-foundation/mpl-token-metadata");

const createSolanaToken = async (tokenData, userWallet) => {
  try {
    const userPublicKey = new PublicKey(userWallet);
    const userUmiPublicKey = fromWeb3JsPublicKey(userPublicKey);

    const mint = await createMint(
      connection,
      creatorKeyPair,
      creatorPublicKey, // creator is always the initial mint authority
      tokenData.checkFreeze ? null : userPublicKey,
      tokenData.decimals
    );

    const umiMint = fromWeb3JsPublicKey(mint);

    const metaData = {
      name: tokenData.tokenName,
      symbol: tokenData.tokenSymbol,
      description: tokenData.description,
      image: tokenData.imageUri,
      properties: {
        files: [
          {
            uri: tokenData.imageUri,
            type: "image/png",
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

    const initialUpdateAuthority = tokenData.checkUpdate
      ? signer.publicKey
      : userUmiPublicKey;

    const metaDataTransaction = await createMetadataAccountV3(umi, {
      mint: umiMint,
      mintAuthority: signer,
      updateAuthority: initialUpdateAuthority,
      data: {
        name: tokenData.tokenName,
        symbol: tokenData.tokenSymbol,
        uri: metadataUri,
        sellerFeeBasisPoints: 0,
        creators: tokenData.checkUpdate
          ? [
              {
                address: creatorPublicKey,
                verified: true, // Creator is verified if they are the update authority
                share: 100,
              },
            ]
          : [
              {
                address: creatorPublicKey,
                verified: false, // Creator is NOT verified if user is the update authority
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

    const tokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      creatorKeyPair,
      mint,
      userPublicKey
    );
    console.log(`Token Account: ${tokenAccount.address.toBase58()}`);

    const mintSig = await mintTo(
      connection,
      creatorKeyPair,
      mint,
      tokenAccount.address,
      creatorKeyPair.publicKey,
      tokenData.supply * LAMPORTS_PER_SOL
    );

    console.log(`Mint Signature: ${mintSig}`);

    if (!tokenData.checkMint) {
      await setAuthority(
        connection,
        creatorKeyPair,
        mint,
        creatorKeyPair,
        AuthorityType.MintTokens,
        userPublicKey
      );
      console.log("Mint authority transferred to user");
    } else {
      await setAuthority(
        connection,
        creatorKeyPair,
        mint,
        creatorKeyPair,
        AuthorityType.MintTokens,
        null
      );
      console.log("Mint authority revoked!");
    }

    if (tokenData.checkUpdate) {
      const metadataPDA = findMetadataPda(umi, { mint: umiMint });

      await updateMetadataAccountV2(umi, {
        metadata: metadataPDA,
        updateAuthority: signer.publicKey,
        newUpdateAuthority: null,
        primarySaleHappened: null,
        isMutable: false,
        data: null,
      }).sendAndConfirm(umi);

      console.log("Update authority revoked and metadata made immutable");
    }

    return {
      mint: mint.toBase58(),
      metadata: findMetadataPda(umi, { mint: umiMint }).toString(),
      metadataUri,
      transactionId: metaDataTransaction.signature,
    };
  } catch (error) {
    console.error("Token creation failed:", error);

    if (error.transactionLogs) {
      console.error("Transaction Logs:", error.transactionLogs.join("\n"));
    }

    throw error;
  }
};
module.exports = { createSolanaToken };
