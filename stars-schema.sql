-- Run once in Cloudflare D1 console (database bound as WISH_DB)
CREATE TABLE IF NOT EXISTS star_wishes (
 id TEXT PRIMARY KEY,
 nickname TEXT NOT NULL,
 content TEXT NOT NULL,
 x REAL NOT NULL,
 y REAL NOT NULL,
 created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'visible',
 likes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_star_wishes_visible ON star_wishes(status,created_at DESC);
CREATE TABLE IF NOT EXISTS star_comments (
 id TEXT PRIMARY KEY,
 wish_id TEXT NOT NULL,
 nickname TEXT NOT NULL,
 content TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'visible'
);
CREATE INDEX IF NOT EXISTS idx_star_comments_wish ON star_comments(wish_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS star_rate_limits (
 bucket TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);

-- Admin password hashes and session invalidation state
CREATE TABLE IF NOT EXISTS star_settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL
);


CREATE INDEX IF NOT EXISTS idx_star_rate_expiry ON star_rate_limits(expires_at);
