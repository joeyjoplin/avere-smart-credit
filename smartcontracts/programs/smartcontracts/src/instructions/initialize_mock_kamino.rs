// MOCK_KAMINO_FOR_DEVNET — one-time devnet setup. On mainnet this is replaced
// by Kamino's existing program; we never initialize Kamino state ourselves.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::{constants::*, state::*};

pub fn handler(ctx: Context<InitializeMockKamino>) -> Result<()> {
    let pool = &mut ctx.accounts.mock_kamino_pool;
    pool.bump         = ctx.bumps.mock_kamino_pool;
    pool.total_shares = 0;
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeMockKamino<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// PDA that owns the mock Kamino USDC holding ATA.
    #[account(
        init,
        payer  = authority,
        space  = MockKaminoPool::LEN,
        seeds  = [SEED_MOCK_KAMINO],
        bump
    )]
    pub mock_kamino_pool: Account<'info, MockKaminoPool>,

    #[account(address = USDC_MINT_PUBKEY)]
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// USDC pool ATA owned by the mock_kamino_pool PDA.
    #[account(
        init,
        payer = authority,
        associated_token::mint      = usdc_mint,
        associated_token::authority = mock_kamino_pool,
    )]
    pub mock_kamino_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
