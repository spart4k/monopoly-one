-- server/sql/init.sql

-- 🔹 Таблица пользователей
CREATE TABLE IF NOT EXISTS users (
                                     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    nickname VARCHAR(32) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    is_verified BOOLEAN DEFAULT false  -- ✅ Оставляем поле, но не требуем подтверждения
    );

-- 🔹 Индексы для скорости
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);

-- 🔹 Тестовые данные (опционально, для дев-режима)
-- ⚠️ Пароль: "test123"
INSERT INTO users (email, nickname, password_hash)
SELECT
    'test@example.com',
    'Tester',
    '$2b$10$6P67m8BnqLPkbwuKg7Qv7etiyjEDaWiBS24BA2SLiK5zDENZkNRt'  -- Заглушка, реальный хеш ниже
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'test@example.com');