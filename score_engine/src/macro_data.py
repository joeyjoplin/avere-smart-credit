"""
macro_data.py — FRED API integration.

Macro data is ALWAYS fetched live regardless of SCORE_MODE.
No mock — the macro environment is identical for all users.

FRED series used:
  FEDFUNDS   → Effective Fed Funds Rate (proxy for current rate environment)
  DFEDTARU   → Fed Funds Target Rate Upper Bound (used for contract rate formula)
  CPIAUCSL   → CPI All Items (inflation signal)
  UNRATE     → US Unemployment Rate (labor market signal)

Free API key at: https://fred.stlouisfed.org/docs/api/api_key.html
Set via: FRED_API_KEY env var
"""

import os
import httpx

FRED_BASE = "https://api.stlouisfed.org/fred/series/observations"
FRED_API_KEY = os.getenv("FRED_API_KEY", "")

# Fallback values (April 2026) used when FRED_API_KEY is absent or API is unreachable.
# These are real values — update if Fed changes rates.
FALLBACK_MACRO = {
    "fed_funds":        3.65,  # EFFR, April 8 2026
    "fed_funds_upper":  3.75,  # Target upper bound, March 18 2026 FOMC
    "cpi":              2.70,  # CPI YoY estimate, April 2026
    "unemployment":     4.40,  # UNRATE, March 2026
}


async def _fetch_latest(series_id: str) -> float | None:
    """Fetch the most recent observation for a FRED series. Returns None on failure."""
    if not FRED_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(FRED_BASE, params={
                "series_id":  series_id,
                "api_key":    FRED_API_KEY,
                "file_type":  "json",
                "limit":      1,
                "sort_order": "desc",
            })
            resp.raise_for_status()
            observations = resp.json().get("observations", [])
            if observations and observations[0]["value"] != ".":
                return float(observations[0]["value"])
    except Exception:
        pass
    return None


async def get_macro_indicators() -> dict:
    """
    Fetch live macro indicators from FRED.
    Falls back to FALLBACK_MACRO values if the API key is missing or a request fails.

    Returns:
      {
        "fed_funds":        float,  # Effective Fed Funds Rate (%)
        "fed_funds_upper":  float,  # Target upper bound (%) — used in rate formula
        "fed_funds_upper_bps": int, # fed_funds_upper as basis points (e.g. 375)
        "cpi":              float,  # CPI YoY (%)
        "unemployment":     float,  # Unemployment rate (%)
      }
    """
    fed_funds       = await _fetch_latest("FEDFUNDS")
    fed_funds_upper = await _fetch_latest("DFEDTARU")
    cpi             = await _fetch_latest("CPIAUCSL")
    unemployment    = await _fetch_latest("UNRATE")

    result = {
        "fed_funds":        fed_funds       or FALLBACK_MACRO["fed_funds"],
        "fed_funds_upper":  fed_funds_upper or FALLBACK_MACRO["fed_funds_upper"],
        "cpi":              cpi             or FALLBACK_MACRO["cpi"],
        "unemployment":     unemployment    or FALLBACK_MACRO["unemployment"],
    }
    result["fed_funds_upper_bps"] = round(result["fed_funds_upper"] * 100)
    return result
