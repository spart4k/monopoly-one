-- server/sql/001_init.sql
-- Миграция #1: Базовая схема для пользователей и игр

-- Пользователи (глобальные профили)
CREATE TABLE IF NOT EXISTS users (
                                     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255), -- для будущих логинов
    rating INTEGER DEFAULT 1500, -- ELO рейтинг
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
    );

-- Игры (история матчей)
CREATE TABLE IF NOT EXISTS games (
                                     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) CHECK (status IN ('lobby', 'playing', 'finished')),
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
    );

-- Участники игр (связь user ↔ game)
CREATE TABLE IF NOT EXISTS game_players (
                                            game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    player_color VARCHAR(20), -- 'bg-red-500' и т.д.
    final_position INTEGER, -- где закончил (для статистики)
    final_money INTEGER,
    result VARCHAR(20) CHECK (result IN ('win', 'loss', 'bankrupt')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (game_id, user_id)
    );

-- События игры (опционально: для аналитики/повторов)
CREATE TABLE IF NOT EXISTS game_events (
                                           id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID REFERENCES games(id) ON DELETE CASCADE,
    player_id UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(50), -- 'roll_dice', 'buy_property', 'pay_rent'
    event_data JSONB, -- гибкое поле для любых данных
    occurred_at TIMESTAMPTZ DEFAULT NOW()
    );

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_events_game ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Триггер: обновлять updated_at при изменении users
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();