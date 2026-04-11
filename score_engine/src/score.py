"""
score.py — Avere credit scoring model

Weights (US calibration, thin-file users):
  cashflow:        0.30  (Plaid bank transactions)
  income:          0.35  (Argyle/Pinwheel payroll — highest weight)
  onchain:         0.20  (Solana wallet behavior)
  payment_history: 0.15  (Avere repayment history — neutral baseline for new users)

New users receive payment_history_score = PAYMENT_HISTORY_BASELINE (500) instead of 0,
so they are not penalized for having no Avere loan history yet.

All sub-score functions return 0–1000.
"""

from __future__ import annotations

# ── Calibration constants ─────────────────────────────────────────────────────
# Adjust these to tune mock profile outputs without changing model structure.

NET_CASHFLOW_MAX_RATIO  = 0.30   # savings rate ≥ 30% → max cashflow signal
INCOME_LEVEL_MIN_USD    = 1_000  # monthly inflow < $1k → 0
INCOME_LEVEL_MAX_USD    = 3_500  # monthly inflow ≥ $3.5k → 1000
KNOWN_RECURRING         = {"rent", "utilities", "phone", "insurance"}
GROSS_INCOME_MIN_USD    = 500    # monthly gross < $500 → 0
GROSS_INCOME_MAX_USD    = 3_000  # monthly gross ≥ $3k → 1000
INCOME_CV_MAX           = 0.45   # coefficient of variation ≥ 45% → 0 stability
TENURE_MAX_MONTHS       = 24     # gig tenure ≥ 24 months → max score
MAX_ACTIVE_PLATFORMS    = 2      # 2+ active platforms → max diversification
WALLET_BALANCE_MAX_USDC = 600    # avg USDC balance ≥ $600 → max score
WALLET_AGE_MAX_DAYS     = 365    # wallet age ≥ 1 year → max score
TX_PER_MONTH_MAX        = 20     # ≥ 20 inbound tx/month → max score
PAYMENT_HISTORY_BASELINE = 500   # score for users with no Avere loan history (neutral)

# ── Scoring weights ───────────────────────────────────────────────────────────

WEIGHTS = {
    "cashflow":        0.30,
    "income":          0.35,
    "onchain":         0.20,
    "payment_history": 0.15,
}

# ── Tier config ───────────────────────────────────────────────────────────────

TIER_SPREADS_BPS: dict[str, int | None] = {
    "A": 600,   # Fed Funds upper + 6.00% → 9.75% APR at current rates
    "B": 900,   # Fed Funds upper + 9.00% → 12.75% APR
    "C": 1400,  # Fed Funds upper + 14.00% → 17.75% APR
    "D": None,  # DeFi collateral only — no unsecured credit
}

MAX_LOAN_BY_TIER: dict[str, int] = {
    "A": 5_000_000_000,  # $5,000 USDC (6 decimals)
    "B": 2_500_000_000,  # $2,500 USDC
    "C": 1_000_000_000,  # $1,000 USDC
    "D": 0,
}

MIN_LOAN_USDC = 50_000_000  # $50 USDC (mirrors constants.rs)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _norm(value: float, min_val: float, max_val: float) -> float:
    """Linear normalize to 0–1000, clamped."""
    if max_val <= min_val:
        return 0.0
    return max(0.0, min(1000.0, (value - min_val) / (max_val - min_val) * 1000.0))


def score_to_tier(score: int) -> str:
    if score >= 800:
        return "A"
    if score >= 600:
        return "B"
    if score >= 400:
        return "C"
    return "D"


# ── Cashflow sub-scores (Plaid data) ──────────────────────────────────────────

def _net_cashflow_score(plaid: dict) -> float:
    """
    Savings rate: (inflow − outflow) / inflow.
    ≥ NET_CASHFLOW_MAX_RATIO → 1000, ≤ 0 → 0.
    """
    inflow  = plaid.get("avg_monthly_inflow_usd", 0.0)
    outflow = plaid.get("avg_monthly_outflow_usd", 0.0)
    if inflow <= 0:
        return 0.0
    ratio = (inflow - outflow) / inflow
    return _norm(ratio, 0.0, NET_CASHFLOW_MAX_RATIO)


