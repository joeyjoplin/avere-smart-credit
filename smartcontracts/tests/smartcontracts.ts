/**
 * Avere — Anchor Integration Test Suite
 *
 * Covers every instruction in the program.
 * Run one group at a time:  anchor test -- --grep "initialize_vault"
 *
 * Tests marked @devnet-only require external programs (Kamino, Pyth)
 * and are skipped on localnet.
 *
 * NOTE: Anchor 0.31 auto-resolves PDAs whose seeds are fully derivable from
 * signers/constants. vault ([SEED_VAULT, owner]) and bankPool ([SEED_BANK_POOL])
 * are auto-resolved and must NOT be passed to .accounts().
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { Smartcontracts } from "../target/types/smartcontracts";
import {
  PublicKey,
  LAMPORTS_PER_SOL,
  Keypair,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccount,
  createAssociatedTokenAccountIdempotent,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

// ─── Seed constants — must match constants.rs exactly ───────────────────────
const SEED_VAULT     = Buffer.from("vault");
const SEED_LOAN_TRAD = Buffer.from("loan-t");
const SEED_BANK_POOL = Buffer.from("bank-pool");

// ─── Business-rule constants — must match constants.rs ───────────────────────
const MIN_LOAN_USDC    = new BN(1_000_000);
const MAX_INSTALLMENTS = 12;
const SCORE_MAX        = 1000;

// ─── PDA helpers ─────────────────────────────────────────────────────────────

function deriveVaultPDA(owner: PublicKey, programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VAULT, owner.toBuffer()],
    programId
  );
}

function deriveLoanTradPDA(
  vaultPDA: PublicKey,
  loanId: number,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_LOAN_TRAD, vaultPDA.toBuffer(), Buffer.from([loanId])],
    programId
  );
}

function deriveBankPoolPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_BANK_POOL], programId);
}

// ─── Test utilities ──────────────────────────────────────────────────────────

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  sol = 10
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, "confirmed");
}

/** Create an ATA for an off-curve owner (PDA).
 *  Uses the idempotent variant — newer ATA program versions reject the
 *  non-idempotent Create instruction when the owner is off-curve. */
async function createPdaAta(
  connection: anchor.web3.Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  return createAssociatedTokenAccountIdempotent(
    connection,
    payer,
    mint,
    owner,
    undefined,           // confirmOptions
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    true                 // allowOwnerOffCurve
  );
}

