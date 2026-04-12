use anchor_lang::prelude::*;
use crate::{constants::*, state::*};

/// One-time initialization of the program-wide BankPool PDA.
/// Called once by the program authority before any loans can be disbursed.
pub fn handler(ctx: Context<InitializeBankPool>) -> Result<()> {
    let pool = &mut ctx.accounts.bank_pool;
    pool.bump           = ctx.bumps.bank_pool;
    pool.usdc_available = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeBankPool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer  = authority,
        space  = BankPool::LEN,
        seeds  = [SEED_BANK_POOL],
        bump
    )]
    pub bank_pool: Account<'info, BankPool>,

    pub system_program: Program<'info, System>,
}
