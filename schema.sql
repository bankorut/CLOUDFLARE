-- 1. TABEL USERS
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT DEFAULT '',
    role TEXT CHECK(role IN ('user', 'admin', 'bot')) DEFAULT 'user',
    is_banned INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexing untuk pencarian cepat user berdasarkan email & Google ID
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);

-- 2. TABEL POSTS
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    media_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);

-- 3. TABEL STORIES (Kadaluwarsa otomatis 24 Jam)
CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at);

-- 4. TABEL COMMENTS
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

-- 5. TABEL LIKES
CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. TABEL BOTS (Sistem Posting Otomatis)
CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    bot_user_id TEXT NOT NULL,
    prompt_template TEXT NOT NULL,
    topic TEXT NOT NULL,
    cron_expression TEXT DEFAULT '0 */6 * * *',
    is_active INTEGER DEFAULT 1,
    last_run_at DATETIME,
    FOREIGN KEY (bot_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 7. TABEL SETTINGS (Konfigurasi Fitur & Sistem Dinamis)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default Settings Injection
INSERT OR IGNORE INTO settings (key, value) VALUES
('feature_ai_chatbot', 'true'),
('feature_story_upload', 'true'),
('feature_bot_autopost', 'true'),
('maintenance_mode', 'false');


