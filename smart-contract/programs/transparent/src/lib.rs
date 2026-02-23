use anchor_lang::prelude::*;
use anchor_lang::system_program::{transfer, Transfer};

declare_id!("656vXmoQ3oYXdghy1PoVQ2NSzduwWW5XVfjJMqQ1fF44");

// -----------------------------------------------------------
// 🧱 Accounts structs FIRST
// -----------------------------------------------------------

#[derive(Accounts)]
#[instruction(room_name: String)]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = host,
        space = 8 + Game::INIT_SPACE,
        seeds = [b"game", host.key().as_ref(), room_name.as_bytes()],
        bump
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub host: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DistributePot<'info> {
    #[account(
        mut,
        has_one = host,
        close = host
    )]
    pub game: Account<'info, Game>,

    #[account(mut)]
    pub host: Signer<'info>,

    #[account(mut)]
    pub winner: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

// -----------------------------------------------------------
// 🧩 Data account
// -----------------------------------------------------------
#[account]
#[derive(InitSpace)]
pub struct Game {
    pub host: Pubkey,
    #[max_len(50)]
    pub room_name: String,
    pub buy_in: u64,
    pub pot_total: u64,
    pub is_open: bool,
    #[max_len(10)]
    pub players: Vec<Pubkey>,
}

// -----------------------------------------------------------
// 🚀 Program logic LAST
// -----------------------------------------------------------
#[program]
pub mod transparent {
    use super::*;

    pub fn create_game(ctx: Context<CreateGame>, room_name: String, buy_in: u64) -> Result<()> {
        let game = &mut ctx.accounts.game;

        game.host = ctx.accounts.host.key();
        game.room_name = room_name;
        game.buy_in = buy_in;
        game.pot_total = 0;
        game.is_open = true;
        game.players = Vec::new();

        Ok(())
    }

    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let game_info = ctx.accounts.game.to_account_info();
        let player_info = ctx.accounts.player.to_account_info();
        let system_program_info = ctx.accounts.system_program.to_account_info();

        let game = &mut ctx.accounts.game;
        let player = &ctx.accounts.player;

        require!(game.is_open, ErrorCode::GameClosed);
        require!(!game.players.contains(&player.key()), ErrorCode::AlreadyJoined);
        require!(game.players.len() < 10, ErrorCode::GameFull);

        let cpi_context = CpiContext::new(
            system_program_info,
            Transfer {
                from: player_info,
                to: game_info,
            },
        );

        transfer(cpi_context, game.buy_in)?;

        game.players.push(player.key());
        game.pot_total = game.pot_total.checked_add(game.buy_in).unwrap();

        Ok(())
    }

    pub fn distribute_pot(ctx: Context<DistributePot>, winner: Pubkey) -> Result<()> {
        let game_info = ctx.accounts.game.to_account_info();
        let winner_info = ctx.accounts.winner.to_account_info();

        let game = &mut ctx.accounts.game;

        require!(game.is_open, ErrorCode::GameClosed);
        require!(game.players.contains(&winner), ErrorCode::WinnerNotInGame);

        let pot_amount = game.pot_total;

        **game_info.try_borrow_mut_lamports()? -= pot_amount;
        **winner_info.try_borrow_mut_lamports()? += pot_amount;

        game.is_open = false;
        game.pot_total = 0;

        Ok(())
    }
}

// -----------------------------------------------------------
// ⚠️ Error messages
// -----------------------------------------------------------
#[error_code]
pub enum ErrorCode {
    #[msg("The game is closed")]
    GameClosed,
    #[msg("Player has already joined this game")]
    AlreadyJoined,
    #[msg("The game is full (max 10 players)")]
    GameFull,
    #[msg("Winner is not in the game")]
    WinnerNotInGame,
}
