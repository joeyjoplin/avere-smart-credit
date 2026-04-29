/**
 * fund_demo_wallets.ts — Pre-fund the 5 demo wallets used in the live demo flow.
 *
 * Run from smartcontracts/:
 *   yarn ts-node scripts/fund_demo_wallets.ts
 *
 * What it does (idempotent — re-run safe):
 *   1. Reads scripts/keypairs/demo-{1..5}-keypair.json
 *   2. Ensures each wallet has >= 0.05 SOL (transfers from deployer if not)
 *   3. Ensures each wallet has a USDC ATA
 *   4. Ensures each wallet has >= 5 USDC (mints from mint authority if not, up to 20)
 *
 * Prerequisites:
 *   • solana-keygen new --outfile scripts/keypairs/demo-{N}-keypair.json
 *   • Deployer keypair at ~/.config/solana/id.json with >= 1 SOL on devnet
 *   • The Circle devnet USDC mint accepts your mint authority — we use the
 *     score_engine/faucet-keypair.json wallet as the funding source for USDC
 *     (transfer, not mint), so it must hold a USDC balance topped from
 *     https://faucet.circle.com.
 */

import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import fs from "fs";
import path from "path";

// ── Constants ─────────────────────────────────────────────────────────────────

const HELIUS_DEVNET =
  process.env.SOLANA_RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=441f3359-754d-4ee8-9bfc-940a44c92d00";

const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const USDC_DECIMALS = 6;

const MIN_SOL_BALANCE = 0.05;        // SOL each wallet should have
const TRANSFER_SOL    = 0.10;        // SOL we send when topping up
const MIN_USDC_UNITS  = 5_000_000;   // 5 USDC base units
const TOPUP_USDC_UNITS = 20_000_000; // top to 20 USDC

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadKeypair(filePath: string): Keypair {
  const resolved = filePath.startsWith("~")
    ? path.join(process.env.HOME!, filePath.slice(1))
    : path.resolve(filePath);
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8")) as number[];
  return Keypair.fromSecretKey(Buffer.from(raw));
}

async function ensureSol(
  conn: Connection,
  wallet: PublicKey,
  funder: Keypair,
  label: string
): Promise<void> {
  const balance = await conn.getBalance(wallet);
  const balanceSol = balance / LAMPORTS_PER_SOL;
  if (balanceSol >= MIN_SOL_BALANCE) {
    console.log(`  ${label}: ${balanceSol.toFixed(4)} SOL — OK`);
    return;
  }
  console.log(`  ${label}: ${balanceSol.toFixed(4)} SOL — sending ${TRANSFER_SOL} SOL…`);
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: funder.publicKey,
      toPubkey: wallet,
      lamports: Math.floor(TRANSFER_SOL * LAMPORTS_PER_SOL),
    })
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [funder], { commitment: "confirmed" });
  console.log(`  ${label}: SOL transferred. tx: ${sig.slice(0, 12)}…`);
}

async function ensureUsdcAta(
  conn: Connection,
  payer: Keypair,
  owner: PublicKey
): Promise<PublicKey> {
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner);
  const info = await conn.getAccountInfo(ata);
  if (info) return ata;
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      payer.publicKey,
      ata,
      owner,
      USDC_MINT,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
  await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
  return ata;
}

async function getUsdcBalance(conn: Connection, ata: PublicKey): Promise<bigint> {
  try {
    const acc = await getAccount(conn, ata);
    return acc.amount;
  } catch {
    return BigInt(0);
  }
}

