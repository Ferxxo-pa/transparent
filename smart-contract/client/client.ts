import BN from "bn.js";
import * as web3 from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import * as anchor from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { Transparent } from "../target/types/transparent";

// Configure the client to use the local cluster
anchor.setProvider(anchor.AnchorProvider.env());

const program = anchor.workspace.Transparent as anchor.Program<Transparent>;


// ✅ Inline IDL (copied from your program)
const idl = {
  version: "0.1.0",
  name: "transparent",
  instructions: [
    {
      name: "createGame",
      accounts: [
        { name: "game", isMut: true, isSigner: false },
        { name: "host", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [
        { name: "roomName", type: "string" },
        { name: "buyIn", type: "u64" },
      ],
    },
    {
      name: "joinGame",
      accounts: [
        { name: "game", isMut: true, isSigner: false },
        { name: "player", isMut: true, isSigner: true },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [],
    },
    {
      name: "distributePot",
      accounts: [
        { name: "game", isMut: true, isSigner: false },
        { name: "host", isMut: true, isSigner: true },
        { name: "winner", isMut: true, isSigner: false },
        { name: "systemProgram", isMut: false, isSigner: false },
      ],
      args: [{ name: "winner", type: "publicKey" }],
    },
  ],
};

// ✅ Program ID (Deployed on Devnet)
const PROGRAM_ID = new PublicKey(
  "656vXmoQ3oYXdghy1PoVQ2NSzduwWW5XVfjJMqQ1fF44"
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new anchor.Program(idl as anchor.Idl, PROGRAM_ID, provider);

  // -----------------------------------------------------------
  // 🎮 Derive the PDA for the game account (must match Rust seeds)
  // -----------------------------------------------------------
  const roomName = "Transparent Room " + Date.now(); // make each game unique
  const [gamePda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("game"), // 1️⃣ same literal
      provider.wallet.publicKey.toBuffer(), // 2️⃣ host key
      Buffer.from(roomName), // 3️⃣ room name bytes
    ],
    PROGRAM_ID
  );

  console.log("🎮 Game PDA:", gamePda.toBase58());

  // -----------------------------------------------------------
  // 1️⃣ Create Game
  // -----------------------------------------------------------
  console.log("🛠 Creating new game...");
  const createTx = await program.methods
    .createGame(roomName, new anchor.BN(0.01 * LAMPORTS_PER_SOL))
    .accounts({
      game: gamePda,
      host: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Game created!");
  console.log(
    `🔗 Explorer: https://explorer.solana.com/tx/${createTx}?cluster=devnet`
  );

  // -----------------------------------------------------------
  // 2️⃣ Add Player
  // -----------------------------------------------------------
  const connection = provider.connection;
  const player = Keypair.generate();
  console.log("👤 Created new player wallet:", player.publicKey.toBase58());

  const player = provider.wallet; // whoever is connected in UI

  // Join Game
  await program.methods
    .joinGame()
    .accounts({
      game: gamePda,
      player: provider.wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc(); // 👈 no `.signers([player])`

  console.log("✅ Player joined!");

  // -----------------------------------------------------------
  // 3️⃣ Distribute Pot
  // -----------------------------------------------------------
  console.log("🏁 Distributing pot...");
  const distributeTx = await program.methods
    .distributePot(player.publicKey)
    .accounts({
      game: gamePda,
      host: provider.wallet.publicKey,
      winner: player.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log("✅ Pot distributed!");
  console.log(
    `🔗 Explorer: https://explorer.solana.com/tx/${distributeTx}?cluster=devnet`
  );

  // Check winner balance
  const balance = await connection.getBalance(player.publicKey);
  console.log(
    `💰 Winner balance: ${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL`
  );
}

main().catch((err) => console.error("❌ Error:", err));
