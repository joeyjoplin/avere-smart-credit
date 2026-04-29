// MOCK_KAMINO_FOR_DEVNET — physical USDC moves between vault ATA and a
// program-owned "Kamino" pool ATA. Shares track 1:1 with USDC (no interest
// accrual on devnet). Replace with real Kamino CPI on mainnet.

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{self, Mint, TokenAccount, TokenInterface, TransferChecked};
use crate::{constants::*, errors::AvereError, state::*};

pub fn handler(ctx: Context<RebalanceYield>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let pool  = &ctx.accounts.mock_kamino_pool;
    let decimals = ctx.accounts.usdc_mint.decimals;

    // `usdc_free()` is the logical free balance (regardless of where it physically
    // sits). Target shares = `usdc_free() * tier split`.
    let target = (vault.usdc_free() as u128)
        .checked_mul(vault.kamino_split_bps() as u128)
        .ok_or(AvereError::Overflow)?
        .checked_div(10_000)
        .ok_or(AvereError::Overflow)? as u64;

    let current = vault.kamino_shares;

    if target > current {
        // Deposit delta into mock Kamino: vault ATA → pool ATA, signed by vault PDA.
        let delta = target - current;
        let owner_key = ctx.accounts.owner.key();
        let seeds: &[&[u8]] = &[SEED_VAULT, owner_key.as_ref(), &[vault.bump]];
        let signer_seeds = &[seeds];

        let cpi_accounts = TransferChecked {
            from:      ctx.accounts.vault_usdc_ata.to_account_info(),
            mint:      ctx.accounts.usdc_mint.to_account_info(),
            to:        ctx.accounts.mock_kamino_usdc_ata.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, delta, decimals)?;

        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.kamino_shares = vault_mut
            .kamino_shares
            .checked_add(delta)
            .ok_or(AvereError::Overflow)?;
        let pool_mut = &mut ctx.accounts.mock_kamino_pool;
        pool_mut.total_shares = pool_mut
            .total_shares
            .checked_add(delta)
            .ok_or(AvereError::Overflow)?;
        msg!("mock_kamino: deposited {} units · vault shares now {}", delta, vault_mut.kamino_shares);
    } else if current > target {
        // Redeem delta from mock Kamino: pool ATA → vault ATA, signed by pool PDA.
        let delta = current - target;
        let pool_seeds: &[&[u8]] = &[SEED_MOCK_KAMINO, &[pool.bump]];
        let signer_seeds = &[pool_seeds];

        let cpi_accounts = TransferChecked {
            from:      ctx.accounts.mock_kamino_usdc_ata.to_account_info(),
            mint:      ctx.accounts.usdc_mint.to_account_info(),
            to:        ctx.accounts.vault_usdc_ata.to_account_info(),
            authority: ctx.accounts.mock_kamino_pool.to_account_info(),
        };
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token_interface::transfer_checked(cpi_ctx, delta, decimals)?;

        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.kamino_shares = vault_mut
            .kamino_shares
            .checked_sub(delta)
            .ok_or(AvereError::Overflow)?;
        let pool_mut = &mut ctx.accounts.mock_kamino_pool;
        pool_mut.total_shares = pool_mut
            .total_shares
            .checked_sub(delta)
            .ok_or(AvereError::Overflow)?;
        msg!("mock_kamino: redeemed {} units · vault shares now {}", delta, vault_mut.kamino_shares);
    } else {
        msg!("mock_kamino: already at target ({}) — no-op", target);
    }

    Ok(())
}

#[derive(Accounts)]
pub struct RebalanceYield<'info> {
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

    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = vault,
    )]
    pub vault_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [SEED_MOCK_KAMINO],
        bump  = mock_kamino_pool.bump,
    )]
    pub mock_kamino_pool: Account<'info, MockKaminoPool>,

    #[account(
        mut,
        token::mint      = usdc_mint,
        token::authority = mock_kamino_pool,
    )]
    pub mock_kamino_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}
