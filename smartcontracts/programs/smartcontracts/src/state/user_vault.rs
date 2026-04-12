use anchor_lang::prelude::*;
use crate::constants::*;

#[account]
pub struct UserVault {
    pub owner: Pubkey,          // user's wallet
    pub bump: u8,               // PDA bump seed

    // Score
    pub score: u16,             // 0–1000
    pub score_tier: ScoreTier,

    // USDC (decimals: 6)
    pub usdc_deposited: u64,
    pub usdc_locked: u64,       // locked as collateral for a loan

    // SOL (in lamports)
    pub sol_deposited: u64,
    pub sol_locked: u64,

    // Yield
    pub kamino_shares: u64,     // kUSDC tokens received from Kamino
    pub msol_shares: u64,       // mSOL tokens from Marinade (0 until Marinade CPI)

    // Control
    pub active_loans: u8,
    pub created_at: i64,
    pub last_score_update: i64,
}

impl UserVault {
    // 8 discriminator + 32 owner + 1 bump + 2 score + 1 score_tier +
    // 8 usdc_deposited + 8 usdc_locked + 8 sol_deposited + 8 sol_locked +
    // 8 kamino_shares + 8 msol_shares + 1 active_loans + 8 created_at + 8 last_score_update
    pub const LEN: usize = 8 + 32 + 1 + 2 + 1 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 8;

    pub fn usdc_free(&self) -> u64 {
        self.usdc_deposited.saturating_sub(self.usdc_locked)
    }

    pub fn sol_free(&self) -> u64 {
        self.sol_deposited.saturating_sub(self.sol_locked)
    }

    pub fn kamino_split_bps(&self) -> u16 {
        match self.score_tier {
            ScoreTier::A => KAMINO_SPLIT_A_BPS,
            ScoreTier::B => KAMINO_SPLIT_B_BPS,
            ScoreTier::C => KAMINO_SPLIT_C_BPS,
            ScoreTier::D => KAMINO_SPLIT_D_BPS,
        }
    }

    /// Derive tier from score and update the field.
    pub fn update_tier(&mut self) {
        self.score_tier = if self.score >= SCORE_TIER_A_MIN {
            ScoreTier::A
        } else if self.score >= SCORE_TIER_B_MIN {
            ScoreTier::B
        } else if self.score >= SCORE_TIER_C_MIN {
            ScoreTier::C
        } else {
            ScoreTier::D
        };
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Default)]
pub enum ScoreTier {
    A,          // 800–1000
    B,          // 600–799
    C,          // 400–599
    #[default]
    D,          // 0–399 — DeFi only
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum LoanStatus {
    Active,
    Paid,
    Liquidated,
    Defaulted,
}
