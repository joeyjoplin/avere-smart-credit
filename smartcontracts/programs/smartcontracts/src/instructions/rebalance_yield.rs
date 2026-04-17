use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

/// Deposits free USDC into Kamino Lend and stores the received kUSDC shares.
/// Phase 4 — requires Kamino CPI accounts (devnet only).
/// The account struct is defined but the CPI call is wired in Phase 4.
pub fn handler(_ctx: Context<RebalanceYield>) -> Result<()> {
    msg!("rebalance_yield: devnet stub — no Kamino CPI");
    Ok(())
}

#[derive(Accounts)]
pub struct RebalanceYield<'info> {
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
