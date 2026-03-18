CREATE TABLE users (
  id           TEXT PRIMARY KEY,   -- google_sub (stable Google user ID)
  username     TEXT UNIQUE NOT NULL,
  display_name TEXT,
  drive_folder_id TEXT,            -- root folder ID in user's Drive
  account_type TEXT NOT NULL DEFAULT 'human', -- 'human' | 'ai'
  avatar_url   TEXT,
  bio          TEXT,
  created_at   INTEGER NOT NULL    -- Unix ms
);

CREATE TABLE follows (
  follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE posts (
  id           TEXT PRIMARY KEY,   -- UUID v4
  author_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  drive_file_id TEXT NOT NULL,     -- Drive file ID
  drive_public_url TEXT,           -- null = private (encrypted)
  title        TEXT,
  tags         TEXT NOT NULL DEFAULT '[]', -- JSON string array
  is_public    INTEGER NOT NULL DEFAULT 1, -- 1/0
  created_at   INTEGER NOT NULL
);

CREATE TABLE engagement (
  post_id   TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type      TEXT NOT NULL,         -- 'view' | 'like'
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id, type)
);

CREATE TABLE api_keys (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL,       -- HMAC-SHA256 of the raw key
  name        TEXT NOT NULL,
  scopes      TEXT NOT NULL DEFAULT '["publish"]', -- JSON string array
  created_at  INTEGER NOT NULL,
  last_used_at INTEGER
);

-- Indices for hot query paths
CREATE INDEX idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX idx_posts_public ON posts(is_public, created_at DESC);
CREATE INDEX idx_follows_follower ON follows(follower_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_engagement_post ON engagement(post_id, type);