async function ensureUsdc(
  conn: Connection,
  recipientAta: PublicKey,
  faucetKp: Keypair,
  faucetAta: PublicKey,
  label: string
): Promise<void> {
  const balance = await getUsdcBalance(conn, recipientAta);
  if (balance >= BigInt(MIN_USDC_UNITS)) {
    console.log(`  ${label}: ${(Number(balance) / 1e6).toFixed(2)} USDC — OK`);
    return;
  }
  const needed = BigInt(TOPUP_USDC_UNITS) - balance;
  console.log(`  ${label}: ${(Number(balance) / 1e6).toFixed(2)} USDC — sending ${(Number(needed) / 1e6).toFixed(2)} USDC…`);

  const faucetBalance = await getUsdcBalance(conn, faucetAta);
  if (faucetBalance < needed) {
    throw new Error(
      `Faucet wallet has only ${(Number(faucetBalance) / 1e6).toFixed(2)} USDC ` +
      `but needs ${(Number(needed) / 1e6).toFixed(2)} for ${label}. ` +
      `Top up via https://faucet.circle.com (Solana Devnet) to address ${faucetKp.publicKey.toBase58()}.`
    );
  }

  const tx = new Transaction().add(
    createTransferCheckedInstruction(
      faucetAta,
      USDC_MINT,
      recipientAta,
      faucetKp.publicKey,
      needed,
      USDC_DECIMALS
    )
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [faucetKp], { commitment: "confirmed" });
  console.log(`  ${label}: USDC transferred. tx: ${sig.slice(0, 12)}…`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Use the SAME deployer keypair as setup_devnet.ts uses for SOL fees
  const deployerKp = loadKeypair("~/.config/solana/id.json");
  console.log(`Deployer (SOL funder): ${deployerKp.publicKey.toBase58()}\n`);

  // Faucet wallet that holds devnet USDC (topped via faucet.circle.com)
  const faucetKpPath = path.join(__dirname, "..", "..", "score_engine", "faucet-keypair.json");
  if (!fs.existsSync(faucetKpPath)) {
    throw new Error(
      `Faucet keypair not found at ${faucetKpPath}. ` +
      `Generate with: solana-keygen new --outfile score_engine/faucet-keypair.json`
    );
  }
  const faucetKp = loadKeypair(faucetKpPath);
  console.log(`Faucet wallet (USDC source): ${faucetKp.publicKey.toBase58()}\n`);

  const conn = new Connection(HELIUS_DEVNET, "confirmed");

  // Faucet wallet signs USDC transfers — needs a tiny SOL balance for fees.
  await ensureSol(conn, faucetKp.publicKey, deployerKp, "Faucet");

  const faucetAta = await ensureUsdcAta(conn, deployerKp, faucetKp.publicKey);

  const faucetBalance = await getUsdcBalance(conn, faucetAta);
  console.log(`Faucet USDC balance: ${(Number(faucetBalance) / 1e6).toFixed(2)} USDC`);
  if (faucetBalance < BigInt(TOPUP_USDC_UNITS * 5)) {
    console.warn(
      `\n  WARNING: faucet balance may be insufficient to fund all 5 wallets to ${TOPUP_USDC_UNITS / 1e6} USDC each.\n` +
      `  Top up at https://faucet.circle.com (Solana Devnet) → ${faucetKp.publicKey.toBase58()}\n`
    );
  }
  console.log("");

  const KEYPAIRS_DIR = path.join(__dirname, "..", "..", "scripts", "keypairs");
  const summary: Array<{ id: number; pubkey: string; sol: number; usdc: number }> = [];

  for (let i = 1; i <= 5; i++) {
    const kpPath = path.join(KEYPAIRS_DIR, `demo-${i}-keypair.json`);
    if (!fs.existsSync(kpPath)) {
      console.log(`[demo-${i}] keypair missing at ${kpPath} — skipping`);
      continue;
    }
    const kp = loadKeypair(kpPath);
    console.log(`[${i}/5] ${kp.publicKey.toBase58()}`);

    await ensureSol(conn, kp.publicKey, deployerKp, `  SOL  `);
    const ata = await ensureUsdcAta(conn, deployerKp, kp.publicKey);
    await ensureUsdc(conn, ata, faucetKp, faucetAta, `  USDC `);

    const finalSol = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
    const finalUsdc = Number(await getUsdcBalance(conn, ata)) / 1e6;
    summary.push({ id: i, pubkey: kp.publicKey.toBase58(), sol: finalSol, usdc: finalUsdc });
    console.log("");
  }

  console.log("─".repeat(78));
  console.log("Demo wallets ready:");
  console.log("─".repeat(78));
  console.log("ID | Pubkey                                        | SOL    | USDC");
  for (const r of summary) {
    console.log(`${r.id}  | ${r.pubkey} | ${r.sol.toFixed(4)} | ${r.usdc.toFixed(2)}`);
  }
  console.log("");
  console.log("Demo flow:");
  console.log("  1. Open avere-smart-credit.vercel.app (or local dev) in incognito");
  console.log("  2. Click \"Use a demo wallet\" on the deposit screen");
  console.log("  3. Pick a demo wallet, confirm, deposit\n");
}

main().catch((err) => {
  console.error("\nFunding failed:", err);
  process.exit(1);
});
