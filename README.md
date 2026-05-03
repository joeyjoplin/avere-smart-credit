# Avere — Hybrid Credit for Gig Workers on Solana

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

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

### Persona profiles (mock score profiles)

Three wallets have hand-crafted persona profiles in `score_engine/src/profiles/`:

| Persona | Wallet | Score | Tier |
|---|---|---|---|
| Maria (Uber driver, stable income) | `ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio` | 810 | A |
| James (Upwork freelancer) | `Fsu2TS6ZbPVhoTdManZvUqdNuWq95fDHetj91wtHYs7r` | 680 | B |
| No history | `4qQbMCTknaYS7EwUMM42h2RfQjYRYT7RwtkbvCa3FBRW` | 320 | D |

Any other wallet receives a deterministic score derived from SHA-256 of its address (no external API calls, always Tier A–C).

### Pre-funded devnet wallets (live demo)

Five throwaway devnet wallets are pre-funded with **0.1 SOL + 20 USDC each** so judges and testers can try the full Deposit → Score → Loan → Repay cycle without hitting Solana / Circle faucets.

Public page: [`/demo-wallets`](https://avere-smart-credit.vercel.app/demo-wallets) — lists all five with "Reveal private key" + "Copy" buttons.

| # | Pubkey |
|---|---|
| 1 | `7pu2CgQ5sYHj2JYG6qxuuFERA6DgRpQafWBQxJZ5hXze` |
| 2 | `5b6xLopMLUvnAWqB4CuQ1ZsP8tdY1AHHnU58nh8g37oJ` |
| 3 | `92zxYBVeogcDpQ88Vmr6VgSnPQJ7C3JADvjXjKZwHiC2` |
| 4 | `FMqFjuXW4H5Upo9Qvm8wws7i8jJr2unCHNFspTPcf2xt` |
| 5 | `AQ4yGwojhgtWi78rKGXcmTaREnN3kPv8bNmu5z1AcDBo` |

**Judge demo flow:**

1. Visit [`/demo-wallets`](https://avere-smart-credit.vercel.app/demo-wallets), reveal + copy a private key
2. [Phantom](https://phantom.app) → **Add / Connect Wallet** → **Import Private Key** → paste
3. Phantom → Settings → **Developer Settings** → Network → **Devnet**
4. Open [Avere](https://avere-smart-credit.vercel.app) → Connect → pick **Phantom**

The wallet now has $20 USDC ready for deposit. The Avere wallet adapter surfaces both Turnkey (passkey) and Phantom — judges with Phantom + a demo keypair connect without ever touching a faucet.

**Refilling drained wallets.** Demo wallets are public, so anyone can drain them. The funding script is idempotent — it tops up only what's missing:

```bash
cd avere-smart-credit/smartcontracts
yarn ts-node scripts/fund_demo_wallets.ts
```

Source: USDC comes from `score_engine/faucet-keypair.json` (top up at [faucet.circle.com](https://faucet.circle.com), Solana Devnet). SOL comes from your deployer keypair `~/.config/solana/id.json`. Run it whenever a wallet drops below 5 USDC or 0.05 SOL.

> **Security:** these are throwaway devnet keys committed to the repo. They hold devnet USDC only. **Never** add mainnet keys to `scripts/keypairs/demo-*-keypair.json`.

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

---

## Fiat On/Off-Ramp (post-MVP — required for production launch)

Avere targets users who are invisible to traditional credit — gig workers, immigrants, thin-file users. **~95% of that demographic does not hold USDC** and cannot onboard via "deposit USDC". A real production launch requires fiat ramps in every market we serve.

### Hackathon scope vs. production scope

| Surface | Hackathon | Production |
|---|---|---|
| Onboarding entry point | Pre-funded devnet wallets at [`/demo-wallets`](https://avere-smart-credit.vercel.app/demo-wallets) | Fiat → USDC via on-ramp partner |
| Withdrawal | Wallet-to-wallet USDC | USDC → fiat via off-ramp partner |
| Conversion fees | None (devnet) | 1–5% depending on rail (Pix/SPEI cheapest, card most expensive) |
| KYC | Sumsub sandbox | Sumsub + on-ramp partner KYC (stacked at launch, single-pass at maturity) |

### Provider strategy

| Phase | Provider | Role | Region | Timeline |
|---|---|---|---|---|
| 2a | **Sphere Labs** | Stablecoin-native ACH on/off-ramp, lowest USDC fees | **US — first** | ~6 weeks post-hackathon |
| 2b | **MoonPay** | Card on-ramp aggregator | Tail markets (UK, SG, UAE, AU, EU under MiCA, etc.) | ~3 months post-hackathon |
| 2c | **Bitso** | Pix on/off-ramp (BRL ↔ USDC), SPEI on/off-ramp (MXN ↔ USDC) | LATAM (Brazil + Mexico) — **last, gated on regulatory clarity** | 6+ months, regulation-dependent |

**Launch sequence is regulatory-driven, not demand-driven.** The US has the friendliest stablecoin neobank regulation today (post-2025 SAB 121 repeal, GENIUS Act stablecoin framework, clear MTL-via-partner pathways). LATAM has the **largest demand** (BRL/MXN inflation hedge → enormous dollar-saving demand) but Brazil's BCB tightened VASP licensing through 2024–2025 and Mexico's CNBV maintains restrictive Fintech Law constraints. We launch where we can, then expand as licensing pathways open. Pix and SPEI are technically excellent rails — the bottleneck is regulation, not technology.

### Hard rules

1. **Anchor instructions never change for fiat.** USDC settles off-chain via the on-ramp partner, then the existing `deposit_usdc` instruction credits the vault. Two-Layer Principle preserved — user sees "Deposit $50", never "USDC".
2. **Off-ramp parity.** Every on-ramp shipped must include its off-ramp in the same release. Users who can put money in but can't take it out will not trust the product.
3. **Avere is never a money transmitter.** The on-ramp partner holds the MTL and bears the regulatory burden. Avere "introduces" users — never custodies fiat.

See [AVERE_BLUEPRINT.md `## Fiat On/Off-Ramp`](AVERE_BLUEPRINT.md) for the full provider matrix, KYC integration patterns, on-chain implications, unit economics, and risk analysis.

---

## Score-as-a-Service (post-MVP — architecture preview)

Avere is **two products in one codebase**:

- **Layer 1 — the neobank.** A consumer fintech for the workforce that traditional credit can't see (gig workers, immigrants, crypto-paid). Every loan generates labeled training data: did the user repay? Did they default? This is the data factory.
- **Layer 2 — the Avere Score API.** Lenders, marketplaces, DAOs, gig platforms, and any protocol that needs to underwrite the same demographic pay per query to read a user's Avere Score. Users always free; businesses pay. The bank IS the moat for the score.

### The flywheel

```
More bank users → more loan outcomes → better ML model → better-calibrated scores
       ↑                                                              ↓
       └── more user CAC funded by ───── more B2B partners pay ───────┘
```

### B2B endpoint surface (planned)

The user-facing `/score?wallet=…` endpoint stays free and unmetered. B2B partners use a separate, authenticated endpoint:

```bash
curl "https://api.avere.finance/score/verify?wallet=<USER>&audience=<PARTNER>" \
  -H "X-API-Key: <CUSTOMER_KEY>"
```

Sample response (oracle-signed attestation):

```json
{
  "attestation": {
    "wallet": "ASXean8novL6x5eUWQ2qRdsXU9crTRkB6auA6uxCVeio",
    "score": 810,
    "tier": "A",
    "fico_equivalent": "720+",
    "issued_at": 1714234567,
    "expires_at": 1714234867,
    "audience": "BoRRowPRoTo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "grant_pda": "ScoREgRanT1XXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "breakdown": {
      "cashflow": 0.78,
      "income": 0.82,
      "onchain": 0.65,
      "payment_history": 0.91
    }
  },
  "signature": "ed25519:base64...",
  "billing": { "charged_usd": 0.30, "remaining_credits": 9670 }
}
```

The consumer verifies the `signature` locally with the public Avere oracle pubkey — no need to trust the API at request time.

### Pricing tiers (planned)

| Tier | Audience | Price |
|---|---|---|
| Self-query | Wallet owner | Free, unmetered |
| Pay-as-you-go | Small lenders, DAOs | $0.30 / query |
| Growth | Mid-market lenders | $5k/yr (50k queries) + $0.10 over |
| Enterprise | Banks, large fintechs | $50k/yr (1M queries) + custom |

### Authorization model

Every B2B read requires an on-chain `ScoreShareGrant` PDA the user has authorized — audience-bound, time-limited, revocable:

| Field | Purpose |
|---|---|
| `vault` | Whose score |
| `audience` | Which consumer pubkey |
| `expires_at` | Unix ts; reads after this fail |
| `max_reads` | Optional rate limit per grant |
| `revoked` | User flips to `true` to revoke |

The `/score/verify` endpoint refuses to mint an attestation without a valid grant. Users manage grants from the Dashboard "Manage shares →" link. Revocation is instant.

### What's live today

- ✅ `/lender-demo` — frontend visualization of the B2B flow ([app.avere.finance/lender-demo](https://avere-smart-credit.vercel.app/lender-demo))
- ✅ "Manage shares" Dashboard UI — mock state in `localStorage` for the hackathon
- ⏳ `ScoreShareGrant` Anchor instruction — post-MVP
- ⏳ `/score/verify` endpoint with API key auth + Stripe billing — post-MVP


---

## License

[MIT](LICENSE) © 2026 Avere
