import json
import os
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

from config import resolve_score_mode, get_profile_name, PROFILES_DIR
from macro_data import get_macro_indicators
from score import compute_score, build_score_response
from amortization import compute_installments
from income_data import fetch_plaid_data, fetch_argyle_data, PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PROD, PLAID_URLS
from onchain_data import fetch_helius_data

app = FastAPI(
    title="Avere Score Engine",
    description="Credit scoring API for Avere hybrid neobank (Solana devnet)",
    version="0.2.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow frontend origins. Override via CORS_ORIGINS env var (comma-separated).
_cors_origins_env = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS: list[str] = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else ["http://localhost:3000", "http://localhost:3001"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Shared sub-models ─────────────────────────────────────────────────────────

class Installment(BaseModel):
    due_ts: int = Field(..., description="Unix timestamp of due date (monthly intervals)")
    amount_usdc: int = Field(..., description="Fixed installment amount in USDC base units (6 decimals)")
    principal: int = Field(..., description="Principal portion of this installment")
    interest: int = Field(..., description="Interest portion of this installment")
    paid: bool = Field(False, description="Whether this installment has been paid on-chain")

# ── GET /score ────────────────────────────────────────────────────────────────

class ScoreResponse(BaseModel):
    score: int = Field(..., ge=0, le=1000, description="Avere credit score (0–1000)")
    tier: str = Field(..., description="Score tier: A | B | C | D")
    max_loan_usdc: int = Field(..., description="Maximum approved loan in USDC base units")
    min_loan_usdc: int = Field(..., description="Minimum loan floor in USDC base units")
    base_rate_bps: int = Field(..., description="Base contract rate in basis points (Fed Funds + tier spread)")

@app.get("/score", response_model=ScoreResponse)
async def get_score(
    wallet: str = Query(..., description="Solana public key (base58)"),
    plaid_token: str | None = Query(None, description="Plaid access token (required for sandbox/live mode)"),
    argyle_account_id: str | None = Query(None, description="Argyle account ID (optional — gig workers only)"),
):
    """
    Full scoring pipeline. Called once on Loan tab mount; result cached in frontend state.

    SCORE_MODE routing:
      - Known demo wallets          → mock  (JSON profile, no external calls)
      - SCORE_MODE=sandbox + token  → Plaid sandbox + Argyle sandbox + Helius devnet
      - SCORE_MODE=live   + token   → Plaid production + Argyle production + Helius mainnet

    Always fetches macro indicators from FRED regardless of mode.
    """
    mode = resolve_score_mode(wallet)

    if mode == "mock":
        profile = _load_mock_profile(wallet)

    elif mode in ("sandbox", "live"):
        if not plaid_token:
            raise HTTPException(
                status_code=422,
                detail="plaid_token is required for sandbox/live mode. "
                       "Complete the Plaid Link flow first.",
            )
        plaid_env = "production" if mode == "live" else "sandbox"

        plaid_data, onchain_data = await _fetch_plaid_and_onchain(
            plaid_token, plaid_env, wallet
        )
        argyle_data = (
            await fetch_argyle_data(argyle_account_id)
            if argyle_account_id
            else {}
        )
        profile = {
            "plaid":           plaid_data,
            "argyle":          argyle_data,
            "onchain":         onchain_data,
            "payment_history": [],
        }

    else:
        raise HTTPException(status_code=500, detail=f"Unknown SCORE_MODE: {mode}")

    macro  = await get_macro_indicators()
    result = compute_score(profile, macro)
    return build_score_response(result, macro["fed_funds_upper_bps"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_mock_profile(wallet: str) -> dict:
    profile_name = get_profile_name(wallet)
    if profile_name is None:
        raise HTTPException(status_code=404, detail=f"No mock profile for wallet {wallet}")
    profile_path = PROFILES_DIR / f"{profile_name}.json"
    try:
        return json.loads(profile_path.read_text())
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"Profile file not found: {profile_name}.json")


async def _fetch_plaid_and_onchain(
    plaid_token: str, plaid_env: str, wallet: str
) -> tuple[dict, dict]:
    """Fetch Plaid and Helius data concurrently. Translates upstream errors to 502."""
    import asyncio
    try:
        plaid_task  = asyncio.create_task(fetch_plaid_data(plaid_token, plaid_env))
        helius_task = asyncio.create_task(fetch_helius_data(wallet))
        plaid_data, onchain_data = await asyncio.gather(plaid_task, helius_task)
        return plaid_data, onchain_data
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream API error ({exc.response.status_code}): {exc.response.text[:200]}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Upstream API unreachable: {exc}",
        ) from exc

# ── POST /score/installments ──────────────────────────────────────────────────

class InstallmentsRequest(BaseModel):
    principal: int = Field(..., description="Loan principal in USDC base units (6 decimals)")
    base_rate_bps: int = Field(..., description="Base rate in bps returned by GET /score")
    collateral_usdc: int = Field(0, description="Free USDC in vault offered as collateral (0 = no collateral)")
    score_tier: str = Field(..., description="Tier at scoring time: A | B | C | D")
    n_months: int = Field(..., ge=3, le=12, description="Loan term in months (3, 6, or 12)")

class InstallmentsResponse(BaseModel):
    hybrid_defi_pct: int = Field(..., description="% of loan as collateralized DeFi tranche (0 if no collateral)")
    hybrid_trad_pct: int = Field(..., description="% of loan as unsecured traditional tranche")
    defi_rate_bps: int = Field(..., description="Rate for collateralized tranche (base_rate - collateral discount)")
    trad_rate_bps: int = Field(..., description="Rate for unsecured tranche (base_rate)")
    blended_rate_bps: int = Field(..., description="Weighted blended rate — stored as fixed_rate_bps on-chain")
    monthly_payment_usdc: int = Field(..., description="Fixed monthly installment in USDC base units")
    total_cost_usdc: int = Field(..., description="Total repayment amount (principal + interest)")
    total_interest_usdc: int = Field(..., description="Total interest paid over loan lifetime")
    first_due_ts: int = Field(..., description="Unix timestamp of first installment due date")
    installments: list[Installment] = Field(..., description="Full Price amortization schedule")

@app.post("/score/installments", response_model=InstallmentsResponse)
def post_installments(body: InstallmentsRequest):
    """
    Amortization + hybrid split only — does NOT re-run the scoring model.

    Called on:
      - Screen 3 (user toggles collateral on/off)
      - Screen 4 (user changes loan term)

    Hybrid split logic:
      defi_rate_bps  = base_rate_bps - COLLATERAL_DISCOUNT_BPS (4% discount)
      trad_rate_bps  = base_rate_bps
      blended_bps    = (defi_pct/100)*defi_rate + (trad_pct/100)*trad_rate
      Max DeFi pct:  A=70%, B=60%, C=50%, D=0%
    """
    result = compute_installments(
        principal=body.principal,
        base_rate_bps=body.base_rate_bps,
        collateral_usdc=body.collateral_usdc,
        score_tier=body.score_tier,
        n_months=body.n_months,
    )
    return result

# ── POST /score/plaid/exchange ────────────────────────────────────────────────

class PlaidExchangeRequest(BaseModel):
    public_token: str = Field(..., description="Plaid public_token from Link onSuccess callback")
    plaid_env: str = Field("sandbox", description="'sandbox' or 'production'")

class PlaidExchangeResponse(BaseModel):
    access_token: str = Field(..., description="Plaid access_token — pass as plaid_token to GET /score")
    item_id: str = Field(..., description="Plaid item ID")

@app.post("/score/plaid/exchange", response_model=PlaidExchangeResponse)
async def post_plaid_exchange(body: PlaidExchangeRequest):
    """
    Exchange a Plaid public_token (from the Link onSuccess callback) for a
    persistent access_token. Call this from the frontend immediately after
    Plaid Link completes, then pass the returned access_token as `plaid_token`
    to GET /score.

    Keeps Plaid secrets server-side — the frontend never sees credentials.
    """
    if not PLAID_CLIENT_ID:
        raise HTTPException(status_code=503, detail="PLAID_CLIENT_ID is not configured")
    plaid_env = body.plaid_env if body.plaid_env in ("sandbox", "production") else "sandbox"
    base_url = PLAID_URLS.get(plaid_env, PLAID_URLS["sandbox"])
    secret   = PLAID_SECRET_PROD if plaid_env == "production" else PLAID_SECRET_SANDBOX

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{base_url}/item/public_token/exchange",
                json={
                    "client_id":    PLAID_CLIENT_ID,
                    "secret":       secret,
                    "public_token": body.public_token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Plaid exchange failed ({exc.response.status_code}): {exc.response.text[:200]}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Plaid unreachable: {exc}") from exc

    return {"access_token": data["access_token"], "item_id": data["item_id"]}


# ── GET /health ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Liveness probe."""
    return {"status": "ok"}

# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
