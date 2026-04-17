use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

/// Locks SOL collateral, reads Pyth price, and disburses USDC.
/// Phase 4 — requires Pyth oracle CPI (devnet only).
pub fn handler(_ctx: Context<OpenDefiLoan>, _sol_collateral: u64, _usdc_borrow: u64) -> Result<()> {
    err!(AvereError::NotImplemented)
}

#[derive(Accounts)]
pub struct OpenDefiLoan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds  = [SEED_VAULT, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ AvereError::Unauthorized,
    )]
    pub vault: Account<'info, UserVault>,

    pub system_program: Program<'info, System>,
}
