use anchor_lang::prelude::*;
use crate::state::{LoanStatus, ScoreTier};
use crate::constants::MAX_INSTALLMENTS;

#[account]
pub struct LoanAccountTraditional {
    pub vault: Pubkey,
    pub loan_id: u8,
    pub bump: u8,

    pub principal: u64,               // USDC total (decimals: 6)
    pub fixed_rate_bps: u16,          // blended rate — immutable after approval
    pub collateral_usdc_locked: u64,  // USDC locked from vault (0 = no collateral)

    // Hybrid split fields — set by score engine, recorded for transparency
    pub hybrid_defi_pct: u8,          // % of loan as DeFi tranche (0 = no collateral)
    pub hybrid_trad_pct: u8,          // % as traditional (always 100 − defi_pct)
    pub defi_rate_bps: u16,           // collateralized tranche rate
    pub trad_rate_bps: u16,           // unsecured tranche rate

    pub n_installments: u8,
    pub paid_count: u8,
    pub installments: Vec<Installment>,

    pub score_tier: ScoreTier,        // tier at approval time (immutable)
    pub disbursed_at: i64,
    pub status: LoanStatus,
}

impl LoanAccountTraditional {
    pub fn space(n_installments: u8) -> usize {
        // 8 discriminator + 32 vault + 1 loan_id + 1 bump + 8 principal + 2 fixed_rate_bps +
        // 8 collateral_usdc_locked + 1 hybrid_defi_pct + 1 hybrid_trad_pct +
        // 2 defi_rate_bps + 2 trad_rate_bps + 1 n_installments + 1 paid_count +
        // 4 vec length prefix + n_installments * Installment::LEN +
        // 1 score_tier + 8 disbursed_at + 1 status
        8 + 32 + 1 + 1 + 8 + 2 + 8 + 1 + 1 + 2 + 2 + 1 + 1
            + 4 + (n_installments as usize) * Installment::LEN
            + 1 + 8 + 1
    }

    pub fn max_space() -> usize {
        Self::space(MAX_INSTALLMENTS)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Installment {
    pub due_ts: i64,        // unix timestamp of due date
    pub amount_usdc: u64,   // fixed installment (principal + interest)
    pub paid: bool,
    pub paid_ts: i64,       // unix timestamp when paid (0 = unpaid)
}

impl Installment {
    // i64 + u64 + bool + i64
    pub const LEN: usize = 8 + 8 + 1 + 8;
}

/// Input type passed from the score engine via the frontend
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InstallmentInput {
    pub due_ts: i64,
    pub amount_usdc: u64,
}
