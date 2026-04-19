"""
bank_pool_agent.py — Agent A: BankPool Manager.

Manages Avere's own capital (BankPool PDA). Maximizes yield on capital not
currently lent out while maintaining minimum liquidity for new loan disbursements.

MVP: deterministic rules (rank by APY, apply hard limits). No LLM required.
Phase 2: LLM reasoning for context-aware rebalancing decisions.
"""

from __future__ import annotations

import time

from agents.protocol_registry import (
    WHITELIST,
    MAX_SINGLE_PROTOCOL_PCT,
    MIN_LIQUID_BUFFER_PCT,
)


def get_mock_apys() -> dict[str, float]:
    """
    Simulate live APY feeds with 6-hour cycle variance (±0.2%).
    In production: replaced by DeFiLlama API + native protocol endpoints.
    """
    cycle = (int(time.time()) // 21_600) % 7
    delta = [0.00, 0.10, -0.10, 0.20, -0.20, 0.15, -0.05][cycle]
    return {
        "kamino":   round(6.10 + delta * 0.5, 2),
        "marinade": round(7.80 + delta * 0.8, 2),
        "jito":     round(8.20 + delta * 1.0, 2),
    }


def decide_allocation(pool_balance_usdc: float, active_loans: int = 0) -> dict:
    """
    Agent A allocation decision for the BankPool.

    Rules (hard, never overridable):
    1. 20% always liquid (available for new loan disbursements)
    2. Max 70% in any single protocol
    3. Only whitelist protocols

    Args:
        pool_balance_usdc: total USDC in BankPool (display dollars, not base units)
        active_loans:      number of active loans (future: adjusts liquidity reserve)

    Returns:
        Allocation dict with reasoning and expected blended APY.
    """
    yields = get_mock_apys()

    liquid_reserve = pool_balance_usdc * MIN_LIQUID_BUFFER_PCT
    deployable = pool_balance_usdc - liquid_reserve

    # Rank all whitelisted protocols by APY descending (all tiers eligible for BankPool)
    ranked = sorted(WHITELIST.keys(), key=lambda p: yields.get(p, 0.0), reverse=True)

    allocation: dict[str, float] = {}
    remaining = deployable
    for protocol in ranked:
        if remaining <= 0.0:
            break
        cap = min(remaining, deployable * MAX_SINGLE_PROTOCOL_PCT)
        allocation[protocol] = round(cap, 2)
        remaining -= cap

    total_deployed = sum(allocation.values())
    blended_apy = (
        sum(allocation[p] * yields.get(p, 0.0) for p in allocation) / total_deployed
        if total_deployed > 0 else 0.0
    )

    top_protocol = ranked[0] if ranked else "kamino"
    top_apy = yields.get(top_protocol, 0.0)

    apy_strs = ", ".join(
        f"{WHITELIST[p]['name']} ({yields.get(p, 0):.1f}%)" for p in ranked
    )
    alloc_strs = ", ".join(
        f"${v:.0f} → {WHITELIST[p]['name']}" for p, v in allocation.items()
    )
    reasoning = (
        f"Ranked by APY: {apy_strs}. "
        f"Allocation: {alloc_strs}. "
        f"${liquid_reserve:.0f} liquid reserve maintained (20% buffer)."
    )

    return {
        "agent":               "Agent A — BankPool Manager",
        "pool_balance_usdc":   round(pool_balance_usdc, 2),
        "liquid_reserve_usdc": round(liquid_reserve, 2),
        "deployable_usdc":     round(deployable, 2),
        "yields":              yields,
        "allocation":          allocation,
        "expected_blended_apy": round(blended_apy, 2),
        "top_protocol":        top_protocol,
        "top_protocol_name":   WHITELIST[top_protocol]["name"],
        "top_apy":             top_apy,
        "reasoning":           reasoning,
    }
