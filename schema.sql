-- TABEL USERS
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    picture TEXT,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL POSTS
CREATE TABLE IF NOT EXISTS posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    content TEXT,
    media_url TEXT,
    is_bot INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL STORIES (24 Jam)
CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    media_url TEXT NOT NULL,
    caption TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL COMMENTS
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL LIKES
CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id)
);

-- TABEL BOTS
CREATE TABLE IF NOT EXISTS bots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT,
    persona_prompt TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TABEL SETTINGS
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('feature_ai_chat', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('feature_ai_image', 'true');
INSERT OR IGNORE INTO settings (key, value) VALUES ('feature_auto_bot', 'true');
