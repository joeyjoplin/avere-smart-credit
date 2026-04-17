use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<UpdateScore>, new_score: u16) -> Result<()> {
    // Clamp score to [0, 1000]
    let clamped = new_score.min(SCORE_MAX);

    let vault = &mut ctx.accounts.vault;
    vault.score             = clamped;
    vault.last_score_update = Clock::get()?.unix_timestamp;

    // Derive tier from new score
    vault.update_tier();

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateScore<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// Score engine oracle — must be signed by the program's oracle keypair.
    /// Constraint disabled in localnet builds so tests can use any signer.
    #[cfg_attr(
        not(feature = "localnet"),
        account(constraint = score_authority.key() == SCORE_ORACLE_PUBKEY @ AvereError::Unauthorized)
    )]
    pub score_authority: Signer<'info>,

    #[account(
        mut,
        seeds  = [SEED_VAULT, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ AvereError::Unauthorized,
    )]
    pub vault: Account<'info, UserVault>,
}
