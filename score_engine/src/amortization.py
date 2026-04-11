"""
amortization.py — Price amortization schedule + hybrid split computation.

Called exclusively by POST /score/installments.
Does NOT re-run the scoring model — only needs principal, rate, collateral, tier, n_months.

All USDC amounts are in base units (6 decimals). e.g. $1,000 = 1_000_000_000.
Rates are in basis points. e.g. 9.75% APR = 975 bps.
"""

import time

# Collateral discount applied to the DeFi tranche (mirrors constants.rs)
COLLATERAL_DISCOUNT_BPS = 400  # −4.00% APR for the collateralized portion

# Maximum DeFi tranche as % of principal, by tier
MAX_DEFI_PCT: dict[str, int] = {"A": 70, "B": 60, "C": 50, "D": 0}

# Seconds in one 30-day billing month
MONTH_SECONDS = 30 * 24 * 3600


# ── Hybrid split ──────────────────────────────────────────────────────────────

def compute_hybrid_split(
    principal: int,
    collateral_usdc: int,
    score_tier: str,
    base_rate_bps: int,
) -> dict:
    """
    Compute the DeFi / traditional tranche split and blended rate.

    defi_pct = min(floor(collateral / principal * 100), MAX_DEFI_PCT[tier])
    defi_rate = base_rate - 400 bps   (collateral discount)
    trad_rate = base_rate             (no discount)
    blended   = (defi_pct/100)*defi_rate + (trad_pct/100)*trad_rate

    When collateral_usdc == 0 → pure traditional (defi_pct = 0, blended = base_rate).
    """
    max_defi_pct = MAX_DEFI_PCT.get(score_tier, 0)

    if collateral_usdc <= 0 or principal <= 0 or max_defi_pct == 0:
        defi_pct = 0
    else:
        collateral_ratio = collateral_usdc / principal
        defi_pct = min(int(collateral_ratio * 100), max_defi_pct)

    trad_pct      = 100 - defi_pct
    defi_rate_bps = base_rate_bps - COLLATERAL_DISCOUNT_BPS
    trad_rate_bps = base_rate_bps
    blended_bps   = int((defi_pct / 100) * defi_rate_bps + (trad_pct / 100) * trad_rate_bps)

    return {
        "hybrid_defi_pct":  defi_pct,
        "hybrid_trad_pct":  trad_pct,
        "defi_rate_bps":    defi_rate_bps,
        "trad_rate_bps":    trad_rate_bps,
        "blended_rate_bps": blended_bps,
    }


# ── Price amortization ────────────────────────────────────────────────────────

def price_schedule(
    principal: int,
    annual_rate_bps: int,
    n_months: int,
    start_ts: int,
) -> list[dict]:
    """
    Standard US consumer loan amortization (equal monthly payments).

    The last installment absorbs any rounding remainder so the loan
    always closes at exactly zero balance.

    Returns a list of installment dicts:
      { due_ts, amount_usdc, principal, interest, paid }
    """
    monthly_rate = (annual_rate_bps / 10_000) / 12

    if monthly_rate == 0:
        pmt = principal / n_months
    else:
        pmt = (
            principal
            * (monthly_rate * (1 + monthly_rate) ** n_months)
            / ((1 + monthly_rate) ** n_months - 1)
        )

    schedule = []
    balance = principal

    for i in range(1, n_months + 1):
        interest         = round(balance * monthly_rate)
        pmt_rounded      = round(pmt)

        # Last installment: pay off exact remaining balance to avoid rounding drift
        if i == n_months:
            pmt_rounded = balance + interest

        principal_portion = pmt_rounded - interest
        balance           = max(0, balance - principal_portion)

        schedule.append({
            "due_ts":      start_ts + i * MONTH_SECONDS,
            "amount_usdc": pmt_rounded,
            "principal":   principal_portion,
            "interest":    interest,
            "paid":        False,
        })

    return schedule


# ── Main entry point ──────────────────────────────────────────────────────────

def compute_installments(
    principal: int,
    base_rate_bps: int,
    collateral_usdc: int,
    score_tier: str,
    n_months: int,
) -> dict:
    """
    Full response for POST /score/installments.

    1. Compute hybrid split → blended_rate_bps
    2. Run Price amortization on blended rate
    3. Return combined response
    """
    now_ts = int(time.time())

    split       = compute_hybrid_split(principal, collateral_usdc, score_tier, base_rate_bps)
    blended_bps = split["blended_rate_bps"]

    schedule = price_schedule(principal, blended_bps, n_months, now_ts)

    monthly_payment   = schedule[0]["amount_usdc"] if schedule else 0
    total_cost        = sum(inst["amount_usdc"] for inst in schedule)
    total_interest    = max(0, total_cost - principal)
    first_due_ts      = schedule[0]["due_ts"] if schedule else now_ts + MONTH_SECONDS

    return {
        **split,
        "monthly_payment_usdc": monthly_payment,
        "total_cost_usdc":      total_cost,
        "total_interest_usdc":  total_interest,
        "first_due_ts":         first_due_ts,
        "installments":         schedule,
    }
