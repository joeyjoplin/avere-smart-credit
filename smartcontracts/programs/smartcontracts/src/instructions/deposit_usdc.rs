use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<DepositUsdc>, amount: u64) -> Result<()> {
    require!(amount > 0, AvereError::ZeroDeposit);

    // Transfer USDC from user ATA to vault ATA
    let cpi_accounts = TransferChecked {
        from:      ctx.accounts.user_usdc_ata.to_account_info(),
        mint:      ctx.accounts.usdc_mint.to_account_info(),
        to:        ctx.accounts.vault_usdc_ata.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

    // Update vault accounting
    let vault = &mut ctx.accounts.vault;
    vault.usdc_deposited = vault
        .usdc_deposited
        .checked_add(amount)
        .ok_or(AvereError::Overflow)?;

    Ok(())
}

#[derive(Accounts)]
pub struct DepositUsdc<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds  = [SEED_VAULT, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ AvereError::Unauthorized,
    )]
    pub vault: Account<'info, UserVault>,

    /// USDC mint — required for transfer_checked
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// User's USDC token account (source)
    #[account(mut)]
    pub user_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    /// Vault's USDC token account (destination — authority is vault PDA)
    #[account(mut)]
    pub vault_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
