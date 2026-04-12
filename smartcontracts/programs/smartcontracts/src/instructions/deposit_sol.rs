use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
    require!(amount > 0, AvereError::ZeroDeposit);

    // Transfer native SOL (lamports) — never wrap to wSOL
    let cpi_accounts = system_program::Transfer {
        from: ctx.accounts.owner.to_account_info(),
        to:   ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.system_program.to_account_info(), cpi_accounts);
    system_program::transfer(cpi_ctx, amount)?;

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.sol_deposited = vault
        .sol_deposited
        .checked_add(amount)
        .ok_or(AvereError::Overflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct DepositSol<'info> {
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
