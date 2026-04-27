// Score engine API client
// Endpoints: GET /score, POST /score/installments, POST /score/sign-update-score

import { PublicKey, Transaction } from "@solana/web3.js";

const SCORE_API = import.meta.env.VITE_SCORE_API ?? "";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  cashflow_score: number;        // 0–1000, weight 30%
  income_score: number;          // 0–1000, weight 35%
  onchain_score: number;         // 0–1000, weight 20%
  payment_history_score: number; // 0–1000, weight 15%
  macro_multiplier: number;      // 0.8–1.0
}

export interface ScoreResponse {
  score: number;
  tier: "A" | "B" | "C" | "D";
  max_loan_usdc: number;   // base units (6 dec)
  min_loan_usdc: number;   // base units (6 dec)
  base_rate_bps: number;
  breakdown: ScoreBreakdown;
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

export async function fetchScore(
  wallet: string,
  plaidToken?: string,
  relationshipMonths?: number,
): Promise<ScoreResponse> {
  const params = new URLSearchParams({ wallet });
  if (plaidToken) params.set("plaid_token", plaidToken);
  if (relationshipMonths !== undefined && relationshipMonths > 0)
    params.set("relationship_months", String(relationshipMonths));
  const res = await fetch(`${SCORE_API}/score?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Score API error ${res.status}`);
  }
  return res.json();
}

export async function fetchPlaidLinkToken(wallet: string): Promise<string> {
  const res = await fetch(
    `${SCORE_API}/score/plaid/link-token?wallet=${encodeURIComponent(wallet)}&plaid_env=sandbox`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Link token error ${res.status}`);
  }
  const { link_token } = await res.json();
  return link_token;
}

export async function exchangePlaidToken(publicToken: string): Promise<string> {
  const res = await fetch(`${SCORE_API}/score/plaid/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_token: publicToken, plaid_env: "sandbox" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Token exchange error ${res.status}`);
  }
  const { access_token } = await res.json();
  return access_token;
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

export interface ScoreExplainFactor {
  name:      string;
  insight:   string;
  direction: "up" | "down" | "neutral";
}

export interface ScoreExplainResponse {
  summary: string;
  factors: ScoreExplainFactor[];
}

export async function fetchScoreExplain(wallet: string): Promise<ScoreExplainResponse> {
  const res = await fetch(`${SCORE_API}/score/explain?wallet=${encodeURIComponent(wallet)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail ?? `Score explain error ${res.status}`);
  }
  return res.json();
}

// ── Devnet faucet ─────────────────────────────────────────────────────────────
// `POST /devnet/airdrop-usdc` is deprecated for the MVP demo — the in-app
// faucet button proved unstable (502s when the backend wallet ran dry,
// solders segfaults on Render). Users now collect test funds themselves via
// faucet.solana.com and faucet.circle.com (see DepositScreen tutorial carousel).

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