function makeInstallments(count: number, monthlyUsdc: number) {
  const now = Math.floor(Date.now() / 1000);
  return Array.from({ length: count }, (_, i) => ({
    dueTs:      new BN(now + (i + 1) * 30 * 24 * 3600),
    amountUsdc: new BN(monthlyUsdc),
  }));
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("avere", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Smartcontracts as Program<Smartcontracts>;
  const conn    = provider.connection;

  // Shared — created once in `before`
  let usdcMint:        PublicKey;
  let mintAuthority:   Keypair;
  let oracleKeypair:   Keypair;
  let bankPoolPDA:     PublicKey;
  let bankPoolUsdcAta: PublicKey;

  // Recreated per test in `beforeEach`
  let user:     Keypair;
  let vaultPDA: PublicKey;

  // ─── Global setup ────────────────────────────────────────────────────────

  before(async () => {
    // Load the deterministic test mint authority whose pubkey is baked into the
    // usdc-mint-account.json fixture (pre-seeded by [[test.validator.account]]).
    mintAuthority = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(fs.readFileSync(
          path.join(__dirname, "fixtures/test-mint-authority.json"), "utf8"
        ))
      )
    );
    await airdrop(conn, mintAuthority.publicKey);

    // Load oracle keypair — required signer for update_score.
    // File is gitignored; generate with: node score_engine/scripts/gen_oracle_keypair.js
    oracleKeypair = Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(fs.readFileSync(
          path.join(__dirname, "../../score_engine/oracle-keypair.json"), "utf8"
        ))
      )
    );

    // USDC mint is pre-seeded at the canonical devnet address by the test validator fixture.
    // The fixture sets mintAuthority as the mint authority so we can call mintTo in tests.
    usdcMint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

    [bankPoolPDA] = deriveBankPoolPDA(program.programId);

    // Initialize BankPool PDA (program-wide, done once).
    // If the validator already has the account from a prior run, skip silently.
    try {
      await program.methods
        .initializeBankPool()
        .accounts({
          authority: provider.wallet.publicKey,
          // bankPool and systemProgram are auto-resolved
        })
        .rpc();
    } catch (e: any) {
      // 0x0 = SystemProgram "account already in use" — BankPool already exists
      if (!e?.message?.includes("already in use") && !e?.message?.includes("0x0")) throw e;
    }

    // Create BankPool USDC ATA (authority = bankPoolPDA — off-curve)
    bankPoolUsdcAta = await createPdaAta(conn, mintAuthority, usdcMint, bankPoolPDA);
  });

  // ─── Per-test setup ──────────────────────────────────────────────────────

  beforeEach(async () => {
    user = Keypair.generate();
    await airdrop(conn, user.publicKey);
    [vaultPDA] = deriveVaultPDA(user.publicKey, program.programId);
  });

  // ─── Shared helpers ──────────────────────────────────────────────────────

  async function initVault(): Promise<void> {
    await program.methods
      .initializeVault()
      .accounts({
        owner: user.publicKey,
        // vault and systemProgram are auto-resolved
      })
      .signers([user])
      .rpc();
  }

  async function setScore(score: number): Promise<void> {
    await program.methods
      .updateScore(score)
      .accounts({
        owner:          user.publicKey,
        scoreAuthority: oracleKeypair.publicKey,
      } as any)
      .signers([user, oracleKeypair])
      .rpc();
  }

  /** Create user + vault USDC ATAs and fund user with `userAmountUsdc` tokens. */
  async function setupUsdcAccounts(userAmountUsdc: number): Promise<{
    userUsdcAta:  PublicKey;
    vaultUsdcAta: PublicKey;
  }> {
    const userUsdcAta = await createAssociatedTokenAccount(
      conn, user, usdcMint, user.publicKey
    );
    await mintTo(conn, mintAuthority, usdcMint, userUsdcAta, mintAuthority, userAmountUsdc);

    // vaultPDA is off-curve → allowOwnerOffCurve = true (8th parameter)
    const vaultUsdcAta = await createPdaAta(conn, user, usdcMint, vaultPDA);
    return { userUsdcAta, vaultUsdcAta };
  }

  /** Seed BankPool ATA with USDC for disbursement tests. */
  async function fundBankPool(amount = 10_000_000_000): Promise<void> {
    await mintTo(conn, mintAuthority, usdcMint, bankPoolUsdcAta, mintAuthority, amount);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // initialize_vault
  // ═══════════════════════════════════════════════════════════════════════════

  describe("initialize_vault", () => {
    it("creates vault with every field at zero/default", async () => {
      await initVault();

      const vault = await program.account.userVault.fetch(vaultPDA);

      assert.ok(vault.owner.equals(user.publicKey), "owner must match signer");
      assert.equal(vault.score, 0,                  "score must start at 0");
      assert.deepEqual(vault.scoreTier, { d: {} },  "tier must start at D");

      assert.ok(new BN(vault.usdcDeposited).isZero(), "usdcDeposited must be 0");
      assert.ok(new BN(vault.usdcLocked).isZero(),    "usdcLocked must be 0");
      assert.ok(new BN(vault.solDeposited).isZero(),  "solDeposited must be 0");
      assert.ok(new BN(vault.solLocked).isZero(),     "solLocked must be 0");
      assert.ok(new BN(vault.kaminoShares).isZero(),  "kaminoShares must be 0");

      assert.equal(vault.activeLoans, 0, "activeLoans must be 0");
      assert.isAbove(
        new BN(vault.createdAt).toNumber(),
        0,
        "createdAt must be a valid timestamp"
      );
    });

    it("rejects re-initialization of the same vault", async () => {
      await initVault();

      try {
        await initVault();
        assert.fail("expected error — vault already initialized");
      } catch (err: any) {
        assert.ok(
          err.message?.includes("already in use") ||
          err.logs?.some((l: string) => l.includes("already in use")),
          "must throw 'already in use'"
        );
      }
    });

    it("produces a unique PDA for each distinct wallet", async () => {
      const user2 = Keypair.generate();
      await airdrop(conn, user2.publicKey);
      const [vault2PDA] = deriveVaultPDA(user2.publicKey, program.programId);

      assert.ok(!vaultPDA.equals(vault2PDA), "PDAs must differ");

      await initVault();

      await program.methods
        .initializeVault()
        .accounts({ owner: user2.publicKey })
        .signers([user2])
        .rpc();

      const v1 = await program.account.userVault.fetch(vaultPDA);
      const v2 = await program.account.userVault.fetch(vault2PDA);
      assert.ok(v1.owner.equals(user.publicKey));
      assert.ok(v2.owner.equals(user2.publicKey));
    });

    it("rejects attacker passing a different user's vault PDA", async () => {
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        await program.methods
          .initializeVault()
          .accounts({ owner: attacker.publicKey })
          .signers([attacker])
          .rpc();
        // attacker gets their own vault — verify it's different from user's
        const [attackerVault] = deriveVaultPDA(attacker.publicKey, program.programId);
        assert.ok(!attackerVault.equals(vaultPDA), "attacker must get a different PDA");
      } catch (err: any) {
        assert.ok(err);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deposit_usdc
  // ═══════════════════════════════════════════════════════════════════════════

  describe("deposit_usdc", () => {
    beforeEach(async () => {
      await initVault();
    });

    it("increases usdc_deposited by the exact deposit amount", async () => {
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(10_000_000_000);
      const amount = new BN(1_000_000_000);

      await program.methods
        .depositUsdc(amount)
        .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.usdcDeposited).eq(amount));
    });

    it("accumulates multiple deposits correctly", async () => {
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(10_000_000_000);
      const a = new BN(500_000_000);
      const b = new BN(300_000_000);

      for (const amt of [a, b]) {
        await program.methods
          .depositUsdc(amt)
          .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
          .signers([user])
          .rpc();
      }

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.usdcDeposited).eq(a.add(b)));
    });

    it("moves tokens from user ATA to vault ATA", async () => {
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(10_000_000_000);
      const amount = new BN(2_000_000_000);
      const userBefore = (await getAccount(conn, userUsdcAta)).amount;

      await program.methods
        .depositUsdc(amount)
        .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      const userAfter  = (await getAccount(conn, userUsdcAta)).amount;
      const vaultAfter = (await getAccount(conn, vaultUsdcAta)).amount;

      assert.equal(userBefore - userAfter, BigInt(amount.toString()), "user balance must decrease");
      assert.equal(vaultAfter,             BigInt(amount.toString()), "vault ATA must hold deposit");
    });

    it("rejects a deposit of zero", async () => {
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(1_000_000_000);

      try {
        await program.methods
          .depositUsdc(new BN(0))
          .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
          .signers([user])
          .rpc();
        assert.fail("expected rejection for zero deposit");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it("rejects deposit from a signer that is not the vault owner", async () => {
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(1_000_000_000);

      try {
        await program.methods
          .depositUsdc(new BN(1_000_000))
          .accounts({
            owner: attacker.publicKey,
            usdcMint,
            userUsdcAta,
            vaultUsdcAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .signers([attacker])
          .rpc();
        assert.fail("expected Unauthorized");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it("usdc_free equals usdc_deposited when no collateral is locked", async () => {
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(5_000_000_000);
      const deposit = new BN(2_000_000_000);
      await program.methods
        .depositUsdc(deposit)
        .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      const vault = await program.account.userVault.fetch(vaultPDA);
      const free = new BN(vault.usdcDeposited).sub(new BN(vault.usdcLocked));
      assert.ok(free.eq(deposit), "usdc_free must equal deposited amount when usdcLocked is 0");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deposit_sol
  // ═══════════════════════════════════════════════════════════════════════════

  describe("deposit_sol", () => {
    beforeEach(async () => {
      await initVault();
    });

    it("increases sol_deposited by the exact deposit amount", async () => {
      const amount = new BN(LAMPORTS_PER_SOL);

      await program.methods
        .depositSol(amount)
        .accounts({ owner: user.publicKey } as any)
        .signers([user])
        .rpc();

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.solDeposited).eq(amount));
    });

    it("transfers native lamports into the vault PDA", async () => {
      const amount = new BN(LAMPORTS_PER_SOL);
      const before = await conn.getBalance(vaultPDA);

      await program.methods
        .depositSol(amount)
        .accounts({ owner: user.publicKey } as any)
        .signers([user])
        .rpc();

      const after = await conn.getBalance(vaultPDA);
      assert.equal(after - before, LAMPORTS_PER_SOL);
    });

    it("accumulates multiple SOL deposits", async () => {
      const a = new BN(LAMPORTS_PER_SOL);
      const b = new BN(2 * LAMPORTS_PER_SOL);

      for (const amt of [a, b]) {
        await program.methods
          .depositSol(amt)
          .accounts({ owner: user.publicKey } as any)
          .signers([user])
          .rpc();
      }

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.solDeposited).eq(a.add(b)));
    });

    it("rejects a deposit of zero lamports", async () => {
      try {
        await program.methods
          .depositSol(new BN(0))
          .accounts({ owner: user.publicKey } as any)
          .signers([user])
          .rpc();
        assert.fail("expected rejection for zero SOL deposit");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it("tracks SOL as raw lamports — msol_shares stays zero", async () => {
      await program.methods
        .depositSol(new BN(LAMPORTS_PER_SOL))
        .accounts({ owner: user.publicKey } as any)
        .signers([user])
        .rpc();

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.solDeposited).gtn(0));
      assert.ok(new BN(vault.msolShares).isZero(), "msol_shares must remain 0");
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // update_score
  // ═══════════════════════════════════════════════════════════════════════════

  describe("update_score", () => {
    beforeEach(async () => {
      await initVault();
    });

    it("writes the new score value to vault", async () => {
      await setScore(750);
      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.equal(vault.score, 750);
    });

    it("assigns Tier A for all scores in [800, 1000]", async () => {
      for (const s of [800, 850, 1000]) {
        await setScore(s);
        const vault = await program.account.userVault.fetch(vaultPDA);
        assert.deepEqual(vault.scoreTier, { a: {} }, `score ${s} must be Tier A`);
      }
    });

    it("assigns Tier B for all scores in [600, 799]", async () => {
      for (const s of [600, 680, 799]) {
        await setScore(s);
        const vault = await program.account.userVault.fetch(vaultPDA);
        assert.deepEqual(vault.scoreTier, { b: {} }, `score ${s} must be Tier B`);
      }
    });

    it("assigns Tier C for all scores in [400, 599]", async () => {
      for (const s of [400, 500, 599]) {
        await setScore(s);
        const vault = await program.account.userVault.fetch(vaultPDA);
        assert.deepEqual(vault.scoreTier, { c: {} }, `score ${s} must be Tier C`);
      }
    });

    it("assigns Tier D for all scores in [0, 399]", async () => {
      for (const s of [0, 100, 399]) {
        await setScore(s);
        const vault = await program.account.userVault.fetch(vaultPDA);
        assert.deepEqual(vault.scoreTier, { d: {} }, `score ${s} must be Tier D`);
      }
    });

    it("updates last_score_update on every call", async () => {
      // Use on-chain block time — test validator clock may differ from wall clock
      const slot = await conn.getSlot();
      const before = (await conn.getBlockTime(slot))! - 5;
      await setScore(600);
      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.isAbove(new BN(vault.lastScoreUpdate).toNumber(), before);
    });

    it("rejects score > 1000 or clamps it to 1000", async () => {
      try {
        await setScore(1001);
        const vault = await program.account.userVault.fetch(vaultPDA);
        assert.isAtMost(vault.score, SCORE_MAX, "score must be clamped");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it("tier boundary: 799 → Tier B, 800 → Tier A", async () => {
      await setScore(799);
      let vault = await program.account.userVault.fetch(vaultPDA);
      assert.deepEqual(vault.scoreTier, { b: {} }, "799 must be Tier B");

      await setScore(800);
      vault = await program.account.userVault.fetch(vaultPDA);
      assert.deepEqual(vault.scoreTier, { a: {} }, "800 must be Tier A");
    });

    it("tier boundary: 399 → Tier D, 400 → Tier C", async () => {
      await setScore(399);
      let vault = await program.account.userVault.fetch(vaultPDA);
      assert.deepEqual(vault.scoreTier, { d: {} }, "399 must be Tier D");

      await setScore(400);
      vault = await program.account.userVault.fetch(vaultPDA);
      assert.deepEqual(vault.scoreTier, { c: {} }, "400 must be Tier C");
    });

    it("rejects update from a signer that is not the vault owner", async () => {
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        await program.methods
          .updateScore(999)
          .accounts({
            owner:          attacker.publicKey,
            scoreAuthority: oracleKeypair.publicKey,
          } as any)
          .signers([attacker, oracleKeypair])
          .rpc();
        assert.fail("expected Unauthorized");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it("rejects update signed by an unauthorized oracle (non-oracle scoreAuthority)", async () => {
      const fakeOracle = Keypair.generate();
      await airdrop(conn, fakeOracle.publicKey);

      try {
        await program.methods
          .updateScore(750)
          .accounts({
            owner:          user.publicKey,
            scoreAuthority: fakeOracle.publicKey,
          } as any)
          .signers([user, fakeOracle])
          .rpc();
        assert.fail("expected Unauthorized — only the oracle keypair may co-sign");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "Unauthorized" ||
          err.message?.includes("Unauthorized"),
          "must reject score update without oracle co-signature"
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // approve_traditional_loan
  // ═══════════════════════════════════════════════════════════════════════════

  describe("approve_traditional_loan", () => {
    const LOAN_ID = 0;
    let loanPDA: PublicKey;

    beforeEach(async () => {
      await initVault();
      await setScore(810); // Tier A
      [loanPDA] = deriveLoanTradPDA(vaultPDA, LOAN_ID, program.programId);
    });

    async function approveLoan(opts: {
      principal?:    BN;
      fixedRateBps?: number;
      collateral?:   BN;
      defiPct?:      number;
      tradPct?:      number;
      defiRate?:     number;
      tradRate?:     number;
      installments?: { dueTs: BN; amountUsdc: BN }[];
      loanId?:       number;
    } = {}): Promise<void> {
      const lId         = opts.loanId ?? LOAN_ID;
      const [targetPDA] = deriveLoanTradPDA(vaultPDA, lId, program.programId);

      await program.methods
        .approveTraditionalLoan(
          opts.principal    ?? new BN(500_000_000),
          opts.fixedRateBps ?? 975,
          opts.collateral   ?? new BN(0),
          opts.defiPct      ?? 0,
          opts.tradPct      ?? 100,
          opts.defiRate     ?? 975,
          opts.tradRate     ?? 975,
          opts.installments ?? makeInstallments(3, 180_000_000)
        )
        .accounts({
          owner: user.publicKey,
          loan:  targetPDA,
          // vault and systemProgram are auto-resolved
        } as any)
        .signers([user])
        .rpc();
    }

    it("creates loan account with all fields written correctly", async () => {
      const schedule = makeInstallments(3, 180_000_000);
      await approveLoan({
        principal: new BN(500_000_000), fixedRateBps: 1035,
        collateral: new BN(0), defiPct: 0, tradPct: 100,
        defiRate: 575, tradRate: 975, installments: schedule,
      });

      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.ok(new BN(loan.principal).eq(new BN(500_000_000)));
      assert.equal(loan.fixedRateBps,  1035);
      assert.equal(loan.hybridDefiPct, 0);
      assert.equal(loan.hybridTradPct, 100);
      assert.equal(loan.defiRateBps,   575);
      assert.equal(loan.tradRateBps,   975);
      assert.equal(loan.nInstallments, 3);
      assert.equal(loan.paidCount,     0);
      assert.deepEqual(loan.status, { active: {} });
      assert.ok(loan.vault.equals(vaultPDA));
      assert.equal(loan.loanId, LOAN_ID);
    });

    it("records score tier at approval time", async () => {
      await approveLoan();
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.deepEqual(loan.scoreTier, { a: {} });
    });

    it("stores all installments unpaid with correct due dates", async () => {
      const schedule = makeInstallments(3, 200_000_000);
      await approveLoan({ installments: schedule });

      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      for (let i = 0; i < 3; i++) {
        assert.ok(new BN(loan.installments[i].dueTs).eq(schedule[i].dueTs));
        assert.ok(new BN(loan.installments[i].amountUsdc).eq(schedule[i].amountUsdc));
        assert.isFalse(loan.installments[i].paid);
        assert.ok(new BN(loan.installments[i].paidTs).isZero());
      }
    });

    it("increments vault.active_loans", async () => {
      await approveLoan();
      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.equal(vault.activeLoans, 1);
    });

    it("locks collateral in vault.usdc_locked when collateral > 0", async () => {
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(10_000_000_000);
      await program.methods
        .depositUsdc(new BN(1_000_000_000))
        .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      const collateral = new BN(300_000_000);
      await approveLoan({ collateral, defiPct: 60, tradPct: 40 });

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.usdcLocked).eq(collateral));
    });

    it("zero collateral leaves usdc_locked unchanged", async () => {
      await approveLoan({ collateral: new BN(0) });
      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.ok(new BN(vault.usdcLocked).isZero());
    });

    // ── Error paths ──────────────────────────────────────────────────────────

    it("rejects hybrid split not summing to 100 (InvalidHybridSplit)", async () => {
      try {
        await approveLoan({ defiPct: 60, tradPct: 30 }); // 60 + 30 = 90 ≠ 100
        assert.fail("expected InvalidHybridSplit");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "InvalidHybridSplit" ||
          err.message?.includes("InvalidHybridSplit"),
          "must reject when hybrid percentages do not sum to 100"
        );
      }
    });

    it("rejects loan below $1 minimum (LoanBelowMinimum)", async () => {
      try {
        await approveLoan({ principal: new BN(10_000_000) });
        assert.fail("expected LoanBelowMinimum");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "LoanBelowMinimum" ||
          err.message?.includes("LoanBelowMinimum")
        );
      }
    });

    it("rejects more than 12 installments (TooManyInstallments)", async () => {
      try {
        await approveLoan({ installments: makeInstallments(13, 100_000_000) });
        assert.fail("expected TooManyInstallments");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "TooManyInstallments" ||
          err.message?.includes("TooManyInstallments")
        );
      }
    });

    it("rejects empty installment array", async () => {
      try {
        await approveLoan({ installments: [] });
        assert.fail("expected error for empty installments");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it("rejects collateral exceeding vault free USDC (InsufficientCollateral)", async () => {
      try {
        await approveLoan({ collateral: new BN(500_000_000) });
        assert.fail("expected InsufficientCollateral");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "InsufficientCollateral" ||
          err.message?.includes("InsufficientCollateral")
        );
      }
    });

    it("rejects Tier D wallet for traditional credit (TierNotEligible)", async () => {
      await setScore(200);
      try {
        await approveLoan();
        assert.fail("expected TierNotEligible");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "TierNotEligible" ||
          err.message?.includes("TierNotEligible")
        );
      }
    });

    it("rejects a fourth loan when three are already active (MaxLoansReached)", async () => {
      for (let i = 0; i < 3; i++) {
        await approveLoan({ loanId: i });
      }
      try {
        await approveLoan({ loanId: 3 });
        assert.fail("expected MaxLoansReached");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "MaxLoansReached" ||
          err.message?.includes("MaxLoansReached")
        );
      }
    });

    it("assigns sequential loan_id values (0, 1, 2) across multiple approvals", async () => {
      for (let i = 0; i < 3; i++) {
        const [lpda] = deriveLoanTradPDA(vaultPDA, i, program.programId);
        await approveLoan({ loanId: i });
        const loan = await program.account.loanAccountTraditional.fetch(lpda);
        assert.equal(loan.loanId, i, `loan ${i} must have loanId = ${i}`);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // disburse_traditional
  // ═══════════════════════════════════════════════════════════════════════════

  describe("disburse_traditional", () => {
    const LOAN_ID = 0;
    let loanPDA:     PublicKey;
    let userUsdcAta: PublicKey;

    beforeEach(async () => {
      await initVault();
      await setScore(810);
      [loanPDA] = deriveLoanTradPDA(vaultPDA, LOAN_ID, program.programId);

      userUsdcAta = await createAssociatedTokenAccount(conn, user, usdcMint, user.publicKey);

      await program.methods
        .approveTraditionalLoan(
          new BN(500_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(3, 180_000_000)
        )
        .accounts({ owner: user.publicKey, loan: loanPDA } as any)
        .signers([user])
        .rpc();
    });

    async function disburse(): Promise<void> {
      await program.methods
        .disburseTraditional()
        .accounts({
          owner:        user.publicKey,
          loan:         loanPDA,
          usdcMint,
          bankPoolUsdcAta,
          userUsdcAta,
          tokenProgram: TOKEN_PROGRAM_ID,
          // vault and bankPool are auto-resolved
        } as any)
        .signers([user])
        .rpc();
    }

    it("transfers principal USDC from BankPool to user ATA", async () => {
      await fundBankPool();
      const userBefore = (await getAccount(conn, userUsdcAta)).amount;

      await disburse();

      const userAfter = (await getAccount(conn, userUsdcAta)).amount;
      assert.equal(userAfter - userBefore, BigInt(500_000_000));
    });

    it("sets loan.disbursed_at to a valid on-chain timestamp", async () => {
      await fundBankPool();
      await disburse();
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isAbove(new BN(loan.disbursedAt).toNumber(), 0);
    });

    it("rejects disbursement when BankPool lacks liquidity (PoolInsufficientLiquidity)", async () => {
      // BankPool has zero USDC at test start
      try {
        await disburse();
        assert.fail("expected PoolInsufficientLiquidity");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "PoolInsufficientLiquidity" ||
          err.message?.includes("PoolInsufficientLiquidity") ||
          err.message?.includes("insufficient")
        );
      }
    });

    it("rejects a second disbursement on the same loan (LoanNotActive)", async () => {
      await fundBankPool(20_000_000_000);
      await disburse();

      try {
        await disburse();
        assert.fail("expected LoanNotActive on second disburse");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "LoanNotActive" ||
          err.message?.includes("LoanNotActive")
        );
      }
    });

    it("decreases BankPool USDC balance by principal on disburse", async () => {
      await fundBankPool();
      const poolBefore = (await getAccount(conn, bankPoolUsdcAta)).amount;

      await disburse();

      const poolAfter = (await getAccount(conn, bankPoolUsdcAta)).amount;
      assert.equal(poolBefore - poolAfter, BigInt(500_000_000), "pool must decrease by principal");
    });

    it("rejects disbursement from a non-owner signer (Unauthorized)", async () => {
      await fundBankPool();
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        await program.methods
          .disburseTraditional()
          .accounts({
            owner:        attacker.publicKey,
            loan:         loanPDA,
            usdcMint,
            bankPoolUsdcAta,
            userUsdcAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .signers([attacker])
          .rpc();
        assert.fail("expected Unauthorized");
      } catch (err: any) {
        assert.ok(err);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // repay_installment
  // ═══════════════════════════════════════════════════════════════════════════

  describe("repay_installment", () => {
    const LOAN_ID    = 0;
    let loanPDA:     PublicKey;
    let userUsdcAta: PublicKey;

    beforeEach(async () => {
      await initVault();
      await setScore(810);
      [loanPDA] = deriveLoanTradPDA(vaultPDA, LOAN_ID, program.programId);

      ({ userUsdcAta } = await setupUsdcAccounts(10_000_000_000));

      await program.methods
        .approveTraditionalLoan(
          new BN(350_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(2, 185_000_000)
        )
        .accounts({ owner: user.publicKey, loan: loanPDA } as any)
        .signers([user])
        .rpc();

      await fundBankPool(10_000_000_000);

      await program.methods
        .disburseTraditional()
        .accounts({ owner: user.publicKey, loan: loanPDA, usdcMint, bankPoolUsdcAta, userUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();
    });

    async function repay(index: number): Promise<void> {
      await program.methods
        .repayInstallment(index)
        .accounts({
          owner:          user.publicKey,
          loan:           loanPDA,
          bankPool:       bankPoolPDA,
          usdcMint,
          userUsdcAta,
          bankPoolUsdcAta,
          tokenProgram:   TOKEN_PROGRAM_ID,
          // vault is auto-resolved
        } as any)
        .signers([user])
        .rpc();
    }

    it("marks installment[0] as paid", async () => {
      await repay(0);
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isTrue(loan.installments[0].paid);
    });

    it("writes paid_ts on repayment — never zero after payment (rule 8)", async () => {
      // Use on-chain block time — test validator clock may differ from wall clock
      const slot = await conn.getSlot();
      const before = (await conn.getBlockTime(slot))! - 5;
      await repay(0);
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isAbove(new BN(loan.installments[0].paidTs).toNumber(), before);
    });

    it("increments paid_count after each repayment", async () => {
      await repay(0);
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.equal(loan.paidCount, 1);
    });

    it("transfers USDC from user ATA back to BankPool ATA", async () => {
      const userBefore = (await getAccount(conn, userUsdcAta)).amount;
      const poolBefore = (await getAccount(conn, bankPoolUsdcAta)).amount;

      await repay(0);

      const userAfter = (await getAccount(conn, userUsdcAta)).amount;
      const poolAfter = (await getAccount(conn, bankPoolUsdcAta)).amount;

      assert.equal(userBefore - userAfter,  BigInt(185_000_000));
      assert.equal(poolAfter  - poolBefore, BigInt(185_000_000));
    });

    it("does NOT mark other installments when one is repaid", async () => {
      await repay(0);
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isFalse(loan.installments[1].paid);
    });

    it("marks loan.status as Paid when all installments are cleared", async () => {
      await repay(0);
      await repay(1);
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.deepEqual(loan.status, { paid: {} });
    });

    it("decrements vault.active_loans to 0 when the final installment is repaid", async () => {
      const before = await program.account.userVault.fetch(vaultPDA);
      assert.equal(before.activeLoans, 1, "should have 1 active loan before repay");

      await repay(0);
      await repay(1);

      const after = await program.account.userVault.fetch(vaultPDA);
      assert.equal(after.activeLoans, 0, "active_loans must be 0 after full repayment");
    });

    it("increments bank_pool.usdc_available by installment amount on repay", async () => {
      const before = await program.account.bankPool.fetch(bankPoolPDA);
      await repay(0);
      const after = await program.account.bankPool.fetch(bankPoolPDA);
      assert.ok(
        new BN(after.usdcAvailable).eq(
          new BN(before.usdcAvailable).add(new BN(185_000_000))
        ),
        "usdc_available must increase by the repaid installment amount"
      );
    });

    it("rejects repayment of an already-paid installment (InstallmentAlreadyPaid)", async () => {
      await repay(0);
      try {
        await repay(0);
        assert.fail("expected InstallmentAlreadyPaid");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "InstallmentAlreadyPaid" ||
          err.message?.includes("InstallmentAlreadyPaid")
        );
      }
    });

    it("rejects an out-of-bounds installment index (InvalidInstallmentIndex)", async () => {
      try {
        await repay(99);
        assert.fail("expected InvalidInstallmentIndex");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "InvalidInstallmentIndex" ||
          err.message?.includes("InvalidInstallmentIndex")
        );
      }
    });

    it("allows repaying a later installment before an earlier one (no ordering constraint)", async () => {
      await repay(1); // pay index 1 first
      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isTrue(loan.installments[1].paid,  "installment 1 should be marked paid");
      assert.isFalse(loan.installments[0].paid, "installment 0 should still be unpaid");
      assert.equal(loan.paidCount, 1);
    });

    it("rejects repayment from a non-owner signer (Unauthorized)", async () => {
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        await program.methods
          .repayInstallment(0)
          .accounts({
            owner:          attacker.publicKey,
            loan:           loanPDA,
            bankPool:       bankPoolPDA,
            usdcMint,
            userUsdcAta,
            bankPoolUsdcAta,
            tokenProgram:   TOKEN_PROGRAM_ID,
          } as any)
          .signers([attacker])
          .rpc();
        assert.fail("expected Unauthorized");
      } catch (err: any) {
        assert.ok(err);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // rebalance_yield — stub on localnet, CPI on devnet
  // ═══════════════════════════════════════════════════════════════════════════

  describe("rebalance_yield", () => {
    beforeEach(async () => {
      await initVault();
    });

    it("stub: instruction is callable and returns success on localnet", async () => {
      // handler is a no-op stub until Kamino CPI is wired; it must not revert
      await program.methods
        .rebalanceYield()
        .accounts({ owner: user.publicKey })
        .signers([user])
        .rpc();
    });

    it("rejects call from a non-owner signer", async () => {
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        // attacker's vault PDA doesn't exist → expect account-not-found or Unauthorized
        await program.methods
          .rebalanceYield()
          .accounts({ owner: attacker.publicKey })
          .signers([attacker])
          .rpc();
        assert.fail("expected error for non-owner signer");
      } catch (err: any) {
        assert.ok(err);
      }
    });

    it.skip("@devnet-only: deposits free USDC into Kamino and increases kamino_shares", () => {});
    it.skip("@devnet-only: never sends usdc_locked to Kamino", () => {});
    it.skip("@devnet-only: uses the correct Kamino split % for the vault's tier", () => {});
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // open_defi_loan — @devnet-only
  // ═══════════════════════════════════════════════════════════════════════════

  describe("open_defi_loan", () => {
    it("returns NotImplemented error — Phase 4 Pyth oracle + Kamino stub", async () => {
      await initVault();

      try {
        await program.methods
          .openDefiLoan(new BN(LAMPORTS_PER_SOL), new BN(1_000_000))
          .accounts({ owner: user.publicKey })
          .signers([user])
          .rpc();
        assert.fail("expected NotImplemented");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "NotImplemented" ||
          err.message?.includes("NotImplemented"),
          "openDefiLoan must return NotImplemented until Pyth/Kamino CPI is wired"
        );
      }
    });

    it.skip("@devnet-only: locks SOL collateral, reads Pyth, disburses USDC", () => {});
    it.skip("@devnet-only: rejects borrow exceeding 70% LTV (CollateralTooLow)", () => {});
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // initialize_bank_pool
  // ═══════════════════════════════════════════════════════════════════════════

  describe("initialize_bank_pool", () => {
    // BankPool is initialized in the global before() — we verify the resulting state.

    it("creates BankPool with a valid bump and usdc_available = 0", async () => {
      const pool = await program.account.bankPool.fetch(bankPoolPDA);
      assert.isAbove(pool.bump, 0, "bump must be a non-zero PDA bump");
      assert.ok(new BN(pool.usdcAvailable).isZero(), "usdc_available must start at 0");
    });

    it("BankPool PDA address is deterministic (only seed is 'bank-pool')", () => {
      const [rederived] = deriveBankPoolPDA(program.programId);
      assert.ok(rederived.equals(bankPoolPDA), "re-derived PDA must match stored address");
    });

    it("idempotency: second init attempt fails — account already in use", async () => {
      try {
        await program.methods
          .initializeBankPool()
          .accounts({ authority: provider.wallet.publicKey })
          .rpc();
        assert.fail("expected account-already-in-use error");
      } catch (err: any) {
        assert.ok(
          err.message?.includes("already in use") ||
          err.logs?.some((l: string) => l.includes("already in use")),
          "error must indicate account already exists"
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // close_loan
  // ═══════════════════════════════════════════════════════════════════════════

  describe("close_loan", () => {
    const CLOSE_LOAN_ID = 0;
    let closeLoanPDA:  PublicKey;
    let closeUserUsdc: PublicKey;

    /**
     * Full lifecycle helper: approve → disburse → repay all installments.
     * Leaves the loan in Paid status, ready for close_loan.
     */
    async function runFullLoanToCompletion(loanId = CLOSE_LOAN_ID): Promise<void> {
      [closeLoanPDA] = deriveLoanTradPDA(vaultPDA, loanId, program.programId);
      ({ userUsdcAta: closeUserUsdc } = await setupUsdcAccounts(10_000_000_000));

      await program.methods
        .approveTraditionalLoan(
          new BN(200_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(2, 110_000_000)
        )
        .accounts({ owner: user.publicKey, loan: closeLoanPDA } as any)
        .signers([user])
        .rpc();

      await fundBankPool(10_000_000_000);

      await program.methods
        .disburseTraditional()
        .accounts({
          owner: user.publicKey, loan: closeLoanPDA, usdcMint,
          bankPoolUsdcAta, userUsdcAta: closeUserUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([user])
        .rpc();

      for (let i = 0; i < 2; i++) {
        await program.methods
          .repayInstallment(i)
          .accounts({
            owner: user.publicKey, loan: closeLoanPDA, bankPool: bankPoolPDA,
            usdcMint, userUsdcAta: closeUserUsdc, bankPoolUsdcAta,
            tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .signers([user])
          .rpc();
      }
    }

    beforeEach(async () => {
      await initVault();
      await setScore(810); // Tier A
    });

    it("closes a fully paid loan and removes the on-chain account", async () => {
      await runFullLoanToCompletion();

      await program.methods
        .closeLoan()
        .accounts({ owner: user.publicKey, loan: closeLoanPDA } as any)
        .signers([user])
        .rpc();

      try {
        await program.account.loanAccountTraditional.fetch(closeLoanPDA);
        assert.fail("account must not exist after close");
      } catch (err: any) {
        assert.ok(
          err.message?.includes("Account does not exist") ||
          err.message?.includes("could not find account") ||
          err.message?.includes("Failed to find account"),
          "fetch must fail after account is deleted"
        );
      }
    });

    it("returns rent lamports to the owner on close", async () => {
      await runFullLoanToCompletion();

      const ownerBefore = await conn.getBalance(user.publicKey);

      await program.methods
        .closeLoan()
        .accounts({ owner: user.publicKey, loan: closeLoanPDA } as any)
        .signers([user])
        .rpc();

      const ownerAfter = await conn.getBalance(user.publicKey);
      // Rent recovery (~2.6M lamports for max_space account) far exceeds the tx fee (~5K lamports)
      assert.isAbove(ownerAfter, ownerBefore, "rent must exceed tx fee — owner balance must increase");
    });

    it("rejects closing an Active loan (LoanNotActive)", async () => {
      const [activeLoanPDA] = deriveLoanTradPDA(vaultPDA, CLOSE_LOAN_ID, program.programId);

      await program.methods
        .approveTraditionalLoan(
          new BN(100_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(1, 110_000_000)
        )
        .accounts({ owner: user.publicKey, loan: activeLoanPDA } as any)
        .signers([user])
        .rpc();

      try {
        await program.methods
          .closeLoan()
          .accounts({ owner: user.publicKey, loan: activeLoanPDA } as any)
          .signers([user])
          .rpc();
        assert.fail("expected LoanNotActive");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "LoanNotActive" ||
          err.message?.includes("LoanNotActive"),
          "error must be LoanNotActive"
        );
      }
    });

    it("rejects closing a partially repaid loan (still Active)", async () => {
      // beforeEach already called initVault + setScore(810)
      // Approve a 3-installment loan, pay only 1 of 3
      const [partialLoanPDA] = deriveLoanTradPDA(vaultPDA, 0, program.programId);
      const { userUsdcAta: partialUserUsdc } = await setupUsdcAccounts(10_000_000_000);

      await program.methods
        .approveTraditionalLoan(
          new BN(100_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(3, 40_000_000)
        )
        .accounts({ owner: user.publicKey, loan: partialLoanPDA } as any)
        .signers([user])
        .rpc();

      await fundBankPool(10_000_000_000);

      await program.methods
        .disburseTraditional()
        .accounts({
          owner: user.publicKey, loan: partialLoanPDA, usdcMint,
          bankPoolUsdcAta, userUsdcAta: partialUserUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([user])
        .rpc();

      // Pay only installment 0 of 3 — loan status remains Active
      await program.methods
        .repayInstallment(0)
        .accounts({
          owner: user.publicKey, loan: partialLoanPDA, bankPool: bankPoolPDA,
          usdcMint, userUsdcAta: partialUserUsdc, bankPoolUsdcAta,
          tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([user])
        .rpc();

      try {
        await program.methods
          .closeLoan()
          .accounts({ owner: user.publicKey, loan: partialLoanPDA } as any)
          .signers([user])
          .rpc();
        assert.fail("expected LoanNotActive for partially repaid loan");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "LoanNotActive" ||
          err.message?.includes("LoanNotActive")
        );
      }
    });

    it("rejects close by a non-owner signer (vault PDA mismatch)", async () => {
      await runFullLoanToCompletion();

      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        await program.methods
          .closeLoan()
          .accounts({ owner: attacker.publicKey, loan: closeLoanPDA } as any)
          .signers([attacker])
          .rpc();
        assert.fail("expected authorization error");
      } catch (err: any) {
        assert.ok(err, "non-owner must not close another user's loan");
      }
    });

    it("second close attempt fails — account is already deleted", async () => {
      await runFullLoanToCompletion();

      await program.methods
        .closeLoan()
        .accounts({ owner: user.publicKey, loan: closeLoanPDA } as any)
        .signers([user])
        .rpc();

      try {
        await program.methods
          .closeLoan()
          .accounts({ owner: user.publicKey, loan: closeLoanPDA } as any)
          .signers([user])
          .rpc();
        assert.fail("expected error on second close");
      } catch (err: any) {
        assert.ok(err, "second close must fail because account no longer exists");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // withdraw — stub (Kamino CPI wired in Phase 5)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("withdraw", () => {
    beforeEach(async () => {
      await initVault();
    });

    it("returns NotImplemented error — Phase 4 Kamino CPI stub", async () => {
      try {
        await program.methods
          .withdraw(new BN(1_000_000))
          .accounts({ owner: user.publicKey })
          .signers([user])
          .rpc();
        assert.fail("expected NotImplemented");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "NotImplemented" ||
          err.message?.includes("NotImplemented"),
          "withdraw must return NotImplemented until Kamino CPI is wired"
        );
      }
    });

    it("rejects call from a non-owner signer (vault PDA not found)", async () => {
      const attacker = Keypair.generate();
      await airdrop(conn, attacker.publicKey);

      try {
        await program.methods
          .withdraw(new BN(1_000_000))
          .accounts({ owner: attacker.publicKey })
          .signers([attacker])
          .rpc();
        assert.fail("expected error for attacker without a vault");
      } catch (err: any) {
        assert.ok(err);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // liquidate — stub (Pyth oracle + LTV check wired in Phase 5)
  // ═══════════════════════════════════════════════════════════════════════════

  describe("liquidate", () => {
    it("returns NotImplemented error — Phase 4 Pyth oracle + LTV stub", async () => {
      await initVault();

      try {
        await program.methods
          .liquidate()
          .accounts({ liquidator: user.publicKey, vault: vaultPDA } as any)
          .signers([user])
          .rpc();
        assert.fail("expected NotImplemented");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "NotImplemented" ||
          err.message?.includes("NotImplemented"),
          "liquidate must return NotImplemented until Pyth CPI is wired"
        );
      }
    });

    it("rejects liquidation of a non-existent vault", async () => {
      const ghost = Keypair.generate();
      const [ghostVaultPDA] = deriveVaultPDA(ghost.publicKey, program.programId);

      try {
        await program.methods
          .liquidate()
          .accounts({ liquidator: user.publicKey, vault: ghostVaultPDA } as any)
          .signers([user])
          .rpc();
        assert.fail("expected error for non-existent vault");
      } catch (err: any) {
        assert.ok(err, "liquidating a ghost vault must fail");
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Invariants
  // ═══════════════════════════════════════════════════════════════════════════

  describe("invariants", () => {
    it("usdc_free() never underflows — deposited=0, locked=0 → free=0", async () => {
      await initVault();
      const vault = await program.account.userVault.fetch(vaultPDA);
      const free = Math.max(
        0,
        new BN(vault.usdcDeposited).toNumber() - new BN(vault.usdcLocked).toNumber()
      );
      assert.isAtLeast(free, 0);
    });

    it("score is always in range [0, 1000] after update_score calls", async () => {
      await initVault();
      for (const s of [0, 400, 800, 1000]) {
        await setScore(s);
        const vault = await program.account.userVault.fetch(vaultPDA);
        assert.isAtLeast(vault.score, 0);
        assert.isAtMost(vault.score,  SCORE_MAX);
      }
    });

    it("active_loans caps at MAX_ACTIVE_LOANS = 3", async () => {
      await initVault();
      await setScore(810);

      for (let i = 0; i < 3; i++) {
        const [lpda] = deriveLoanTradPDA(vaultPDA, i, program.programId);
        await program.methods
          .approveTraditionalLoan(
            new BN(100_000_000), 975, new BN(0), 0, 100, 975, 975,
            makeInstallments(1, 110_000_000)
          )
          .accounts({ owner: user.publicKey, loan: lpda } as any)
          .signers([user])
          .rpc();
      }

      const vault = await program.account.userVault.fetch(vaultPDA);
      assert.equal(vault.activeLoans, 3);

      const [loan4] = deriveLoanTradPDA(vaultPDA, 3, program.programId);
      try {
        await program.methods
          .approveTraditionalLoan(
            new BN(100_000_000), 975, new BN(0), 0, 100, 975, 975,
            makeInstallments(1, 110_000_000)
          )
          .accounts({ owner: user.publicKey, loan: loan4 } as any)
          .signers([user])
          .rpc();
        assert.fail("expected MaxLoansReached");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "MaxLoansReached" ||
          err.message?.includes("MaxLoansReached")
        );
      }
    });

    it("paid_ts is always written on repay — blueprint absolute rule 8", async () => {
      await initVault();
      await setScore(810);

      const [loanPDA] = deriveLoanTradPDA(vaultPDA, 0, program.programId);
      const { userUsdcAta } = await setupUsdcAccounts(10_000_000_000);

      await program.methods
        .approveTraditionalLoan(
          new BN(200_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(1, 210_000_000)
        )
        .accounts({ owner: user.publicKey, loan: loanPDA } as any)
        .signers([user])
        .rpc();

      await fundBankPool(10_000_000_000);

      await program.methods.disburseTraditional()
        .accounts({ owner: user.publicKey, loan: loanPDA, usdcMint, bankPoolUsdcAta, userUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user]).rpc();

      await program.methods.repayInstallment(0)
        .accounts({ owner: user.publicKey, loan: loanPDA, bankPool: bankPoolPDA, usdcMint, userUsdcAta, bankPoolUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user]).rpc();

      const loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isAbove(
        new BN(loan.installments[0].paidTs).toNumber(),
        0,
        "paid_ts must NEVER be zero after a repayment — blueprint rule 8"
      );
    });

    it("repay_installment on a Paid loan is rejected (LoanNotActive)", async () => {
      await initVault();
      await setScore(810);

      const [loanPDA] = deriveLoanTradPDA(vaultPDA, 0, program.programId);
      const { userUsdcAta } = await setupUsdcAccounts(10_000_000_000);

      await program.methods
        .approveTraditionalLoan(
          new BN(100_000_000), 975, new BN(0), 0, 100, 975, 975,
          makeInstallments(1, 110_000_000)
        )
        .accounts({ owner: user.publicKey, loan: loanPDA } as any)
        .signers([user])
        .rpc();

      await fundBankPool(5_000_000_000);

      await program.methods
        .disburseTraditional()
        .accounts({ owner: user.publicKey, loan: loanPDA, usdcMint, bankPoolUsdcAta, userUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      // Repay sole installment → status becomes Paid
      await program.methods
        .repayInstallment(0)
        .accounts({ owner: user.publicKey, loan: loanPDA, bankPool: bankPoolPDA, usdcMint, userUsdcAta, bankPoolUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      // A second repay must fail — status is now Paid, not Active
      try {
        await program.methods
          .repayInstallment(0)
          .accounts({ owner: user.publicKey, loan: loanPDA, bankPool: bankPoolPDA, usdcMint, userUsdcAta, bankPoolUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
          .signers([user])
          .rpc();
        assert.fail("expected LoanNotActive or InstallmentAlreadyPaid");
      } catch (err: any) {
        assert.ok(
          err.error?.errorCode?.code === "LoanNotActive" ||
          err.error?.errorCode?.code === "InstallmentAlreadyPaid" ||
          err.message?.includes("LoanNotActive") ||
          err.message?.includes("InstallmentAlreadyPaid")
        );
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // End-to-end: full loan lifecycle
  // ═══════════════════════════════════════════════════════════════════════════

  describe("end-to-end: full loan lifecycle", () => {
    it("deposit → update_score → approve (hybrid) → disburse → repay-all → close", async () => {
      await initVault();

      // ── 1. Earn deposit ──────────────────────────────────────────────────
      const { userUsdcAta, vaultUsdcAta } = await setupUsdcAccounts(20_000_000_000);

      await program.methods
        .depositUsdc(new BN(1_000_000_000))         // $1 000 USDC
        .accounts({ owner: user.publicKey, usdcMint, userUsdcAta, vaultUsdcAta, tokenProgram: TOKEN_PROGRAM_ID } as any)
        .signers([user])
        .rpc();

      // ── 2. Score update (simulates off-chain engine response) ────────────
      await setScore(850); // Tier A — earn deposit +15 pts baked in

      let vault = await program.account.userVault.fetch(vaultPDA);
      assert.equal(vault.score, 850);
      assert.deepEqual(vault.scoreTier, { a: {} });
      assert.ok(new BN(vault.usdcDeposited).eq(new BN(1_000_000_000)));

      // ── 3. Approve loan with full hybrid split (Tier A max: 70% DeFi) ───
      const principal  = new BN(500_000_000);  // $500 USDC
      const collateral = new BN(350_000_000);  // $350 USDC locked as DeFi collateral
      const schedule   = makeInstallments(3, 180_000_000);

      const [loanPDA] = deriveLoanTradPDA(vaultPDA, 0, program.programId);

      await program.methods
        .approveTraditionalLoan(
          principal,
          975,           // blended rate 9.75% APR
          collateral,
          70, 30,        // 70% DeFi / 30% traditional (Tier A max)
          575, 975,      // defi_rate = 5.75%, trad_rate = 9.75%
          schedule
        )
        .accounts({ owner: user.publicKey, loan: loanPDA } as any)
        .signers([user])
        .rpc();

      vault = await program.account.userVault.fetch(vaultPDA);
      assert.equal(vault.activeLoans, 1);
      assert.ok(new BN(vault.usdcLocked).eq(collateral), "collateral must be locked in vault");

      let loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.ok(new BN(loan.principal).eq(principal));
      assert.equal(loan.fixedRateBps, 975);
      assert.equal(loan.hybridDefiPct, 70);
      assert.equal(loan.hybridTradPct, 30);
      assert.equal(loan.defiRateBps, 575);
      assert.equal(loan.tradRateBps, 975);
      assert.equal(loan.nInstallments, 3);
      assert.equal(loan.paidCount, 0);
      assert.deepEqual(loan.status, { active: {} });
      assert.deepEqual(loan.scoreTier, { a: {} });
      assert.equal(loan.disbursedAt.toString(), "0", "disbursed_at must be 0 before disburse");

      // ── 4. Disburse ──────────────────────────────────────────────────────
      await fundBankPool(10_000_000_000);
      const userBefore = (await getAccount(conn, userUsdcAta)).amount;
      const poolBefore = (await getAccount(conn, bankPoolUsdcAta)).amount;

      await program.methods
        .disburseTraditional()
        .accounts({
          owner: user.publicKey, loan: loanPDA, usdcMint,
          bankPoolUsdcAta, userUsdcAta, tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .signers([user])
        .rpc();

      const userAfter = (await getAccount(conn, userUsdcAta)).amount;
      const poolAfter = (await getAccount(conn, bankPoolUsdcAta)).amount;
      assert.equal(userAfter - userBefore, BigInt(principal.toString()), "user must receive principal");
      assert.equal(poolBefore - poolAfter, BigInt(principal.toString()), "pool must decrease by principal");

      loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.isAbove(new BN(loan.disbursedAt).toNumber(), 0, "disbursed_at must be set after disburse");

      // ── 5. Repay all 3 installments ──────────────────────────────────────
      const poolBeforeRepay = await program.account.bankPool.fetch(bankPoolPDA);

      for (let i = 0; i < 3; i++) {
        await program.methods
          .repayInstallment(i)
          .accounts({
            owner: user.publicKey, loan: loanPDA, bankPool: bankPoolPDA,
            usdcMint, userUsdcAta, bankPoolUsdcAta, tokenProgram: TOKEN_PROGRAM_ID,
          } as any)
          .signers([user])
          .rpc();
      }

      loan = await program.account.loanAccountTraditional.fetch(loanPDA);
      assert.deepEqual(loan.status, { paid: {} }, "loan must be Paid after all installments cleared");
      assert.equal(loan.paidCount, 3);

      for (let i = 0; i < 3; i++) {
        assert.isTrue(loan.installments[i].paid, `installment ${i} must be marked paid`);
        assert.isAbove(
          new BN(loan.installments[i].paidTs).toNumber(), 0,
          `paid_ts for installment ${i} must be non-zero (blueprint rule 8)`
        );
      }

      vault = await program.account.userVault.fetch(vaultPDA);
      assert.equal(vault.activeLoans, 0, "active_loans must be 0 after full repayment");

      const poolAfterRepay = await program.account.bankPool.fetch(bankPoolPDA);
      const totalRepaid = 3 * 180_000_000;
      assert.ok(
        new BN(poolAfterRepay.usdcAvailable).eq(
          new BN(poolBeforeRepay.usdcAvailable).add(new BN(totalRepaid))
        ),
        "usdc_available must increase by total repaid amount"
      );

      // ── 6. Close loan — recover rent ─────────────────────────────────────
      const ownerBefore = await conn.getBalance(user.publicKey);

      await program.methods
        .closeLoan()
        .accounts({ owner: user.publicKey, loan: loanPDA } as any)
        .signers([user])
        .rpc();

      const ownerBalanceAfter = await conn.getBalance(user.publicKey);
      assert.isAbove(ownerBalanceAfter, ownerBefore, "rent recovery must exceed tx fee");

      try {
        await program.account.loanAccountTraditional.fetch(loanPDA);
        assert.fail("loan account must be deleted after close");
      } catch (e: any) {
        assert.ok(e, "account must not exist after close");
      }
    });
  });
});
