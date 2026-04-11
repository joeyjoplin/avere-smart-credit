"""
income_data.py — Plaid (bank cashflow) + Argyle (gig income) data fetchers.

Both functions return dicts that match the mock profile schema exactly, so
compute_score() works identically regardless of SCORE_MODE.

Plaid docs:  https://plaid.com/docs/api/products/transactions/
Argyle docs: https://docs.argyle.com/api-reference/pay-allocations
"""

import os
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

import httpx

# ── Plaid config ──────────────────────────────────────────────────────────────

PLAID_URLS = {
    "sandbox":    "https://sandbox.plaid.com",
    "production": "https://production.plaid.com",
}
PLAID_CLIENT_ID        = os.getenv("PLAID_CLIENT_ID", "")
PLAID_SECRET_SANDBOX   = os.getenv("PLAID_SECRET_SANDBOX", "")
PLAID_SECRET_PROD      = os.getenv("PLAID_SECRET_PRODUCTION", "")

# ── Argyle config ─────────────────────────────────────────────────────────────

ARGYLE_BASE         = "https://api.argyle.com/v2"
ARGYLE_CLIENT_ID    = os.getenv("ARGYLE_CLIENT_ID", "")
ARGYLE_CLIENT_SECRET = os.getenv("ARGYLE_CLIENT_SECRET", "")

# ── Recurring payment detection ───────────────────────────────────────────────

_RECURRING_KEYWORDS: dict[str, list[str]] = {
    "rent":      ["rent", "lease", "property management", "apartments", "realty"],
    "utilities": ["electric", "gas", "water", "utility", "pge", "comed", "con ed", "eversource"],
    "phone":     ["at&t", "verizon", "t-mobile", "tmobile", "sprint", "metro pcs", "cricket"],
    "insurance": ["geico", "progressive", "state farm", "allstate", "insurance", "lemonade"],
}


# ── Plaid ─────────────────────────────────────────────────────────────────────

async def fetch_plaid_data(access_token: str, plaid_env: str = "sandbox") -> dict:
    """
    Pull 90 days of transactions and compute cashflow signals.

    Returns the normalized plaid dict expected by compute_score():
      {
        avg_monthly_inflow_usd,
        avg_monthly_outflow_usd,
        negative_balance_days_per_month,
        recurring_payments,
      }
    """
    if not PLAID_CLIENT_ID:
        raise ValueError("PLAID_CLIENT_ID is not set")
    base_url = PLAID_URLS.get(plaid_env, PLAID_URLS["sandbox"])
    secret   = PLAID_SECRET_PROD if plaid_env == "production" else PLAID_SECRET_SANDBOX

    end_date   = date.today()
    start_date = end_date - timedelta(days=90)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{base_url}/transactions/get",
            json={
                "client_id":    PLAID_CLIENT_ID,
                "secret":       secret,
                "access_token": access_token,
                "start_date":   start_date.isoformat(),
                "end_date":     end_date.isoformat(),
                "options":      {"count": 500},
            },
        )
        resp.raise_for_status()
        data = resp.json()

    transactions = data.get("transactions", [])
    accounts     = data.get("accounts", [])
    months       = 3.0  # 90 days

    # Plaid convention: positive amount = debit (money out), negative = credit (money in)
    inflows  = [abs(t["amount"]) for t in transactions if t["amount"] < 0]
    outflows = [t["amount"]      for t in transactions
                if t["amount"] > 0 and not _is_internal_transfer(t)]

    avg_inflow  = sum(inflows)  / months
    avg_outflow = sum(outflows) / months

    neg_days_90 = _count_negative_balance_days(accounts, transactions)

    return {
        "avg_monthly_inflow_usd":          round(avg_inflow, 2),
        "avg_monthly_outflow_usd":         round(avg_outflow, 2),
        "negative_balance_days_per_month": round(neg_days_90 / months),
        "recurring_payments":              _detect_recurring(transactions),
    }


def _is_internal_transfer(tx: dict) -> bool:
    """Exclude internal transfers and peer payments that inflate apparent spending."""
    cats = tx.get("category") or []
    name = (tx.get("name") or "").lower()
    return (
        "Transfer" in cats
        or "venmo" in name
        or "zelle" in name
        or "cash app" in name
    )


def _count_negative_balance_days(accounts: list, transactions: list) -> int:
    """
    Approximate days with negative balance by walking backwards through
    the transaction history from the current known balance.
    """
    # Sum current depository balances
    current = sum(
        (a.get("balances") or {}).get("current") or 0
        for a in accounts
        if a.get("type") == "depository"
    )

    neg_days = 0
    seen: set[str] = set()

    for tx in sorted(transactions, key=lambda t: t.get("date", ""), reverse=True):
        day = tx.get("date", "")
        if day and day not in seen:
            seen.add(day)
            if current < 0:
                neg_days += 1
        # Undo the transaction (walking backwards; Plaid: positive = debit)
        current += tx.get("amount", 0)

    return neg_days


def _detect_recurring(transactions: list) -> list[str]:
    """Match transaction names against known recurring bill keywords."""
    found: set[str] = set()
    for tx in transactions:
        text = " ".join([
            (tx.get("name") or ""),
            (tx.get("merchant_name") or ""),
        ]).lower()
        for category, keywords in _RECURRING_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                found.add(category)
    return sorted(found)


# ── Argyle ────────────────────────────────────────────────────────────────────

async def fetch_argyle_data(account_id: str) -> dict:
    """
    Pull gig income from Argyle and compute income signals.

    Returns the normalized argyle dict expected by compute_score():
      {
        platform,
        avg_monthly_gross_usd,
        income_std_dev_usd,
        tenure_months,
        active_platforms,
      }
    """
    if not ARGYLE_CLIENT_ID:
        raise ValueError("ARGYLE_CLIENT_ID is not set")
    async with httpx.AsyncClient(
        base_url=ARGYLE_BASE,
        auth=(ARGYLE_CLIENT_ID, ARGYLE_CLIENT_SECRET),
        timeout=15.0,
    ) as client:
        pay_resp  = await client.get("/pay-allocations", params={"account": account_id, "limit": 50})
        pay_resp.raise_for_status()
        pay_items = pay_resp.json().get("results", [])

        acct_resp = await client.get(f"/accounts/{account_id}")
        acct_resp.raise_for_status()
        acct = acct_resp.json()

    if not pay_items:
        return {
            "platform":              None,
            "avg_monthly_gross_usd": 0.0,
            "income_std_dev_usd":    0.0,
            "tenure_months":         0,
            "active_platforms":      0,
        }

    # Aggregate gross pay by month
    monthly: dict[str, float] = defaultdict(float)
    employers: set[str] = set()

    for item in pay_items:
        month = (item.get("payout_date") or "")[:7]   # "YYYY-MM"
        gross = float((item.get("gross_pay") or {}).get("amount") or 0)
        monthly[month] += gross
        employer = item.get("employer")
        if employer:
            employers.add(employer)

    totals = list(monthly.values())
    avg    = statistics.mean(totals)       if totals          else 0.0
    std    = statistics.stdev(totals)      if len(totals) > 1 else 0.0

    # Tenure from account creation date
    tenure_months = 0
    created_at = acct.get("created_at")
    if created_at:
        try:
            created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            tenure_months = max(0, (datetime.now(timezone.utc) - created).days // 30)
        except ValueError:
            pass

    return {
        "platform":              acct.get("employer"),
        "avg_monthly_gross_usd": round(avg, 2),
        "income_std_dev_usd":    round(std, 2),
        "tenure_months":         tenure_months,
        "active_platforms":      len(employers),
    }
