use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
    require!(amount > 0, AvereError::ZeroDeposit);

    let vault = &ctx.accounts.vault;
    require!(vault.usdc_free() >= amount, AvereError::InsufficientUsdc);

    // Sign the CPI with vault PDA seeds
    let owner_key = ctx.accounts.owner.key();
    let seeds: &[&[u8]] = &[SEED_VAULT, owner_key.as_ref(), &[vault.bump]];
    let signer_seeds = &[seeds];

    let cpi_accounts = TransferChecked {
        from:      ctx.accounts.vault_usdc_ata.to_account_info(),
        mint:      ctx.accounts.usdc_mint.to_account_info(),
        to:        ctx.accounts.user_usdc_ata.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

    let vault = &mut ctx.accounts.vault;
    vault.usdc_deposited = vault
        .usdc_deposited
        .checked_sub(amount)
        .ok_or(AvereError::Overflow)?;

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

    #[account(address = USDC_MINT_PUBKEY @ AvereError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// Vault's USDC token account (source — authority is vault PDA)
    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = vault,
    )]
    pub vault_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    /// User's USDC token account (destination)
    #[account(mut)]
    pub user_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
