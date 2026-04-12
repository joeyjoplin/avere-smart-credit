use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<RepayInstallment>, installment_index: u8) -> Result<()> {
    require!(
        ctx.accounts.loan.status == LoanStatus::Active,
        AvereError::LoanNotActive
    );

    let idx = installment_index as usize;
    require!(
        idx < ctx.accounts.loan.installments.len(),
        AvereError::InvalidInstallmentIndex
    );
    require!(
        !ctx.accounts.loan.installments[idx].paid,
        AvereError::InstallmentAlreadyPaid
    );

    let amount = ctx.accounts.loan.installments[idx].amount_usdc;

    // Transfer repayment from user ATA back to BankPool ATA
    let cpi_accounts = TransferChecked {
        from:      ctx.accounts.user_usdc_ata.to_account_info(),
        mint:      ctx.accounts.usdc_mint.to_account_info(),
        to:        ctx.accounts.bank_pool_usdc_ata.to_account_info(),
        authority: ctx.accounts.owner.to_account_info(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token_interface::transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;

    // Mark installment paid — paid_ts ALWAYS written (blueprint rule 8)
    let paid_ts = Clock::get()?.unix_timestamp;
    let loan = &mut ctx.accounts.loan;
    loan.installments[idx].paid    = true;
    loan.installments[idx].paid_ts = paid_ts;
    loan.paid_count = loan
        .paid_count
        .checked_add(1)
        .ok_or(AvereError::Overflow)?;

    // Close loan if all installments are paid
    if loan.paid_count == loan.n_installments {
        loan.status = LoanStatus::Paid;
    }

    Ok(())
}

#[derive(Accounts)]
#[instruction(installment_index: u8)]
pub struct RepayInstallment<'info> {
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

    /// USDC mint — required for transfer_checked
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// User's USDC ATA (source of repayment)
    #[account(mut)]
    pub user_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    /// BankPool USDC ATA (destination)
    #[account(mut)]
    pub bank_pool_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}
