// MOCK_KAMINO_FOR_DEVNET — replace with real Kamino CPI when migrating to mainnet.
// Holds program-owned USDC representing user deposits "deployed to Kamino".
// kUSDC shares track 1:1 with USDC for simplicity (no interest accrual on devnet).

use anchor_lang::prelude::*;

#[account]
pub struct MockKaminoPool {
    pub bump: u8,
    pub total_shares: u64, // sum of all UserVault.kamino_shares
}

impl MockKaminoPool {
    // 8 discriminator + 1 bump + 8 total_shares
    pub const LEN: usize = 8 + 1 + 8;
}
