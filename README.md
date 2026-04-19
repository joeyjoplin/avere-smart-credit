# Avere — Hybrid Credit for Gig Workers on Solana

Avere is a neobank MVP built on Solana devnet that gives gig workers (Uber, DoorDash, Upwork, Fiverr) access to credit based on verified income — not a traditional FICO score. It combines a traditional fixed-rate loan tranche with a DeFi collateral tranche into a single blended-rate product, scored by an off-chain credit engine.

Built for the Colosseum Hackathon.

---

## Architecture

```
avere-smart-credit/
├── smartcontracts/          # Anchor program (Solana devnet)
├── score_engine/            # FastAPI credit score engine (Python)
└── src/                     # React frontend (Vite + TypeScript)
```

### Anchor Program

**Program ID (devnet):** `FCfqU7hKCSZGkmPiVqZqhjq2v585uwPM4VvieqgnJm2j`

| Instruction | Status | Description |
|---|---|---|
| `initialize_vault` | ✅ Live | Creates a `UserVault` PDA for the connected wallet |
| `initialize_bank_pool` | ✅ Live | Creates the `BankPool` PDA (once, on first deposit) |
| `deposit_usdc` | ✅ Live | Transfers USDC from user wallet into vault ATA |
| `deposit_sol` | ✅ Live | Transfers SOL lamports into vault |
| `rebalance_yield` | ⚠️ Stub | Intended to CPI into Kamino Lend — no-op on devnet |
| `update_score` | ✅ Live | Writes oracle-signed score to `vault.score` |
| `approve_traditional_loan` | ✅ Live | Creates loan PDA with hybrid rate, locks collateral, stores installments[] |
| `disburse_traditional` | ✅ Live | Transfers USDC from BankPool to user |
| `repay_installment` | ✅ Live | Marks installment paid, records timestamp, updates paid_count |
| `close_loan` | ✅ Live | Closes loan PDA after full repayment, recovers rent |
| `withdraw` | ⚠️ Stub | Planned — requires Kamino CPI for kUSDC redemption |
| `liquidate` | ⚠️ Stub | Post-MVP |
| `open_defi_loan` | ⚠️ Stub | Post-MVP |

### Devnet Addresses

| Account | Address |
|---|---|
| Program | `FCfqU7hKCSZGkmPiVqZqhjq2v585uwPM4VvieqgnJm2j` |
| USDC mint | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` |
| BankPool PDA | `2wueQBbwNdpRnfgfFGEbj8BvQCD2Uevv82TuuJRZUXjs` |
| BankPool USDC ATA | `E7kGYMqeJSGJPoXiZSx2Bz5S92cofijmgzDyKAqYgYfs` |

### Score Engine

FastAPI service that computes a 0–1000 credit score from three data layers:

| Layer | Source | Mock | Sandbox | Live |
|---|---|---|---|---|
| On-chain | Helius API | JSON profile | Helius devnet | Helius mainnet |
| Bank cashflow | Plaid | JSON profile | Plaid sandbox | Plaid production |
| Gig income | Argyle | JSON profile | Argyle sandbox | Argyle production |
| Macro | FRED API | Always real | Always real | Always real |

Score tiers map to FICO equivalents:

| Avere Score | Tier | FICO Equivalent | APR (April 2026) |
|---|---|---|---|
| 800–1000 | A | ~720+ | 9.75% |
| 600–799 | B | ~650–719 | 12.75% |
| 400–599 | C | ~580–649 | 17.75% |
| 0–399 | D | <580 | DeFi collateral only |

### Frontend

React + Vite + TypeScript, styled with Tailwind CSS and shadcn/ui. Mobile-first layout.

**Auth:** Turnkey passkey embedded wallets (WebAuthn, device-bound). No seed phrases.

**Key screens:**

| Route | Screen |
|---|---|
| `/home` | Landing — connect wallet |
| `/deposit` | Onboarding — initialize vault + deposit USDC |
| `/dashboard` | Score card, active loan summary, transaction history |
| `/loan` | Loan flow — amount slider, collateral toggle, term, confirm |
| `/payments` | Installment list with Pay buttons |
| `/earn` | Earn & Build Score — additional deposits, score events |

---

## Running Locally

### Prerequisites

- Node.js 18+
- Python 3.11+
- Anchor CLI 0.30+
- Solana CLI (configured for devnet)

### Frontend

```bash
cd avere-smart-credit
npm install
npm run dev
# Runs on http://localhost:8080
```

### Score Engine

```bash
cd avere-smart-credit/score_engine
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
# API docs at http://localhost:8000/docs
```

### Anchor (rebuild + redeploy)

```bash
cd avere-smart-credit/smartcontracts
anchor build
anchor deploy --provider.cluster devnet
```

---

## Demo Wallets

Three wallets are pre-configured with mock profiles in `score_engine/src/profiles/`:

| Persona | Wallet | Score | Tier |
|---|---|---|---|
| Maria (Uber driver, stable income) | `ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio` | 810 | A |
| James (Upwork freelancer) | `Fsu2TS6ZbPVhoTdManZvUqdNuWq95fDHetj91wtHYs7r` | 680 | B |
| No history | `4qQbMCTknaYS7EwUMM42h2RfQjYRYT7RwtkbvCa3FBRW` | 320 | D |

Any other wallet receives a deterministic score derived from SHA-256 of its address (no external API calls, always Tier A–C).

---

## Environment

Copy `score_engine/.env.example` to `score_engine/.env` and fill in credentials for sandbox/live modes. Mock mode requires no credentials.

Key variables:

```
SCORE_MODE=mock|sandbox|live
PLAID_CLIENT_ID=
PLAID_SECRET_SANDBOX=
HELIUS_API_KEY=
TURNKEY_ORG_ID=
TURNKEY_API_PUBLIC_KEY=
TURNKEY_API_PRIVATE_KEY=
FRED_API_KEY=
```
