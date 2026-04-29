use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::InstallmentInput;

declare_id!("FCfqU7hKCSZGkmPiVqZqhjq2v585uwPM4VvieqgnJm2j");

#[program]
pub mod smartcontracts {
    use super::*;

    pub fn initialize_bank_pool(ctx: Context<InitializeBankPool>) -> Result<()> {
        instructions::initialize_bank_pool::handler(ctx)
    }

    pub fn initialize_mock_kamino(ctx: Context<InitializeMockKamino>) -> Result<()> {
        instructions::initialize_mock_kamino::handler(ctx)
    }

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        instructions::initialize_vault::handler(ctx)
    }

    pub fn deposit_usdc(ctx: Context<DepositUsdc>, amount: u64) -> Result<()> {
        instructions::deposit_usdc::handler(ctx, amount)
    }

    pub fn deposit_sol(ctx: Context<DepositSol>, amount: u64) -> Result<()> {
        instructions::deposit_sol::handler(ctx, amount)
    }

    pub fn rebalance_yield(ctx: Context<RebalanceYield>) -> Result<()> {
        instructions::rebalance_yield::handler(ctx)
    }

    pub fn approve_traditional_loan(
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
        instructions::approve_traditional_loan::handler(
            ctx, principal, fixed_rate_bps, collateral_usdc,
            hybrid_defi_pct, hybrid_trad_pct, defi_rate_bps, trad_rate_bps, installments,
        )
    }

    pub fn disburse_traditional(ctx: Context<DisburseTraditional>) -> Result<()> {
        instructions::disburse_traditional::handler(ctx)
    }

    pub fn repay_installment(ctx: Context<RepayInstallment>, installment_index: u8) -> Result<()> {
        instructions::repay_installment::handler(ctx, installment_index)
    }

    pub fn open_defi_loan(ctx: Context<OpenDefiLoan>, sol_collateral: u64, usdc_borrow: u64) -> Result<()> {
        instructions::open_defi_loan::handler(ctx, sol_collateral, usdc_borrow)
    }

    pub fn liquidate(ctx: Context<Liquidate>) -> Result<()> {
        instructions::liquidate::handler(ctx)
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        instructions::withdraw::handler(ctx, amount)
    }

    pub fn close_loan(ctx: Context<CloseLoan>) -> Result<()> {
        instructions::close_loan::handler(ctx)
    }

    pub fn update_score(ctx: Context<UpdateScore>, new_score: u16) -> Result<()> {
        instructions::update_score::handler(ctx, new_score)
    }
}
