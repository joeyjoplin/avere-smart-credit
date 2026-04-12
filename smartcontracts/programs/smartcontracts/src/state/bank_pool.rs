use anchor_lang::prelude::*;

#[account]
pub struct BankPool {
    pub bump: u8,
    pub usdc_available: u64,
}

impl BankPool {
    // 8 discriminator + 1 bump + 8 usdc_available
    pub const LEN: usize = 8 + 1 + 8;
}
