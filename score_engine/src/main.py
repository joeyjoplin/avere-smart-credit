import base64
import hashlib
import json
import os
from pathlib import Path
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from solders.keypair import Keypair  # type: ignore
from solders.transaction import VersionedTransaction  # type: ignore

load_dotenv()

# ── Oracle keypair ─────────────────────────────────────────────────────────────
# Loaded once at startup. Keypair file is never committed to git.
_ORACLE_KEYPAIR_PATH = Path(
    os.getenv("ORACLE_KEYPAIR_PATH", str(Path(__file__).parent.parent / "oracle-keypair.json"))
)

def _load_oracle_keypair() -> Keypair:
    if not _ORACLE_KEYPAIR_PATH.exists():
        raise RuntimeError(
            f"Oracle keypair not found at {_ORACLE_KEYPAIR_PATH}. "
            "Run: solana-keygen new --no-bip39-passphrase -o score_engine/oracle-keypair.json"
        )
    raw = json.loads(_ORACLE_KEYPAIR_PATH.read_text())
    return Keypair.from_bytes(bytes(raw))

ORACLE_KEYPAIR: Keypair = _load_oracle_keypair()
ORACLE_PUBKEY_STR: str = str(ORACLE_KEYPAIR.pubkey())

from config import resolve_score_mode, get_profile_name, PROFILES_DIR
from macro_data import get_macro_indicators
from score import compute_score, build_score_response, MIN_LOAN_USDC
from amortization import compute_installments
from income_data import fetch_plaid_data, fetch_argyle_data, PLAID_CLIENT_ID, PLAID_SECRET_SANDBOX, PLAID_SECRET_PROD, PLAID_URLS
from onchain_data import fetch_helius_data

app = FastAPI(
    title="Avere Score Engine",
    description="Credit scoring API for Avere hybrid neobank (Solana devnet)",
    version="0.2.0",
)

# ── Passkey routes ────────────────────────────────────────────────────────────
from passkey_routes import router as passkey_router  # noqa: E402
app.include_router(passkey_router)

# In-memory score cache: wallet → score. Populated by GET /score, read by sign-update-score
# so oracle can validate sandbox/live scores without a full re-fetch.
_score_cache: dict[str, int] = {}