def _income_level_score(plaid: dict) -> float:
    """
    Absolute monthly inflow. Measures raw earning power independently of savings rate.
    """
    inflow = plaid.get("avg_monthly_inflow_usd", 0.0)
    return _norm(inflow, INCOME_LEVEL_MIN_USD, INCOME_LEVEL_MAX_USD)


def _negative_balance_penalty(plaid: dict) -> float:
    """
    Days per month with negative balance. 0 days → 1000, ≥ 5 days → 0.
    Only meaningful when bank account is linked (inflow > 0).
    """
    if plaid.get("avg_monthly_inflow_usd", 0.0) <= 0:
        return 0.0
    neg_days = plaid.get("negative_balance_days_per_month", 0)
    return _norm(5 - min(neg_days, 5), 0, 5)


def _recurring_payment_score(plaid: dict) -> float:
    """
    Recurring bill payments (rent, utilities, phone, insurance).
    Each confirmed category adds to the score.
    """
    payments = set(plaid.get("recurring_payments", []))
    matched = len(payments & KNOWN_RECURRING)
    return _norm(matched, 0, len(KNOWN_RECURRING))


def cashflow_score(plaid: dict) -> float:
    """Composite cashflow score from Plaid bank transaction data."""
    if plaid.get("avg_monthly_inflow_usd", 0.0) <= 0:
        return 0.0
    return (
        0.35 * _net_cashflow_score(plaid) +
        0.30 * _income_level_score(plaid) +
        0.20 * _negative_balance_penalty(plaid) +
        0.15 * _recurring_payment_score(plaid)
    )


# ── Income sub-scores (Argyle / Pinwheel data) ────────────────────────────────

def _gross_income_score(argyle: dict) -> float:
    """Monthly gross income from gig platforms or payroll."""
    monthly = argyle.get("avg_monthly_gross_usd", 0.0)
    return _norm(monthly, GROSS_INCOME_MIN_USD, GROSS_INCOME_MAX_USD)


def _income_stability_score(argyle: dict) -> float:
    """
    Coefficient of variation = std_dev / mean. Lower CV = more stable income.
    CV ≤ 0 → 1000, CV ≥ INCOME_CV_MAX → 0.
    """
    mean = argyle.get("avg_monthly_gross_usd", 0.0)
    std  = argyle.get("income_std_dev_usd", 0.0)
    if mean <= 0:
        return 0.0
    cv = std / mean
    return _norm(INCOME_CV_MAX - cv, 0.0, INCOME_CV_MAX)


def _employment_tenure_score(argyle: dict) -> float:
    """Months active on platform or with employer. Capped at TENURE_MAX_MONTHS."""
    tenure = argyle.get("tenure_months", 0)
    return _norm(tenure, 0, TENURE_MAX_MONTHS)


def _platform_diversification_score(argyle: dict) -> float:
    """
    Number of active gig platforms. Multiple platforms = income diversification.
    """
    platforms = argyle.get("active_platforms", 0)
    return _norm(platforms, 0, MAX_ACTIVE_PLATFORMS)


def income_score(argyle: dict) -> float:
    """Composite income score from Argyle (gig) or Pinwheel (payroll) data."""
    if argyle.get("avg_monthly_gross_usd", 0.0) <= 0:
        return 0.0
    return (
        0.50 * _gross_income_score(argyle) +
        0.25 * _income_stability_score(argyle) +
        0.15 * _employment_tenure_score(argyle) +
        0.10 * _platform_diversification_score(argyle)
    )


# ── On-chain sub-scores (Helius API data) ─────────────────────────────────────

def _wallet_balance_score(onchain: dict) -> float:
    """Average USDC balance over 90 days. Higher balance = more skin in the game."""
    balance = onchain.get("avg_balance_usdc", 0.0)
    return _norm(balance, 0, WALLET_BALANCE_MAX_USDC)


def _wallet_age_score(onchain: dict) -> float:
    """Wallet age in days. Older wallets signal established on-chain presence."""
    age = onchain.get("wallet_age_days", 0)
    return _norm(age, 0, WALLET_AGE_MAX_DAYS)


def _tx_frequency_score(onchain: dict) -> float:
    """Inbound transactions per month. Regular activity = financial engagement."""
    tx = onchain.get("tx_per_month", 0)
    return _norm(tx, 0, TX_PER_MONTH_MAX)


