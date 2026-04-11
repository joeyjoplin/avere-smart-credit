"""
onchain_data.py — Helius API fetcher for on-chain wallet signals.

Fetches: wallet age, average USDC balance, transaction frequency.
Returns the normalized onchain dict expected by compute_score().

Helius docs: https://docs.helius.dev/solana-apis/enhanced-transactions-api
API key:     https://dev.helius.xyz (free tier available)
Set via:     HELIUS_API_KEY env var
"""

import os
from datetime import datetime, timezone

import httpx

HELIUS_API_KEY   = os.getenv("HELIUS_API_KEY", "")
HELIUS_BASE      = "https://api.helius.xyz/v0"

USDC_MINT_DEVNET  = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
USDC_MINT_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
# Use USDC_MINT env var to override (e.g. switch to mainnet for live mode).
USDC_MINT    = os.getenv("USDC_MINT", USDC_MINT_DEVNET)
USDC_DECIMALS    = 6
LOOKBACK_DAYS    = 90


async def fetch_helius_data(wallet: str) -> dict:
    """
    Fetch on-chain signals for a Solana wallet via Helius.

    Returns the normalized onchain dict expected by compute_score():
      {
        wallet_age_days,    # days since first tx
        avg_balance_usdc,   # current USDC balance (proxy for 90-day avg)
        tx_per_month,       # inbound transactions per month over last 90 days
      }

    Returns zeros when HELIUS_API_KEY is not set (avoids blocking local dev).
    """
    if not HELIUS_API_KEY:
        return {"wallet_age_days": 0, "avg_balance_usdc": 0.0, "tx_per_month": 0.0}

    now_ts    = datetime.now(timezone.utc).timestamp()
    cutoff_ts = now_ts - LOOKBACK_DAYS * 86400

    async with httpx.AsyncClient(timeout=15.0) as client:
        txs, balances = await _fetch_transactions(client, wallet), await _fetch_balances(client, wallet)

    wallet_age_days = _compute_wallet_age(txs, now_ts)
    avg_balance     = _read_usdc_balance(balances)
    tx_per_month    = _compute_tx_frequency(txs, cutoff_ts)

    return {
        "wallet_age_days":  wallet_age_days,
        "avg_balance_usdc": avg_balance,
        "tx_per_month":     tx_per_month,
    }


async def _fetch_transactions(client: httpx.AsyncClient, wallet: str) -> list:
    """Fetch up to 100 recent transactions from Helius."""
    try:
        resp = await client.get(
            f"{HELIUS_BASE}/addresses/{wallet}/transactions",
            params={"api-key": HELIUS_API_KEY, "limit": 100},
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return []


async def _fetch_balances(client: httpx.AsyncClient, wallet: str) -> dict:
    """Fetch current token balances from Helius."""
    try:
        resp = await client.get(
            f"{HELIUS_BASE}/addresses/{wallet}/balances",
            params={"api-key": HELIUS_API_KEY},
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        return {}


def _compute_wallet_age(txs: list, now_ts: float) -> int:
    """Days since the oldest transaction in the fetched history."""
    if not txs:
        return 0
    oldest_ts = min((tx.get("timestamp") or now_ts) for tx in txs)
    return max(0, int((now_ts - oldest_ts) / 86400))


def _read_usdc_balance(balances: dict) -> float:
    """Read the current USDC balance from the Helius balances response."""
    for token in balances.get("tokens", []):
        if token.get("mint") == USDC_MINT:
            raw = token.get("amount", 0) or 0
            return round(raw / (10 ** USDC_DECIMALS), 2)
    return 0.0


def _compute_tx_frequency(txs: list, cutoff_ts: float) -> float:
    """
    Count transactions within the lookback window and express as per-month rate.
    Uses all transaction types (inbound and outbound) as a signal of wallet activity.
    """
    recent = [tx for tx in txs if (tx.get("timestamp") or 0) >= cutoff_ts]
    months = LOOKBACK_DAYS / 30
    return round(len(recent) / months, 1)
