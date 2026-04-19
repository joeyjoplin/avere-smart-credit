"""
vault_agent.py — Agent B: Vault Optimizer.

Manages the free USDC in each user's vault (capital not locked as collateral).
Maximizes yield per user while guaranteeing instant withdrawal liquidity and
collateral releasability. Risk profile adapts to the user's score tier.

MVP: deterministic rules. Phase 2: LLM context-aware decisions.
"""

from __future__ import annotations

from agents.protocol_registry import (
    WHITELIST,
    MIN_LIQUID_BUFFER_PCT,
    eligible_protocols,
)
from agents.bank_pool_agent import get_mock_apys


def decide_vault_allocation(
    free_usdc: float,
    locked_usdc: float,
    user_tier: str,
) -> dict:
    """
    Agent B allocation decision for a single user vault.

    Rules:
    - Tier C/D: conservative — Kamino only (lower risk, instant liquidity)
    - Tier A/B: growth — best eligible protocol by APY
    - Always maintain 20% liquid buffer of free USDC
    - Never exceed 70% in any single protocol (enforced by eligible_protocols filter)

    Args:
        free_usdc:   USDC not locked as collateral (display dollars)
        locked_usdc: USDC locked as loan collateral (display dollars)
        user_tier:   "A" | "B" | "C" | "D"

    Returns:
        Allocation dict with protocol choice, APY, and reasoning narrative.
    """
    yields = get_mock_apys()
    liquid_buffer = free_usdc * MIN_LIQUID_BUFFER_PCT
    deployable = max(free_usdc - liquid_buffer, 0.0)

    eligible = eligible_protocols(user_tier)

    if user_tier in ("C", "D") or not eligible:
        chosen = "kamino"
        allocation = {"kamino": round(deployable, 2)}
        chosen_apy = yields["kamino"]
        reasoning = (
            f"Tier {user_tier} profile: conservative strategy. "
            f"100% of deployable balance in {WHITELIST['kamino']['name']} "
            f"({chosen_apy:.1f}% APY). "
            f"20% liquid buffer maintained for instant withdrawal."
        )
    else:
        ranked = sorted(eligible, key=lambda p: yields.get(p, 0.0), reverse=True)
        chosen = ranked[0]
        chosen_apy = yields.get(chosen, 0.0)
        allocation = {chosen: round(deployable, 2)}

        kamino_apy = yields.get("kamino", 6.1)
        improvement = round(chosen_apy - kamino_apy, 2)

        if chosen != "kamino" and improvement > 0:
            reasoning = (
                f"Tier {user_tier} profile: growth strategy. "
                f"Moved to {WHITELIST[chosen]['name']} ({chosen_apy:.1f}% APY) "
                f"from Kamino ({kamino_apy:.1f}% APY). "
                f"+{improvement:.1f}% yield improvement on ${deployable:.0f} deployed."
            )
        else:
            reasoning = (
                f"Tier {user_tier} profile: {WHITELIST[chosen]['name']} "
                f"({chosen_apy:.1f}% APY) is currently the optimal choice. "
                f"20% liquid buffer maintained."
            )

    kamino_apy = yields.get("kamino", 6.1)
    chosen_apy_val = yields.get(chosen, 0.0)
    yield_vs_kamino = round(chosen_apy_val - kamino_apy, 2)

    return {
        "agent":                "Agent B — Vault Optimizer",
        "tier":                 user_tier,
        "free_usdc":            round(free_usdc, 2),
        "locked_usdc":          round(locked_usdc, 2),
        "liquid_buffer_usdc":   round(liquid_buffer, 2),
        "deployable_usdc":      round(deployable, 2),
        "yields":               yields,
        "allocation":           allocation,
        "current_protocol":     chosen,
        "current_protocol_name": WHITELIST[chosen]["name"],
        "current_apy":          chosen_apy_val,
        "yield_vs_kamino":      yield_vs_kamino,
        "reasoning":            reasoning,
    }