def onchain_score(onchain: dict) -> float:
    """Composite on-chain score from Helius Solana wallet data."""
    return (
        0.40 * _wallet_balance_score(onchain) +
        0.30 * _wallet_age_score(onchain) +
        0.30 * _tx_frequency_score(onchain)
    )


# ── Payment history (Avere on-chain repayment events) ────────────────────────

def payment_history_score(history: list) -> float:
    """
    Avere on-chain repayment history. New users receive the neutral baseline (500)
    so they are not penalized for having no loan history yet.

    When live repayment data is available, this scores by on-time/early ratio.
    Each confirmed on-time repayment event = +50 pts above baseline, capped at 1000.
    """
    if not history:
        return float(PAYMENT_HISTORY_BASELINE)
    on_time = sum(1 for h in history if h.get("status") in ("on_time", "early"))
    return min(PAYMENT_HISTORY_BASELINE + on_time * 50, 1000.0)


# ── Macro risk multiplier (FRED API — always real) ────────────────────────────

def macro_risk_multiplier(macro: dict) -> float:
    """
    Returns 0.80–1.00. Applied to the raw score before clamping to 0–1000.
    Lower = tighter credit conditions (higher spreads applied to all tiers).

    Current rates (April 2026): fed_funds=3.65, cpi~2.7%, unemployment~4.4%
    → multiplier = 1.00 (no tightening triggers active).
    """
    mult = 1.0
    if macro.get("fed_funds", 0.0) > 5.0:
        mult -= 0.08   # tight monetary policy
    if macro.get("cpi", 0.0) > 4.0:
        mult -= 0.07   # elevated inflation
    if macro.get("unemployment", 0.0) > 5.5:
        mult -= 0.05   # labor market weakness
    return max(mult, 0.80)


# ── Main scoring function ─────────────────────────────────────────────────────

def compute_score(profile: dict, macro: dict) -> dict:
    """
    Compute Avere credit score from a merged profile dict and macro indicators.

    Profile shape (identical for mock and live modes):
      {
        "plaid":           { avg_monthly_inflow_usd, avg_monthly_outflow_usd,
                             negative_balance_days_per_month, recurring_payments },
        "argyle":          { avg_monthly_gross_usd, income_std_dev_usd,
                             tenure_months, active_platforms },
        "onchain":         { wallet_age_days, avg_balance_usdc, tx_per_month },
        "payment_history": [ { "status": "on_time"|"early"|"late" }, ... ]
      }

    Macro shape (from FRED API):
      { "fed_funds": float, "cpi": float, "unemployment": float }

    Returns:
      { "score": int, "tier": str, "breakdown": { ... } }
    """
    plaid   = profile.get("plaid", {})
    argyle  = profile.get("argyle", {})
    onchain = profile.get("onchain", {})
    history = profile.get("payment_history", [])

    c_score = cashflow_score(plaid)
    i_score = income_score(argyle)
    o_score = onchain_score(onchain)
    p_score = payment_history_score(history)
    mult    = macro_risk_multiplier(macro)

    raw = (
        WEIGHTS["cashflow"]        * c_score +
        WEIGHTS["income"]          * i_score +
        WEIGHTS["onchain"]         * o_score +
        WEIGHTS["payment_history"] * p_score
    )

    final = int(min(raw * mult, 1000.0))
    tier  = score_to_tier(final)

    return {
        "score": final,
        "tier":  tier,
        "breakdown": {
            "cashflow_score":        round(c_score),
            "income_score":          round(i_score),
            "onchain_score":         round(o_score),
            "payment_history_score": round(p_score),
            "macro_multiplier":      round(mult, 4),
        },
    }


# ── Response builder ──────────────────────────────────────────────────────────

def build_score_response(score_result: dict, fed_funds_upper_bps: int) -> dict:
    """
    Build the GET /score response payload.

    fed_funds_upper_bps: upper bound of the Fed Funds target range in basis points.
                         e.g. 375 for 3.75% (current as of April 2026).
    """
    score  = score_result["score"]
    tier   = score_result["tier"]
    spread = TIER_SPREADS_BPS.get(tier)

    base_rate_bps = (fed_funds_upper_bps + spread) if spread is not None else 0

    return {
        "score":          score,
        "tier":           tier,
        "max_loan_usdc":  MAX_LOAN_BY_TIER[tier],
        "min_loan_usdc":  MIN_LOAN_USDC,
        "base_rate_bps":  base_rate_bps,
    }
