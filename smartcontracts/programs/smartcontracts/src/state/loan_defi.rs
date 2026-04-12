use anchor_lang::prelude::*;
use crate::state::LoanStatus;

#[account]
pub struct LoanAccountDefi {
    pub vault: Pubkey,
    pub loan_id: u8,
    pub bump: u8,

    pub sol_collateral: u64,    // lamports locked
    pub usdc_borrowed: u64,     // USDC disbursed
    pub ltv_bps: u16,           // e.g. 7000 = 70%
    pub liq_price_usd: u64,     // liquidation threshold — set at open via Pyth

    pub opened_at: i64,
    pub status: LoanStatus,
}

impl LoanAccountDefi {
    // 8 discriminator + 32 vault + 1 loan_id + 1 bump + 8 sol_collateral +
    // 8 usdc_borrowed + 2 ltv_bps + 8 liq_price_usd + 8 opened_at + 1 status
    pub const LEN: usize = 8 + 32 + 1 + 1 + 8 + 8 + 2 + 8 + 8 + 1;
}
