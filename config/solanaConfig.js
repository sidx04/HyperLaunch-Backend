const { Connection, Keypair } = require("@solana/web3.js");
const bs58 = require("bs58");

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const secretKeyString = process.env.WALLET_SECRET_KEY;
if (!secretKeyString) {
  throw new Error("WALLET_SECRET_KEY is not set in the environment variables!");
}
const secretKey = bs58.default.decode(secretKeyString);
const creatorKeyPair = Keypair.fromSecretKey(secretKey);
const creatorPublicKey = creatorKeyPair.publicKey;

module.exports = { connection, creatorPublicKey };
