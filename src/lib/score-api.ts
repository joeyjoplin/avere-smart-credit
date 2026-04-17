// Score engine API client
// Endpoints: GET /score, POST /score/installments, POST /score/sign-update-score

import { PublicKey, Transaction } from "@solana/web3.js";

const SCORE_API = import.meta.env.VITE_SCORE_API ?? "http://localhost:8000";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoreResponse {
  score: number;
  tier: "A" | "B" | "C" | "D";
  max_loan_usdc: number;   // base units (6 dec)
  min_loan_usdc: number;   // base units (6 dec)
  base_rate_bps: number;
}

export interface InstallmentItem {
  due_ts: number;
  amount_usdc: number;     // base units (6 dec)
  principal: number;
  interest: number;
  paid: boolean;
}

export interface InstallmentsRequest {
  principal: number;       // base units (6 dec)
  base_rate_bps: number;
  collateral_usdc: number; // base units (6 dec)
  score_tier: string;
  n_months: number;
}

export interface InstallmentsResponse {
  hybrid_defi_pct: number;
  hybrid_trad_pct: number;
  defi_rate_bps: number;
  trad_rate_bps: number;
  blended_rate_bps: number;
  monthly_payment_usdc: number;   // base units
  total_cost_usdc: number;        // base units
  total_interest_usdc: number;    // base units
  first_due_ts: number;
  installments: InstallmentItem[];
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchScore(wallet: string): Promise<ScoreResponse> {
  const res = await fetch(`${SCORE_API}/score?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Score API error ${res.status}`);
  }
  return res.json();
}

export async function fetchInstallments(
  req: InstallmentsRequest
): Promise<InstallmentsResponse> {
  const res = await fetch(`${SCORE_API}/score/installments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Installments API error ${res.status}`);
  }
  return res.json();
}

// ── Oracle signing helpers ────────────────────────────────────────────────────

/** Returns the score engine oracle's public key. */
export async function fetchOraclePubkey(): Promise<PublicKey> {
  const res = await fetch(`${SCORE_API}/oracle-pubkey`);
  if (!res.ok) throw new Error(`Oracle pubkey fetch failed: ${res.status}`);
  const { pubkey } = await res.json();
  return new PublicKey(pubkey);
}

/**
 * Sends a partially-built update_score transaction to the score engine for
 * oracle co-signing. Returns the transaction with the oracle signature applied.
 *
 * The caller must still have the owner wallet sign before submitting.
 */
export async function requestOracleSignature(
  wallet: string,
  newScore: number,
  tx: Transaction
): Promise<Transaction> {
  const txBase64 = Buffer.from(
    tx.serialize({ requireAllSignatures: false })
  ).toString("base64");

  const res = await fetch(`${SCORE_API}/score/sign-update-score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, new_score: newScore, tx_base64: txBase64 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Oracle signing failed: ${res.status}`);
  }
  const { signed_tx_base64 } = await res.json();
  return Transaction.from(Buffer.from(signed_tx_base64, "base64"));
}
