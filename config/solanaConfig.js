const {
  signerIdentity,
  createSignerFromKeypair,
} = require("@metaplex-foundation/umi");
const { createUmi } = require("@metaplex-foundation/umi-bundle-defaults");
const { irysUploader } = require("@metaplex-foundation/umi-uploader-irys");
const {
  fromWeb3JsKeypair,
} = require("@metaplex-foundation/umi-web3js-adapters");
const { Connection, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");
const logger = require("custom-logger").config({ level: 0 });

const connection = new Connection(
  "https://api.mainnet-beta.solana.com",
  "confirmed"
);

const secretKeyString = process.env.WALLET_SECRET_KEY;
if (!secretKeyString) {
  throw new Error("WALLET_SECRET_KEY is not set in the environment variables!");
}
const secretKey = bs58.default.decode(secretKeyString);
const creatorKeyPair = Keypair.fromSecretKey(secretKey);
const creatorPublicKey = creatorKeyPair.publicKey;
const umi = createUmi(connection);
const signer = createSignerFromKeypair(umi, fromWeb3JsKeypair(creatorKeyPair));
umi.use(signerIdentity(signer, true)).use(irysUploader());

module.exports = {
  connection,
  creatorKeyPair,
  creatorPublicKey,
  umi,
  signer,
  logger,
};
