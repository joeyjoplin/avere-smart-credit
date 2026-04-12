use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

/// Redeems kUSDC from Kamino and returns tokens to the user.
/// Phase 4 — requires Kamino CPI (devnet only).
pub fn handler(_ctx: Context<Withdraw>, _amount: u64) -> Result<()> {
    Ok(())
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
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
