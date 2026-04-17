use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

/// Closes a fully paid LoanAccountTraditional PDA and recovers rent.
pub fn handler(ctx: Context<CloseLoan>) -> Result<()> {
    require!(
        ctx.accounts.loan.status == LoanStatus::Paid,
        AvereError::LoanNotActive
    );
    // Anchor closes the account and transfers lamports to owner via `close = owner`
    Ok(())
}

#[derive(Accounts)]
pub struct CloseLoan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds  = [SEED_VAULT, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ AvereError::Unauthorized,
    )]
    pub vault: Account<'info, UserVault>,

    #[account(
        mut,
        close  = owner,
        seeds  = [SEED_LOAN_TRAD, loan.vault.as_ref(), &[loan.loan_id]],
        bump   = loan.bump,
        has_one = vault,
    )]
    pub loan: Account<'info, LoanAccountTraditional>,

    pub system_program: Program<'info, System>,
}
