import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { assert } from "chai";
import { Vaultasol } from "../target/types/vaultasol";
import { BN } from "bn.js";

describe("vaultasol", async () => {

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = provider.wallet as anchor.Wallet;

  const program = anchor.workspace.vaultasol as Program<Vaultasol>;
  
  let vaultPDA: anchor.web3.PublicKey;
  const newPayer = new Keypair();
  const anotherPayer = new Keypair();
  let userPDA: anchor.web3.PublicKey;
  let anotherUserPDA: anchor.web3.PublicKey;

  
  before(async () => {

    [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault")],
    program.programId,
    );


    await Promise.all([
      confirmAirdrop(provider.connection, newPayer.publicKey),
      confirmAirdrop(provider.connection, anotherPayer.publicKey),
    ]);

    [userPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), newPayer.publicKey.toBuffer()],
      program.programId,
    );

    [anotherUserPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), anotherPayer.publicKey.toBuffer()],
      program.programId,
    )


  });


  it("Initialize", async() => {
    const tx = await program.methods
      .initialize()
      .accounts({
        payer: payer.publicKey,
        vault: vaultPDA,
      })
      .rpc();

      console.log("transaction signature ", tx);

      const vaultAccount = await program.account.vault.fetch(vaultPDA);

      assert(vaultAccount.totalDeposit.toNumber() == 0, "Total deposit must be zero");
      assert(vaultAccount.totalUsers.toNumber() == 0, "Total users must be 0");

  });

  it("Deposit sol", async () => {

    await program.methods
    .deposit(new BN(2 * LAMPORTS_PER_SOL))
    .accounts({
      payer: newPayer.publicKey,
      vault: vaultPDA,
      user: userPDA,
    })
    .signers([newPayer])
    .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    const userAccount = await program.account.user.fetch(userPDA);

    assert(vaultAccount.totalDeposit.toNumber() == 1.8 * LAMPORTS_PER_SOL, "Total deposit must be 1.8 SOL");
    assert(vaultAccount.totalUsers.toNumber() == 1, "Total users must be 1");
    assert(userAccount.userAmount.toNumber() == 1.8 * LAMPORTS_PER_SOL, "User deposit amount must be 1.8 SOL");

  });

  it("Withdraw sol", async () => {

    await program.methods
    .deposit(new BN(4 * LAMPORTS_PER_SOL))
    .accounts({
      payer: anotherPayer.publicKey,
      vault: vaultPDA,
      user: anotherUserPDA
    })
    .signers([anotherPayer])
    .rpc();

    const vaultAccount = await program.account.vault.fetch(vaultPDA);
    const userAccount = await program.account.user.fetch(userPDA);
    const AnotherUserAccount = await program.account.user.fetch(anotherUserPDA);

    assert(vaultAccount.totalDeposit.toNumber() == 5.4 * LAMPORTS_PER_SOL, "Total deposit must be 5.4 SOL");
    assert(vaultAccount.totalUsers.toNumber() == 2, "Total users must be 2");
    assert(userAccount.userAmount.toNumber() == 1.8 * LAMPORTS_PER_SOL, "User deposit amount must be 1.8 SOL");
    assert(AnotherUserAccount.userAmount.toNumber() == 3.6 * LAMPORTS_PER_SOL, "User deposit amount must be 3.6 SOL");

    await program.methods
    .withdraw(new BN(1.3 * LAMPORTS_PER_SOL))
    .accounts({
      payer: newPayer.publicKey,
      vault: vaultPDA,
      user: userPDA
    })
    .signers([newPayer])
    .rpc();
    
    await program.methods
    .withdraw(new BN(2.7 * LAMPORTS_PER_SOL))
    .accounts({
      payer: anotherPayer.publicKey,
      vault: vaultPDA,
      user: anotherUserPDA
    })
    .signers([anotherPayer])
    .rpc();

    
    const vaultAccountAfter = await program.account.vault.fetch(vaultPDA);
    const userAccountAfter = await program.account.user.fetch(userPDA);
    const anotherUserAccountAfter = await program.account.user.fetch(anotherUserPDA);

    
    assert(vaultAccountAfter.totalDeposit.toNumber() == 1.4 * LAMPORTS_PER_SOL, "Total deposit must be 1.4 SOL");
    assert(vaultAccountAfter.totalUsers.toNumber() == 2, "Total users must be 2");
    
  
    assert(userAccountAfter.userAmount.toNumber() == 0.5 * LAMPORTS_PER_SOL, "User 1 should have 0.5 left");
    assert(anotherUserAccountAfter.userAmount.toNumber() == 0.9 * LAMPORTS_PER_SOL, "User 2 should have 0.9 left");
  });

  
});

async function confirmAirdrop(connection: anchor.web3.Connection, publicKey: anchor.web3.PublicKey, amount = 10) {

  const signature = await connection.requestAirdrop(
    publicKey,
    amount * LAMPORTS_PER_SOL
  );

  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: signature,
  });

}
