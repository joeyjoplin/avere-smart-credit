use anchor_lang::prelude::*;

#[error_code]
pub enum AvereError {
    // Vault
    #[msg("Vault already initialized for this wallet")]
    VaultAlreadyExists,
    #[msg("Insufficient USDC balance in vault")]
    InsufficientUsdc,
    #[msg("Insufficient SOL balance in vault")]
    InsufficientSol,
    #[msg("Maximum active loans reached (3)")]
    MaxLoansReached,

    // Traditional loan
    #[msg("Score tier D is not eligible for traditional credit")]
    TierNotEligible,
    #[msg("Loan amount below minimum ($1 USDC)")]
    LoanBelowMinimum,
    #[msg("Loan amount exceeds approved limit")]
    LoanExceedsLimit,
    #[msg("Installment array exceeds maximum length (12)")]
    TooManyInstallments,
    #[msg("Installment array must not be empty")]
    NoInstallments,
    #[msg("Installment already paid")]
    InstallmentAlreadyPaid,
    #[msg("Installment index out of bounds")]
    InvalidInstallmentIndex,
    #[msg("Insufficient free USDC in vault for collateral")]
    InsufficientCollateral,

    // DeFi loan
    #[msg("Collateral amount too low for requested borrow")]
    CollateralTooLow,
    #[msg("Pyth price feed unavailable")]
    PriceUnavailable,
    #[msg("Loan is not eligible for liquidation")]
    NotLiquidatable,

    // General
    #[msg("Loan is not in Active status")]
    LoanNotActive,
    #[msg("Unauthorized: signer is not the vault owner")]
    Unauthorized,
    #[msg("Bank pool has insufficient liquidity")]
    PoolInsufficientLiquidity,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Deposit amount must be greater than zero")]
    ZeroDeposit,
    #[msg("Invalid USDC mint — expected Circle devnet USDC")]
    InvalidMint,
    #[msg("hybrid_defi_pct + hybrid_trad_pct must equal 100")]
    InvalidHybridSplit,
    #[msg("Instruction not yet implemented (Phase 4)")]
    NotImplemented,
}
