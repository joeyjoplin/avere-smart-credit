#!/usr/bin/env python3
"""
create_plaid_tokens.py — Generate Plaid sandbox access_tokens for the three demo profiles.

Usage:
    cd avere-smart-credit
    python scripts/create_plaid_tokens.py

Reads credentials from score_engine/.env:
    PLAID_CLIENT_ID   — Plaid dashboard client ID
    PLAID_SECRET      — Secret for the environment set in PLAID_ENV
    PLAID_ENV         — sandbox (default) | development | production

For each demo profile it:
  1. Calls /sandbox/public_token/create with institution ins_109508 (Chase)
  2. Exchanges the public_token for a persistent access_token
  3. Prints the result as .env lines ready to copy-paste.

Output example:
    PLAID_ACCESS_TOKEN_MARIA=access-sandbox-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    PLAID_ACCESS_TOKEN_JAMES=access-sandbox-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    PLAID_ACCESS_TOKEN_NO_HISTORY=access-sandbox-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
"""

import os
import sys
from pathlib import Path

# ── Load .env from score_engine/ ──────────────────────────────────────────────
_env_path = Path(__file__).parent.parent / "score_engine" / ".env"
if _env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(_env_path)

# ── Plaid SDK imports ─────────────────────────────────────────────────────────
try:
    import plaid
    from plaid.api import plaid_api
    from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
    from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
    from plaid.model.products import Products
except ImportError:
    print("ERROR: plaid-python not installed.")
    print("Run: pip install plaid-python")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
PLAID_CLIENT_ID = os.getenv("PLAID_CLIENT_ID", "")
PLAID_SECRET    = os.getenv("PLAID_SECRET", "")
PLAID_ENV       = os.getenv("PLAID_ENV", "sandbox").lower()

INSTITUTION_ID = "ins_109508"  # Chase — richest sandbox transaction data
PRODUCTS = [
    Products("transactions"),
    Products("identity"),
]

PROFILES = [
    ("MARIA",      "Maria — DoorDash driver, Tier A target"),
    ("JAMES",      "James — Instacart courier, Tier B target"),
    ("NO_HISTORY", "No History — new wallet, Tier D target"),
]

# ── Env validation ─────────────────────────────────────────────────────────────
def _check_env() -> None:
    missing = []
    if not PLAID_CLIENT_ID:
        missing.append("PLAID_CLIENT_ID")
    if not PLAID_SECRET:
        missing.append("PLAID_SECRET")
    if missing:
        print(f"ERROR: Missing required env vars: {', '.join(missing)}")
        print(f"Set them in {_env_path} or export them before running.")
        sys.exit(1)
    if PLAID_ENV != "sandbox":
        print(f"WARNING: PLAID_ENV={PLAID_ENV!r}. This script is designed for sandbox.")
        print("         Use sandbox credentials or set PLAID_ENV=sandbox.")

# ── Plaid client ──────────────────────────────────────────────────────────────
_PLAID_HOSTS = {
    "sandbox":    plaid.Environment.Sandbox,
    "production": plaid.Environment.Production,
}

def _build_client() -> plaid_api.PlaidApi:
    host = _PLAID_HOSTS.get(PLAID_ENV, plaid.Environment.Sandbox)
    configuration = plaid.Configuration(
        host=host,
        api_key={
            "clientId": PLAID_CLIENT_ID,
            "secret":   PLAID_SECRET,
        },
    )
    return plaid_api.PlaidApi(plaid.ApiClient(configuration))


# ── Token creation ────────────────────────────────────────────────────────────
def _create_access_token(client: plaid_api.PlaidApi, profile_label: str) -> str:
    """Create a sandbox public_token and exchange it for an access_token."""
    # Step 1 — create sandbox public_token (bypasses the Link UI)
    pt_response = client.sandbox_public_token_create(
        SandboxPublicTokenCreateRequest(
            institution_id=INSTITUTION_ID,
            initial_products=PRODUCTS,
        )
    )
    public_token = pt_response["public_token"]

    # Step 2 — exchange for persistent access_token
    ex_response = client.item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    return ex_response["access_token"]


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    _check_env()
    print(f"Connecting to Plaid {PLAID_ENV} (institution: {INSTITUTION_ID} — Chase)...")
    print()

    client = _build_client()
    results: list[tuple[str, str]] = []

    for key, description in PROFILES:
        print(f"  Creating token for {description}...", end=" ", flush=True)
        try:
            access_token = _create_access_token(client, key)
            results.append((key, access_token))
            print("OK")
        except Exception as exc:
            print(f"FAILED\n    {exc}")
            sys.exit(1)

    print()
    print("─" * 70)
    print("Add these lines to score_engine/.env:")
    print("─" * 70)
    for key, token in results:
        print(f"PLAID_ACCESS_TOKEN_{key}={token}")
    print("─" * 70)
    print()
    print("Then pass the matching token as ?plaid_token=<value> when calling")
    print("GET /score for the corresponding demo wallet.")


if __name__ == "__main__":
    main()
