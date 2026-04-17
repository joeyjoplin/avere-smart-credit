use anchor_lang::prelude::*;
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(
    ctx: Context<ApproveTraditionalLoan>,
    principal: u64,
    fixed_rate_bps: u16,
    collateral_usdc: u64,
    hybrid_defi_pct: u8,
    hybrid_trad_pct: u8,
    defi_rate_bps: u16,
    trad_rate_bps: u16,
    installments: Vec<InstallmentInput>,
) -> Result<()> {
    // ── Validations ──────────────────────────────────────────────────────────

    require!(principal >= MIN_LOAN_USDC,              AvereError::LoanBelowMinimum);
    require!(!installments.is_empty(),                AvereError::NoInstallments);
    require!(installments.len() <= MAX_INSTALLMENTS as usize, AvereError::TooManyInstallments);
    require!(
        hybrid_defi_pct.saturating_add(hybrid_trad_pct) == 100,
        AvereError::InvalidHybridSplit
    );

    {
        let vault = &ctx.accounts.vault;
        require!(vault.score_tier != ScoreTier::D,    AvereError::TierNotEligible);
        require!(vault.active_loans < MAX_ACTIVE_LOANS, AvereError::MaxLoansReached);
        require!(vault.usdc_free() >= collateral_usdc, AvereError::InsufficientCollateral);
    }

    // ── Write loan account ───────────────────────────────────────────────────

    let loan = &mut ctx.accounts.loan;
    loan.vault                 = ctx.accounts.vault.key();
    loan.loan_id               = ctx.accounts.vault.active_loans; // used as sequential ID
    loan.bump                  = ctx.bumps.loan;
    loan.principal             = principal;
    loan.fixed_rate_bps        = fixed_rate_bps;
    loan.collateral_usdc_locked = collateral_usdc;
    loan.hybrid_defi_pct       = hybrid_defi_pct;
    loan.hybrid_trad_pct       = hybrid_trad_pct;
    loan.defi_rate_bps         = defi_rate_bps;
    loan.trad_rate_bps         = trad_rate_bps;
    loan.n_installments        = installments.len() as u8;
    loan.paid_count            = 0;
    loan.score_tier            = ctx.accounts.vault.score_tier.clone();
    loan.disbursed_at          = 0;
    loan.status                = LoanStatus::Active;

    loan.installments = installments
        .into_iter()
        .map(|i| Installment {
            due_ts:      i.due_ts,
            amount_usdc: i.amount_usdc,
            paid:        false,
            paid_ts:     0,
        })
        .collect();

    // ── Update vault ─────────────────────────────────────────────────────────

    let vault = &mut ctx.accounts.vault;
    vault.usdc_locked = vault
        .usdc_locked
        .checked_add(collateral_usdc)
        .ok_or(AvereError::Overflow)?;
    vault.active_loans = vault
        .active_loans
        .checked_add(1)
        .ok_or(AvereError::Overflow)?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(
    principal: u64,
    fixed_rate_bps: u16,
    collateral_usdc: u64,
    hybrid_defi_pct: u8,
    hybrid_trad_pct: u8,
    defi_rate_bps: u16,
    trad_rate_bps: u16,
    installments: Vec<InstallmentInput>,
)]
pub struct ApproveTraditionalLoan<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds  = [SEED_VAULT, owner.key().as_ref()],
        bump   = vault.bump,
        has_one = owner @ AvereError::Unauthorized,
    )]
    pub vault: Account<'info, UserVault>,

    #[account(
        init,
        payer = owner,
        space = LoanAccountTraditional::max_space(),
        seeds = [SEED_LOAN_TRAD, vault.key().as_ref(), &[vault.active_loans]],
        bump
    )]
    pub loan: Account<'info, LoanAccountTraditional>,

    pub system_program: Program<'info, System>,
}
