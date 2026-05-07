use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("HaTuiRq9T9fMJ7Qjfm8etDUVdWqxRFoSzrHSZeJJ9JWQ");

#[program]
pub mod vaultasol {

    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;

        vault.total_deposit = 0;
        vault.total_users = 0;
        vault.fee = 10;
        vault.status = true;    
        emit!(CustomEvent {
            message: "Vault initialized successfully".to_string(),
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        
        let from_pubkey = ctx.accounts.payer.to_account_info();
        let to_pubkey = ctx.accounts.vault.to_account_info();
        let program_id = ctx.accounts.system_program.to_account_info();

        let cpi_context = CpiContext::new(
            program_id,
            Transfer {
                from: from_pubkey,
                to: to_pubkey,
            }
        );

        transfer(cpi_context, amount)?;

        let fee = amount.checked_mul(ctx.accounts.vault.fee).ok_or(MyError::NumericalOverflow)?.checked_div(100).ok_or(MyError::NumericalOverflow)?;

        let amount_after_fee = amount.checked_sub(fee).ok_or(MyError::NumericalOverflow)?;

        let vault = &mut ctx.accounts.vault;
        vault.total_deposit = vault.total_deposit.checked_add(amount_after_fee).ok_or(MyError::NumericalOverflow)?;

        let user_data = &mut ctx.accounts.user;

        if user_data.user_amount == 0 && !user_data.already_deposited {
            vault.total_users = vault.total_users.checked_add(1).ok_or(MyError::NumericalOverflow)?;
            user_data.already_deposited = true;
        }


        user_data.user_amount = user_data.user_amount.checked_add(amount_after_fee).ok_or(MyError::NumericalOverflow)?;
        user_data.timestamp = Clock::get()?.unix_timestamp;
        
        emit!(CustomEvent {
            message: "Deposit successful".to_string(),
        });

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        
        let user_data = &mut ctx.accounts.user;
        let vault = &mut ctx.accounts.vault;
        let payer = &mut ctx.accounts.payer;

        require!(user_data.user_amount >= amount, MyError::InsufficientFunds);

        vault.to_account_info().sub_lamports(amount)?;
        payer.to_account_info().add_lamports(amount)?;

        user_data.user_amount = user_data.user_amount.checked_sub(amount).ok_or(MyError::NumericalOverflow)?;
        vault.total_deposit = vault.total_deposit.checked_sub(amount).ok_or(MyError::NumericalOverflow)?;

        emit!(CustomEvent {
            message: "Withdrawal successful".to_string(),
        });

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        space = 8 + Vault::INIT_SPACE,
        payer = payer,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,
    pub system_program: Program<'info, System>
}

#[derive(Accounts)]
pub struct Deposit<'info>{
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut, 
        seeds = [b"vault"], 
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        init_if_needed,
        space = 8 + User::INIT_SPACE,
        payer = payer,
        seeds = [b"vault", payer.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,
    pub system_program: Program<'info, System>

}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [b"vault", payer.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,
    pub system_program: Program<'info, System>,
}



#[account]
#[derive(InitSpace)]
pub struct User {
    user_amount: u64,
    timestamp: i64,
    already_deposited: bool,
}

#[account]
#[derive(InitSpace)]
pub struct Vault {
    total_deposit: u64,
    total_users: u64,
    fee: u64,
    status: bool,
}

#[error_code]
pub enum MyError {
    #[msg("You do not have enough sol deposited to withdraw this amount.")]
    InsufficientFunds,
    #[msg("Numerical overflow occurred while performing the operation.")]
    NumericalOverflow,
}

#[event]
pub struct CustomEvent {
    pub message: String,
}