# ── CORS ──────────────────────────────────────────────────────────────────────
# Allow frontend origins. Override via CORS_ORIGINS env var (comma-separated).
_cors_origins_env = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS: list[str] = (
    [o.strip() for o in _cors_origins_env.split(",") if o.strip()]
    if _cors_origins_env
    else [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8080",  # Vite dev server
        "http://localhost:5173",  # Vite alt port
    ]
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

class ScoreBreakdown(BaseModel):
    cashflow_score: int = Field(..., description="Cashflow sub-score (0–1000, weight 30%)")
    income_score: int = Field(..., description="Income sub-score (0–1000, weight 35%)")
    onchain_score: int = Field(..., description="On-chain activity sub-score (0–1000, weight 20%)")
    payment_history_score: int = Field(..., description="Repayment history sub-score (0–1000, weight 15%)")
    macro_multiplier: float = Field(..., description="Macro risk multiplier applied to raw score (0.8–1.0)")

class ScoreResponse(BaseModel):
    score: int = Field(..., ge=0, le=1000, description="Avere credit score (0–1000)")
    tier: str = Field(..., description="Score tier: A | B | C | D")
    max_loan_usdc: int = Field(..., description="Maximum approved loan in USDC base units")
    min_loan_usdc: int = Field(..., description="Minimum loan floor in USDC base units")
    base_rate_bps: int = Field(..., description="Base contract rate in basis points (Fed Funds + tier spread)")
    breakdown: ScoreBreakdown = Field(..., description="Per-factor sub-scores driving the final score")

@app.get("/score", response_model=ScoreResponse)
async def get_score(
    wallet: str = Query(..., description="Solana public key (base58)"),
    plaid_token: str | None = Query(None, description="Plaid access token (required for sandbox/live mode)"),
    argyle_account_id: str | None = Query(None, description="Argyle account ID (optional — gig workers only)"),
):
    """
    Full scoring pipeline. Called once on Loan tab mount; result cached in frontend state.

    SCORE_MODE routing:
      - Known demo wallets          → mock   (JSON profile, no external calls)
      - Any other wallet (default)  → random (deterministic score from wallet hash)
      - SCORE_MODE=sandbox + token  → Plaid sandbox + Argyle sandbox + Helius devnet
      - SCORE_MODE=live   + token   → Plaid production + Argyle production + Helius mainnet

    Always fetches macro indicators from FRED regardless of mode.
    """
    mode = resolve_score_mode(wallet)

    if mode == "mock":
        profile = _load_mock_profile(wallet)

    elif mode == "random":
        profile = _build_random_profile(wallet)

    elif mode in ("sandbox", "live"):
        if not plaid_token:
            # No bank linked yet — return a tier-D pending score so the frontend
            # shows the Plaid Link gate instead of erroring.
            macro = await get_macro_indicators()
            pending: dict = {
                "score": 0,
                "tier": "D",
                "max_loan_usdc": 0,
                "min_loan_usdc": MIN_LOAN_USDC,
                "base_rate_bps": macro["fed_funds_upper_bps"],
                "breakdown": {
                    "cashflow_score": 0,
                    "income_score": 0,
                    "onchain_score": 0,
                    "payment_history_score": 0,
                    "macro_multiplier": 1.0,
                },
            }
            _score_cache[wallet] = 0
            return pending
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
    response = build_score_response(result, macro["fed_funds_upper_bps"])
    _score_cache[wallet] = response["score"]
    return response


# ── Helpers ───────────────────────────────────────────────────────────────────

def _build_random_profile(wallet: str) -> dict:
    """
    Derive a deterministic synthetic profile from the wallet address.

    Same wallet always gets the same score — consistent across sessions.
    No external API calls. Score range: ~450–950 (Tiers A, B, C).

    Strategy: use SHA-256 of the wallet address to seed values for each
    profile field. Each byte of the digest controls a different dimension.
    """
    digest = hashlib.sha256(wallet.encode()).digest()

    def _byte(i: int, lo: float, hi: float) -> float:
        """Map digest byte i into [lo, hi]."""
        return lo + (digest[i] / 255.0) * (hi - lo)

    return {
        "plaid": {
            "avg_monthly_inflow_usd":          _byte(0, 1_200, 5_000),
            "avg_monthly_outflow_usd":         _byte(1,   800, 4_200),
            "negative_balance_days_per_month": int(_byte(2, 0, 3)),
            "recurring_payments":              ["rent", "utilities", "phone", "insurance"][: 1 + int(digest[3] % 4)],
        },
        "argyle": {
            "avg_monthly_gross_usd": _byte(4, 600, 4_000),
            "income_std_dev_usd":    _byte(5,  50,   600),
            "tenure_months":         int(_byte(6, 3, 36)),
            "active_platforms":      1 + int(digest[7] % 2),
        },
        "onchain": {
            "wallet_age_days":    int(_byte(8, 30, 500)),
            "avg_balance_usdc":   _byte(9, 50, 800),
            "tx_per_month":       int(_byte(10, 2, 25)),
        },
        "payment_history": [],
    }


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

# ── GET /score/plaid/link-token ───────────────────────────────────────────────

class LinkTokenResponse(BaseModel):
    link_token: str = Field(..., description="Plaid link_token — pass to usePlaidLink({ token })")
    expiration: str = Field(..., description="ISO 8601 expiration time (30 min from creation)")

@app.get("/score/plaid/link-token", response_model=LinkTokenResponse)
async def get_plaid_link_token(
    wallet: str = Query(..., description="Solana public key used as the Plaid client_user_id"),
    plaid_env: str = Query("sandbox", description="'sandbox' or 'production'"),
):
    """
    Create a Plaid link_token for the given wallet. The frontend initializes
    usePlaidLink({ token: link_token }) with this value, then exchanges the
    resulting public_token via POST /score/plaid/exchange.
    """
    if not PLAID_CLIENT_ID:
        raise HTTPException(status_code=503, detail="PLAID_CLIENT_ID is not configured")
    env = plaid_env if plaid_env in ("sandbox", "production") else "sandbox"
    base_url = PLAID_URLS.get(env, PLAID_URLS["sandbox"])
    secret = PLAID_SECRET_PROD if env == "production" else PLAID_SECRET_SANDBOX

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{base_url}/link/token/create",
                json={
                    "client_id": PLAID_CLIENT_ID,
                    "secret": secret,
                    "client_name": "Avere",
                    "user": {"client_user_id": wallet},
                    "products": ["transactions"],
                    "country_codes": ["US"],
                    "language": "en",
                },
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Plaid link_token creation failed ({exc.response.status_code}): {exc.response.text[:200]}",
        ) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Plaid unreachable: {exc}") from exc

    return {"link_token": data["link_token"], "expiration": data["expiration"]}


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


