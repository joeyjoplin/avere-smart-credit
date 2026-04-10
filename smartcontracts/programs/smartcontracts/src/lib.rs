use anchor_lang::prelude::*;

declare_id!("Biuv6W1PvDxt19XaieH9o478fG4L6PFRfQabNuUfgoVG");

#[program]
pub mod smartcontracts {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
