use anchor_lang::prelude::*;
use crate::{constants::*, state::*};

pub fn handler(ctx: Context<InitializeVault>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let clock = Clock::get()?;

    vault.owner             = ctx.accounts.owner.key();
    vault.bump              = ctx.bumps.vault;
    vault.score             = 0;
    vault.score_tier        = ScoreTier::D;
    vault.usdc_deposited    = 0;
    vault.usdc_locked       = 0;
    vault.sol_deposited     = 0;
    vault.sol_locked        = 0;
    vault.kamino_shares     = 0;
    vault.msol_shares       = 0;
    vault.active_loans      = 0;
    vault.created_at        = clock.unix_timestamp;
    vault.last_score_update = clock.unix_timestamp;

    Ok(())
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer  = owner,
        space  = UserVault::LEN,
        seeds  = [SEED_VAULT, owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, UserVault>,

    pub system_program: Program<'info, System>,
}
