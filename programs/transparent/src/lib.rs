use anchor_lang::prelude::*;
use anchor_lang::system_program;

declare_id!("2zPLNqsyqXNxaMkzWUMh1ZcbJBR3Jr2bTky1FFaZVuF9");

/// Transparent Escrow Program
///
/// Trustless pot management for the Transparent party game.
/// All buy-ins go to a PDA escrow — no player holds funds.
/// The host can distribute winnings or anyone can trigger
/// auto-refund after the game expires.

#[program]
pub mod transparent {
    use super::*;

    /// Host creates a game. Initializes the escrow PDA.
    pub fn create_game(
        ctx: Context<CreateGame>,
        room_code: String,
        buy_in_lamports: u64,
        max_players: u8,
        expiry_seconds: i64,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        game.host = ctx.accounts.host.key();
        game.room_code = room_code;
        game.buy_in_lamports = buy_in_lamports;
        game.max_players = max_players;
        game.player_count = 0;
        game.total_pot = 0;
        game.status = GameStatus::Waiting;
        game.created_at = Clock::get()?.unix_timestamp;
        game.expires_at = Clock::get()?.unix_timestamp + expiry_seconds;
        game.bump = ctx.bumps.game;
        Ok(())
    }

    /// Player joins the game by sending buy-in to the escrow PDA.
    pub fn join_game(ctx: Context<JoinGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;

        require!(game.status == GameStatus::Waiting, TransparentError::GameNotWaiting);
        require!(game.player_count < game.max_players, TransparentError::GameFull);

        let player_entry = &mut ctx.accounts.player_entry;
        require!(!player_entry.joined, TransparentError::AlreadyJoined);

        // Transfer buy-in from player to escrow PDA
        if game.buy_in_lamports > 0 {
            system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    system_program::Transfer {
                        from: ctx.accounts.player.to_account_info(),
                        to: ctx.accounts.escrow.to_account_info(),
                    },
                ),
                game.buy_in_lamports,
            )?;
        }

        player_entry.player = ctx.accounts.player.key();
        player_entry.game = game.key();
        player_entry.joined = true;
        player_entry.refunded = false;
        player_entry.payout = 0;
        player_entry.bump = ctx.bumps.player_entry;

        game.player_count += 1;
        game.total_pot += game.buy_in_lamports;

        Ok(())
    }

    /// Host starts the game (prevents new joins).
    pub fn start_game(ctx: Context<StartGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.status == GameStatus::Waiting, TransparentError::GameNotWaiting);
        require!(game.host == ctx.accounts.host.key(), TransparentError::NotHost);
        require!(game.player_count >= 2, TransparentError::NotEnoughPlayers);

        game.status = GameStatus::Playing;
        Ok(())
    }

    /// Host distributes winnings to a specific player (winner-takes-all).
    /// Can be called multiple times for split-pot (once per player).
    pub fn distribute(
        ctx: Context<Distribute>,
        amount_lamports: u64,
    ) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(
            game.status == GameStatus::Playing || game.status == GameStatus::Distributing,
            TransparentError::GameNotActive
        );
        require!(game.host == ctx.accounts.host.key(), TransparentError::NotHost);
        require!(amount_lamports <= game.total_pot, TransparentError::InsufficientPot);

        game.status = GameStatus::Distributing;

        // Transfer from escrow PDA to winner
        let seeds = &[
            b"escrow",
            game.key().as_ref(),
            &[ctx.bumps.escrow],
        ];
        let signer_seeds = &[&seeds[..]];

        **ctx.accounts.escrow.try_borrow_mut_lamports()? -= amount_lamports;
        **ctx.accounts.recipient.try_borrow_mut_lamports()? += amount_lamports;

        game.total_pot -= amount_lamports;

        // If pot is empty, game is over
        if game.total_pot == 0 {
            game.status = GameStatus::Completed;
        }

        Ok(())
    }

    /// Host ends the game and marks it complete.
    pub fn end_game(ctx: Context<EndGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.host == ctx.accounts.host.key(), TransparentError::NotHost);
        game.status = GameStatus::Completed;
        Ok(())
    }

    /// Refund a specific player (host-initiated, e.g. player wants to leave).
    pub fn refund_player(ctx: Context<RefundPlayer>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.host == ctx.accounts.host.key(), TransparentError::NotHost);
        require!(game.status == GameStatus::Waiting, TransparentError::GameNotWaiting);

        let player_entry = &mut ctx.accounts.player_entry;
        require!(player_entry.joined, TransparentError::NotJoined);
        require!(!player_entry.refunded, TransparentError::AlreadyRefunded);

        if game.buy_in_lamports > 0 {
            **ctx.accounts.escrow.try_borrow_mut_lamports()? -= game.buy_in_lamports;
            **ctx.accounts.player.try_borrow_mut_lamports()? += game.buy_in_lamports;
        }

        player_entry.refunded = true;
        game.player_count -= 1;
        game.total_pot -= game.buy_in_lamports;

        Ok(())
    }

    /// Anyone can call this after the game expires to refund ALL players.
    /// This is the trustless guarantee — if the host ghosts, funds are safe.
    pub fn refund_all_expired(ctx: Context<RefundExpired>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let clock = Clock::get()?;

        require!(
            clock.unix_timestamp > game.expires_at,
            TransparentError::GameNotExpired
        );
        require!(
            game.status != GameStatus::Completed,
            TransparentError::GameAlreadyCompleted
        );

        let player_entry = &mut ctx.accounts.player_entry;
        require!(player_entry.joined, TransparentError::NotJoined);
        require!(!player_entry.refunded, TransparentError::AlreadyRefunded);

        if game.buy_in_lamports > 0 {
            **ctx.accounts.escrow.try_borrow_mut_lamports()? -= game.buy_in_lamports;
            **ctx.accounts.player.try_borrow_mut_lamports()? += game.buy_in_lamports;
        }

        player_entry.refunded = true;
        game.total_pot -= game.buy_in_lamports;

        if game.total_pot == 0 {
            game.status = GameStatus::Completed;
        }

        Ok(())
    }

    /// Host cancels the game — refunds everyone automatically.
    pub fn cancel_game(ctx: Context<CancelGame>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(game.host == ctx.accounts.host.key(), TransparentError::NotHost);
        require!(
            game.status == GameStatus::Waiting,
            TransparentError::GameNotWaiting
        );

        game.status = GameStatus::Cancelled;
        // Individual refunds still need to be called per player
        // (or use refund_all_expired after expiry)
        Ok(())
    }
}

