# Avere Score Engine

FastAPI credit scoring service for the Avere neobank. Computes a 0–1000 score from gig income, bank cashflow, on-chain history, and macro conditions. Drives loan approval, rate calculation, and installment schedules.

Runs on `http://localhost:8000`. API docs at `/docs`.

---

## Endpoints

### `GET /score`

Full credit score computation.

**Query params:**

| Param | Required | Description |
|---|---|---|
| `wallet` | Yes | Base58 Solana public key |
| `plaid_token` | No | Plaid access token (required for sandbox/live modes) |
| `argyle_account_id` | No | Argyle account ID for gig income data |

**Response:**

```json
{
  "score": 810,
  "tier": "A",
  "max_loan_usdc": 10000000,
  "min_loan_usdc": 1000000,
  "base_rate_bps": 975,
  "breakdown": {
    "cashflow_score": 0.85,
    "income_score": 0.90,
    "onchain_score": 0.70,
    "payment_history_score": 0.80,
    "macro_multiplier": 0.97
  }
}
```

---

### `POST /score/installments`

Amortization schedule only — does not re-run the scoring model.

**Body:**

```json
{
  "principal": 5000000,
  "base_rate_bps": 975,
  "collateral_usdc": 1000000,
  "score_tier": "A",
  "n_months": 3
}
```

**Response:**

```json
{
  "hybrid_defi_pct": 70,
  "hybrid_trad_pct": 30,
  "defi_rate_bps": 575,
  "trad_rate_bps": 975,
  "blended_rate_bps": 695,
  "monthly_payment_usdc": 1710000,
  "total_cost_usdc": 5130000,
  "total_interest_usdc": 130000,
  "first_due_ts": 1747000000,
  "installments": [
    { "due_ts": 1747000000, "amount_usdc": 1710000 }
  ]
}
```

---

### `GET /score/plaid/link-token`

Creates a Plaid Link token for the frontend.

**Query params:** `wallet`, `plaid_env` (sandbox | production)

---

### `POST /score/plaid/exchange`

Exchanges a Plaid `public_token` for an `access_token` (server-side, secrets never exposed to frontend).

**Body:** `{ "public_token": "...", "plaid_env": "sandbox" }`

---

### `POST /score/sign-update-score`

Co-signs an `update_score` transaction with the oracle keypair. Required because `update_score` on-chain checks for the oracle's signature.

**Body:** `{ "wallet": "...", "new_score": 810, "tx_base64": "..." }`

**Response:** `{ "signed_tx_base64": "..." }`

---

### `GET /oracle-pubkey`

Returns the oracle's public key so the frontend can bind it to the `scoreAuthority` account in `update_score`.

---

## Score Modes

Controlled by `SCORE_MODE` in `.env`:

| Mode | Data source | Use case |
|---|---|---|
| `mock` | JSON profiles in `src/profiles/` | Demo wallets only — always fast, no external calls |
| `random` | SHA-256 of wallet address | Default for unknown wallets — deterministic, no API calls |
| `sandbox` | Plaid sandbox + Argyle sandbox + Helius devnet | Integration testing with real API flows |
| `live` | Plaid production + Argyle production + Helius mainnet | Production |

Demo wallets (`DEMO_WALLET_*` in `.env`) always use `mock` regardless of `SCORE_MODE`.

---

## Scoring Model

Five weighted factors produce the 0–1000 score:

| Factor | Weight | Signal |
|---|---|---|
| Income stability | 35% | Gig platform earnings consistency (Argyle) |
| Bank cashflow | 25% | Monthly inflow/outflow patterns (Plaid) |
| Payment history | 20% | Prior Avere repayments (on-chain) |
| On-chain activity | 10% | Wallet age, DeFi protocol diversity (Helius) |
| Macro multiplier | 10% | Fed Funds Rate, CPI (FRED) |

### FICO Calibration

| Avere Score | Tier | FICO Equivalent | APR (April 2026) |
|---|---|---|---|
| 800–1000 | A | ~720+ | 9.75% |
| 600–799 | B | ~650–719 | 12.75% |
| 400–599 | C | ~580–649 | 17.75% |
| 0–399 | D | <580 | DeFi collateral only |

Rate formula: `Fed Funds upper bound (3.75%) + tier spread`

---

## Score Delta Model

Applied after each on-chain event:

| Event | Delta |
|---|---|
| Early payment > 5 days | +30 pts |
| Early payment 1–5 days | +20 pts |
| On-time payment (±24h) | +10 pts |
| Late 1–7 days | −20 pts |
| Late > 7 days | −50 pts |
| USDC deposit | +15 pts |

Score is always clamped to `[0, 1000]`.

---

## Source Files

| File | Responsibility |
|---|---|
| `src/main.py` | FastAPI app, route handlers |
| `src/score.py` | Weighted scoring model |
| `src/amortization.py` | Price amortization, hybrid split, blended rate |
| `src/config.py` | `SCORE_MODE` routing, demo wallet map |
| `src/macro_data.py` | FRED API — Fed Funds Rate, CPI |
| `src/onchain_data.py` | Helius API — wallet history, DeFi activity |
| `src/income_data.py` | Argyle API — gig platform earnings |
| `src/passkey_routes.py` | Turnkey passkey wallet sub-organization management |
| `src/profiles/` | Mock JSON profiles for Maria, James, no-history |

---

## Running

```bash
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```

Test with the Maria demo wallet:

```bash
curl "http://localhost:8000/score?wallet=ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio"
# → score: 810, tier: A
```

Any wallet works — unknown wallets get a deterministic random score:

```bash
curl "http://localhost:8000/score?wallet=<any-solana-pubkey>"
```
