// PDA seeds
pub const SEED_VAULT:        &[u8] = b"vault";
pub const SEED_LOAN_TRAD:    &[u8] = b"loan-t";
pub const SEED_LOAN_DEFI:    &[u8] = b"loan-d";
pub const SEED_BANK_POOL:    &[u8] = b"bank-pool";
pub const SEED_MOCK_KAMINO:  &[u8] = b"mock-kamino"; // MOCK_KAMINO_FOR_DEVNET

// Business rules
pub const MAX_ACTIVE_LOANS:    u8  = 3;
pub const MAX_INSTALLMENTS:    u8  = 12;
pub const MIN_LOAN_USDC:       u64 = 1_000_000;    // $1 USDC — faucet-viable devnet amounts
pub const LTV_BPS:             u16 = 7_000;         // 70% max borrow vs collateral
pub const LIQ_THRESHOLD_BPS:  u16 = 8_000;         // liquidate if LTV exceeds 80%

// Score tier thresholds
pub const SCORE_TIER_A_MIN: u16 = 800;
pub const SCORE_TIER_B_MIN: u16 = 600;
pub const SCORE_TIER_C_MIN: u16 = 400;
pub const SCORE_MAX:        u16 = 1000;
pub const SCORE_MIN:        u16 = 0;

// Kamino split by tier (bps of free USDC sent to Kamino)
pub const KAMINO_SPLIT_A_BPS: u16 = 7_000; // 70%
pub const KAMINO_SPLIT_B_BPS: u16 = 5_000; // 50%
pub const KAMINO_SPLIT_C_BPS: u16 = 3_500; // 35%
pub const KAMINO_SPLIT_D_BPS: u16 = 0;     // DeFi only

// Score deltas (MVP event-driven updates)
pub const SCORE_DELTA_EARLY_GT5D: u16  = 30;  // paid > 5 days before due
pub const SCORE_DELTA_EARLY_1_5D: u16  = 20;  // paid 1–5 days before due
pub const SCORE_DELTA_ON_TIME:    u16  = 10;  // paid within ±24h of due
pub const SCORE_DELTA_LATE_7D:    u16  = 20;  // paid 1–7 days late (subtract)
pub const SCORE_DELTA_LATE_7D_PLUS: u16 = 50; // paid > 7 days late (subtract)
pub const SCORE_DELTA_EARN_DEPOSIT: u16 = 15; // any confirmed earn deposit

// Collateral discount thresholds (in % of principal)
pub const COLLATERAL_DISCOUNT_FULL_BPS:  u16 = 400; // ≥100% collateral → -4% APR
pub const COLLATERAL_DISCOUNT_HALF_BPS:  u16 = 200; // ≥50%  collateral → -2% APR
pub const COLLATERAL_THRESHOLD_FULL:     u8  = 100;
pub const COLLATERAL_THRESHOLD_HALF:     u8  = 50;

// External program addresses (devnet)
pub const PYTH_SOL_USD_FEED: &str = "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix";
pub const USDC_MINT_DEVNET:  &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

// Typed pubkey constants — used in account address constraints
use anchor_lang::prelude::Pubkey;

/// Standard Circle devnet USDC mint. All token instructions validate against this.
pub const USDC_MINT_PUBKEY: Pubkey =
    Pubkey::from_str_const("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

/// Score engine oracle keypair. update_score requires this account as a Signer.
/// Keypair lives in score_engine/oracle-keypair.json (never committed).
pub const SCORE_ORACLE_PUBKEY: Pubkey =
    Pubkey::from_str_const("HRcsEto5uezCKCPeesYN5mq2wa1MUjvQFnJwKUhAYi7A");
