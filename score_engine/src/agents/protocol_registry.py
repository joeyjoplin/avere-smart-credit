"""
protocol_registry.py — Avere protocol whitelist and governance limits.

Only protocols here are eligible for agent allocation.
Requires: audit, $500M+ TVL, devnet deployment.
"""

from __future__ import annotations

WHITELIST: dict[str, dict] = {
    "kamino": {
        "name":            "Kamino Lend",
        "asset":           "USDC",
        "risk_level":      "low",
        "eligible_tiers":  ["A", "B", "C", "D"],
        "description":     "Conservative USDC lending — default protocol",
    },
    "marinade": {
        "name":            "Marinade",
        "asset":           "mSOL",
        "risk_level":      "medium",
        "eligible_tiers":  ["A", "B"],
        "description":     "SOL liquid staking with native unstake option",
    },
    "jito": {
        "name":            "Jito",
        "asset":           "jitoSOL",
        "risk_level":      "medium",
        "eligible_tiers":  ["A", "B"],
        "description":     "MEV rewards + staking (BankPool only in Phase 3)",
    },
}

# Hard governance limits — never overridable at runtime
MAX_SINGLE_PROTOCOL_PCT = 0.70   # no more than 70% in any single protocol
MIN_LIQUID_BUFFER_PCT   = 0.20   # always keep 20% instantly withdrawable


def eligible_protocols(tier: str) -> list[str]:
    """Return protocol keys the given user tier is allowed to use."""
    return [k for k, v in WHITELIST.items() if tier in v["eligible_tiers"]]
