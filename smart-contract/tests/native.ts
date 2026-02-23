import * as anchor from "@coral-xyz/anchor";
import * as borsh from "borsh";
import assert from "assert";
import * as web3 from "@solana/web3.js";
import type { Transparent } from "../target/types/transparent";

/**
 * The state of a greeting account managed by the hello world program
 */
class GreetingAccount {
  counter = 0;
  constructor(fields: { counter: number } | undefined = undefined) {
    if (fields) {
      this.counter = fields.counter;
    }
  }
}

/**
 * Borsh schema definition for greeting accounts
 */
const GreetingSchema = new Map([
  [GreetingAccount, { kind: "struct", fields: [["counter", "u32"]] }],
]);

/**
 * The expected size of each greeting account.
 */
const GREETING_SIZE = borsh.serialize(
  GreetingSchema,
  new GreetingAccount()
).length;

describe("Test", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Transparent as anchor.Program<Transparent>;
  
  it("greet", async () => {
    // Create greetings account instruction
    const greetingAccountKp = new web3.Keypair();
    const lamports = await program.provider.connection.getMinimumBalanceForRentExemption(
      GREETING_SIZE
    );
    const createGreetingAccountIx = web3.SystemProgram.createAccount({
      fromPubkey: program.provider.publicKey,
      lamports,
      newAccountPubkey: greetingAccountKp.publicKey,
      programId: program.programId,
      space: GREETING_SIZE,
    });

    // Create greet instruction
    const greetIx = new web3.TransactionInstruction({
      keys: [
        {
          pubkey: greetingAccountKp.publicKey,
          isSigner: false,
          isWritable: true,
        },
      ],
      programId: program.programId,
    });

    // Create transaction and add the instructions
    const tx = new web3.Transaction();
    tx.add(createGreetingAccountIx, greetIx);

    // Send and confirm the transaction
    const txHash = await web3.sendAndConfirmTransaction(program.provider.connection, tx, [
      program.provider.wallet.payer,
      greetingAccountKp,
    ]);
    console.log(`Use 'solana confirm -v ${txHash}' to see the logs`);

    // Fetch the greetings account
    const greetingAccount = await program.provider.connection.getAccountInfo(
      greetingAccountKp.publicKey
    );

    // Deserialize the account data
    const deserializedAccountData = borsh.deserialize(
      GreetingSchema,
      GreetingAccount,
      greetingAccount.data
    );

    // Assertions
    assert.equal(greetingAccount.lamports, lamports);
    assert(greetingAccount.owner.equals(program.programId));
    assert.deepEqual(greetingAccount.data, Buffer.from([1, 0, 0, 0]));
    assert.equal(deserializedAccountData.counter, 1);
  });
});
