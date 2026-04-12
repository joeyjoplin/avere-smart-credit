use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

/// Checks Pyth price vs liquidation threshold and executes liquidation.
/// Phase 4 — requires Pyth oracle CPI (devnet only).
pub fn handler(_ctx: Context<Liquidate>) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        mut,
        seeds  = [SEED_VAULT, vault.owner.as_ref()],
        bump   = vault.bump,
    )]
    pub vault: Account<'info, UserVault>,

    pub system_program: Program<'info, System>,
}