# ── GET /oracle-pubkey ────────────────────────────────────────────────────────

@app.get("/oracle-pubkey")
def get_oracle_pubkey():
    """
    Returns the oracle's public key. Frontend uses this to populate the
    score_authority account in update_score transactions.
    """
    return {"pubkey": ORACLE_PUBKEY_STR}


# ── POST /score/sign-update-score ─────────────────────────────────────────────

class SignUpdateScoreRequest(BaseModel):
    wallet: str = Field(..., description="Owner wallet pubkey (base58)")
    new_score: int = Field(..., ge=0, le=1000, description="Score value to write on-chain")
    tx_base64: str = Field(..., description="Base64-encoded serialized Transaction (partially signed by owner)")

class SignUpdateScoreResponse(BaseModel):
    signed_tx_base64: str = Field(..., description="Base64-encoded transaction with oracle signature added")

@app.post("/score/sign-update-score", response_model=SignUpdateScoreResponse)
async def sign_update_score(body: SignUpdateScoreRequest):
    """
    Co-signs an update_score transaction with the oracle keypair.

    Flow:
      1. Frontend builds update_score tx (owner signs)
      2. Frontend serializes tx and POSTs here with wallet + claimed score
      3. Score engine verifies the claimed score matches what it would compute
      4. Score engine adds oracle signature and returns the fully-signed tx
      5. Frontend submits to Solana

    This ensures update_score can only succeed when the score came from the engine.
    """
    # Re-derive the expected score for this wallet to validate the claim.
    # For sandbox/live wallets, use the in-memory cache populated by GET /score;
    # fall back to random only if the wallet was never scored this session.
    mode = resolve_score_mode(body.wallet)
    try:
        if body.wallet in _score_cache:
            expected_score = _score_cache[body.wallet]
        else:
            if mode == "mock":
                profile = _load_mock_profile(body.wallet)
            else:
                profile = _build_random_profile(body.wallet)
            macro = await get_macro_indicators()
            result = compute_score(profile, macro)
            score_response = build_score_response(result, macro["fed_funds_upper_bps"])
            expected_score = score_response["score"]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Score re-derivation failed: {exc}") from exc

    payment_deltas = {0, 20, 30, -20, -50}
    # Deposit bonus: +15 per deposit; allow up to 10 consecutive deposits above engine score
    deposit_bonuses = {15 * n for n in range(1, 11)}
    all_deltas = payment_deltas | deposit_bonuses
    allowed = {max(0, min(1000, expected_score + d)) for d in all_deltas}
    if body.new_score not in allowed:
        raise HTTPException(
            status_code=422,
            detail=f"Score mismatch: claimed {body.new_score}, engine computed {expected_score}",
        )

    # Decode and sign the transaction
    try:
        tx_bytes = base64.b64decode(body.tx_base64)
        tx = VersionedTransaction.from_bytes(tx_bytes)
        signed_tx = ORACLE_KEYPAIR.sign_message(bytes(tx.message))
        # Inject oracle signature at index 1 (index 0 = owner, already set)
        sigs = list(tx.signatures)
        sigs[1] = signed_tx
        tx_with_oracle = VersionedTransaction.populate(tx.message, sigs)
        return {"signed_tx_base64": base64.b64encode(bytes(tx_with_oracle)).decode()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Transaction signing failed: {exc}") from exc


# ── GET /health ───────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Liveness probe."""
    return {"status": "ok", "oracle_pubkey": ORACLE_PUBKEY_STR}

# ── Dev entrypoint ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
