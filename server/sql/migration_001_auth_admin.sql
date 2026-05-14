-- server/sql/migration_001_auth_admin.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'player' CHECK (role IN ('player', 'admin', 'moderator'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS games (
                                     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id VARCHAR(64) UNIQUE NOT NULL,
    host_id UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'PLAYING',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    winner_id UUID REFERENCES users(id)
    );

-- 🔑 Создай первого админа (пароль: Admin123!)
INSERT INTO users (email, nickname, password_hash, role) VALUES
    ('admin@monopoly.local', 'Admin', '$2b$10$XKvJZ8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8Z8', 'admin')
    ON CONFLICT (email) DO NOTHING;
-- ⚠️ Запусти `node -e "require('bcrypt').hash('Admin123!', 10).then(console.log)"` чтобы получить реальный хеш и замени заглушку выше!