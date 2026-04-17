"""
config.py — SCORE_MODE routing and demo wallet → profile mapping.

SCORE_MODE (env var):
  mock    → load JSON profile from profiles/  (always used for known demo wallets)
  random  → deterministic score from wallet address hash (default — no external APIs)
  sandbox → fetch from Plaid sandbox + Argyle sandbox APIs
  live    → fetch from Plaid production + Argyle production APIs

Demo wallets are always routed to mock regardless of SCORE_MODE.
Any unknown wallet defaults to 'random' mode so anyone can connect and get a score.
"""

import os
from pathlib import Path

# ── Mock profile directory ────────────────────────────────────────────────────

PROFILES_DIR = Path(__file__).parent / "profiles"

# ── Demo wallet → profile name mapping ───────────────────────────────────────
# Populated from .env at startup. Missing keys are silently ignored (None → filtered).

DEMO_PROFILES: dict[str, str] = {
    k: v
    for k, v in {
        os.getenv("DEMO_WALLET_MARIA"):      "maria",
        os.getenv("DEMO_WALLET_JAMES"):      "james",
        os.getenv("DEMO_WALLET_NO_HISTORY"): "no_history",
    }.items()
    if k is not None
}

# ── Mode resolver ─────────────────────────────────────────────────────────────

def resolve_score_mode(wallet: str) -> str:
    """
    Return the data-fetch mode for a given wallet address.

    - Known demo wallets → 'mock' (JSON profile, always)
    - All other wallets  → SCORE_MODE env var (default: 'random')
    """
    if wallet in DEMO_PROFILES:
        return "mock"
    return os.getenv("SCORE_MODE", "random")


def get_profile_name(wallet: str) -> str | None:
    """Return the profile name for a demo wallet, or None if not a demo wallet."""
    return DEMO_PROFILES.get(wallet)
