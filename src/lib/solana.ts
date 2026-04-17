import {
  Connection,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AnchorProvider, Program, BN } from "@coral-xyz/anchor";
import type { Smartcontracts } from "./smartcontracts-types";
import idl from "./smartcontracts.json";

// ── Network ────────────────────────────────────────────────────────────────────
export const SOLANA_RPC =
  import.meta.env.VITE_SOLANA_RPC ?? clusterApiUrl("devnet");

export const connection = new Connection(SOLANA_RPC, "confirmed");

// ── Program ────────────────────────────────────────────────────────────────────
export const PROGRAM_ID = new PublicKey(
  "FCfqU7hKCSZGkmPiVqZqhjq2v585uwPM4VvieqgnJm2j"
);

// ── Token ──────────────────────────────────────────────────────────────────────
export const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" // standard devnet USDC (Circle faucet)
);

export const USDC_DECIMALS = 6;

/** Convert display dollars (number) → USDC base units (u64). */
export function toUsdc(dollars: number): BN {
  return new BN(Math.round(dollars * 10 ** USDC_DECIMALS));
}

/** Convert USDC base units (BN | bigint | number) → display dollars. */
export function fromUsdc(units: BN | bigint | number): number {
  const n = typeof units === "bigint" ? Number(units) : BN.isBN(units) ? units.toNumber() : units;
  return n / 10 ** USDC_DECIMALS;
}

// ── Seeds (must match constants.rs) ───────────────────────────────────────────
export const SEED_VAULT     = Buffer.from("vault");
export const SEED_LOAN_TRAD = Buffer.from("loan-t");
export const SEED_BANK_POOL = Buffer.from("bank-pool");

// ── PDA helpers ───────────────────────────────────────────────────────────────

export function deriveVaultPDA(owner: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_VAULT, owner.toBuffer()],
    PROGRAM_ID
  );
}

export function deriveLoanTradPDA(
  vaultPDA: PublicKey,
  loanId: number
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SEED_LOAN_TRAD, vaultPDA.toBuffer(), Buffer.from([loanId])],
    PROGRAM_ID
  );
}

export function deriveBankPoolPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([SEED_BANK_POOL], PROGRAM_ID);
}

/** ATA for vaultPDA to hold USDC. */
export function vaultUsdcAta(vaultPDA: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, vaultPDA, true);
}

/** ATA for owner wallet to hold USDC. */
export function ownerUsdcAta(owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(USDC_MINT, owner);
}

/** ATA for bankPoolPDA to hold USDC. */
export function bankPoolUsdcAta(): PublicKey {
  const [bankPoolPDA] = deriveBankPoolPDA();
  return getAssociatedTokenAddressSync(USDC_MINT, bankPoolPDA, true);
}

// ── Program factory ────────────────────────────────────────────────────────────

export function getProgram(provider: AnchorProvider): Program<Smartcontracts> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Program(idl as any, provider);
}

export { TOKEN_PROGRAM_ID, BN };