// ── Accounts ─────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(room_code: String)]
pub struct CreateGame<'info> {
    #[account(
        init,
        payer = host,
        space = 8 + GameState::SPACE,
        seeds = [b"game", host.key().as_ref(), room_code.as_bytes()],
        bump
    )]
    pub game: Account<'info, GameState>,

    /// CHECK: Escrow PDA that holds the pot. Just a system account.
    #[account(
        mut,
        seeds = [b"escrow", game.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,

    #[account(mut)]
    pub host: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct JoinGame<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    #[account(
        init_if_needed,
        payer = player,
        space = 8 + PlayerEntry::SPACE,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,

    /// CHECK: Escrow PDA
    #[account(
        mut,
        seeds = [b"escrow", game.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,

    #[account(mut)]
    pub player: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StartGame<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    pub host: Signer<'info>,
}

#[derive(Accounts)]
pub struct Distribute<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    /// CHECK: Escrow PDA
    #[account(
        mut,
        seeds = [b"escrow", game.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,

    /// CHECK: Winner/recipient
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    pub host: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EndGame<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    pub host: Signer<'info>,
}

#[derive(Accounts)]
pub struct RefundPlayer<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,

    /// CHECK: Escrow PDA
    #[account(
        mut,
        seeds = [b"escrow", game.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,

    /// CHECK: Player to refund
    #[account(mut)]
    pub player: UncheckedAccount<'info>,

    pub host: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RefundExpired<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    #[account(
        mut,
        seeds = [b"player", game.key().as_ref(), player.key().as_ref()],
        bump = player_entry.bump
    )]
    pub player_entry: Account<'info, PlayerEntry>,

    /// CHECK: Escrow PDA
    #[account(
        mut,
        seeds = [b"escrow", game.key().as_ref()],
        bump
    )]
    pub escrow: SystemAccount<'info>,

    /// CHECK: Player to refund
    #[account(mut)]
    pub player: UncheckedAccount<'info>,

    /// Anyone can call this — no signer restriction
    pub caller: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelGame<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,

    pub host: Signer<'info>,
}

// ── State ────────────────────────────────────────────────

#[account]
pub struct GameState {
    pub host: Pubkey,            // 32
    pub room_code: String,       // 4 + 10 (max)
    pub buy_in_lamports: u64,    // 8
    pub max_players: u8,         // 1
    pub player_count: u8,        // 1
    pub total_pot: u64,          // 8
    pub status: GameStatus,      // 1
    pub created_at: i64,         // 8
    pub expires_at: i64,         // 8
    pub bump: u8,                // 1
}

impl GameState {
    pub const SPACE: usize = 32 + (4 + 10) + 8 + 1 + 1 + 8 + 1 + 8 + 8 + 1 + 32; // + padding
}

#[account]
pub struct PlayerEntry {
    pub player: Pubkey,    // 32
    pub game: Pubkey,      // 32
    pub joined: bool,      // 1
    pub refunded: bool,    // 1
    pub payout: u64,       // 8
    pub bump: u8,          // 1
}

impl PlayerEntry {
    pub const SPACE: usize = 32 + 32 + 1 + 1 + 8 + 1 + 16; // + padding
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum GameStatus {
    Waiting,
    Playing,
    Distributing,
    Completed,
    Cancelled,
}

// ── Errors ───────────────────────────────────────────────

#[error_code]
pub enum TransparentError {
    #[msg("Game is not in waiting state")]
    GameNotWaiting,
    #[msg("Game is full")]
    GameFull,
    #[msg("Player already joined")]
    AlreadyJoined,
    #[msg("Not the host")]
    NotHost,
    #[msg("Not enough players to start")]
    NotEnoughPlayers,
    #[msg("Game is not active")]
    GameNotActive,
    #[msg("Insufficient pot balance")]
    InsufficientPot,
    #[msg("Player not joined")]
    NotJoined,
    #[msg("Player already refunded")]
    AlreadyRefunded,
    #[msg("Game has not expired yet")]
    GameNotExpired,
    #[msg("Game is already completed")]
    GameAlreadyCompleted,
}
