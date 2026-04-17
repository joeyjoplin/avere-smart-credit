use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<DisburseTraditional>) -> Result<()> {
    // Loan must be Active and not yet disbursed
    require!(
        ctx.accounts.loan.status == LoanStatus::Active,
        AvereError::LoanNotActive
    );
    require!(
        ctx.accounts.loan.disbursed_at == 0,
        AvereError::LoanNotActive
    );

    let principal = ctx.accounts.loan.principal;

    // BankPool must have sufficient liquidity
    require!(
        ctx.accounts.bank_pool_usdc_ata.amount >= principal,
        AvereError::PoolInsufficientLiquidity
    );

    // Transfer USDC from BankPool ATA to user ATA using PDA signer
    let bump = ctx.accounts.bank_pool.bump;
    let seeds: &[&[u8]] = &[SEED_BANK_POOL, &[bump]];
    let signer_seeds = &[seeds];

    let cpi_accounts = TransferChecked {
        from:      ctx.accounts.bank_pool_usdc_ata.to_account_info(),
        mint:      ctx.accounts.usdc_mint.to_account_info(),
        to:        ctx.accounts.user_usdc_ata.to_account_info(),
        authority: ctx.accounts.bank_pool.to_account_info(),
    };
    let cpi_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
        signer_seeds,
    );
    token_interface::transfer_checked(cpi_ctx, principal, ctx.accounts.usdc_mint.decimals)?;

    // Mark disbursement time — prevents double disburse
    ctx.accounts.loan.disbursed_at = Clock::get()?.unix_timestamp;

    // Sync usdc_available from ATA truth (counter starts at 0 but ATA is funded externally)
    ctx.accounts.bank_pool.usdc_available = ctx.accounts.bank_pool_usdc_ata.amount;

    Ok(())
}

#[derive(Accounts)]
pub struct DisburseTraditional<'info> {
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
        seeds  = [SEED_LOAN_TRAD, vault.key().as_ref(), &[loan.loan_id]],
        bump   = loan.bump,
        has_one = vault,
    )]
    pub loan: Account<'info, LoanAccountTraditional>,

    #[account(
        mut,
        seeds = [SEED_BANK_POOL],
        bump  = bank_pool.bump,
    )]
    pub bank_pool: Account<'info, BankPool>,

    /// USDC mint — validated against the known Circle devnet USDC address
    #[account(address = USDC_MINT_PUBKEY @ AvereError::InvalidMint)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// BankPool's USDC ATA (source of funds) — authority + mint constrained to prevent substitution
    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = bank_pool,
    )]
    pub bank_pool_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    /// User's USDC ATA (destination)
    #[account(mut)]
    pub user_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
