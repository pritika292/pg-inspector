-- social_media scenario: Reddit-like.
--   sm_identity    — users
--   sm_communities — communities + subscriptions
--   sm_content     — posts + (recursive) comments
--   sm_engagement  — votes
-- Cross-schema FKs are real PG FKs (within-scenario).

-- ─── sm_identity ─────────────────────────────────────────────────────────

CREATE TABLE sm_identity.users (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  handle       TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  karma        INT NOT NULL DEFAULT 0
);

-- ─── sm_communities ──────────────────────────────────────────────────────

CREATE TABLE sm_communities.communities (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug             TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subscriber_count INT NOT NULL DEFAULT 0
);

CREATE TABLE sm_communities.subscriptions (
  user_id        INT NOT NULL REFERENCES sm_identity.users(id) ON DELETE CASCADE,
  community_id   INT NOT NULL REFERENCES sm_communities.communities(id) ON DELETE CASCADE,
  subscribed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, community_id)
);

-- ─── sm_content ──────────────────────────────────────────────────────────

CREATE TABLE sm_content.posts (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  community_id  INT NOT NULL REFERENCES sm_communities.communities(id) ON DELETE CASCADE,
  author_id     INT NOT NULL REFERENCES sm_identity.users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  body          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score         INT NOT NULL DEFAULT 0
);

CREATE INDEX posts_community_created_idx
  ON sm_content.posts(community_id, created_at DESC);

CREATE TABLE sm_content.comments (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id           INT NOT NULL REFERENCES sm_content.posts(id) ON DELETE CASCADE,
  parent_comment_id INT REFERENCES sm_content.comments(id) ON DELETE CASCADE,
  author_id         INT NOT NULL REFERENCES sm_identity.users(id) ON DELETE CASCADE,
  body              TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  score             INT NOT NULL DEFAULT 0
);

CREATE INDEX comments_post_created_idx
  ON sm_content.comments(post_id, created_at);

-- ─── sm_engagement ───────────────────────────────────────────────────────

CREATE TABLE sm_engagement.votes (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id     INT REFERENCES sm_content.posts(id) ON DELETE CASCADE,
  comment_id  INT REFERENCES sm_content.comments(id) ON DELETE CASCADE,
  voter_id    INT NOT NULL REFERENCES sm_identity.users(id) ON DELETE CASCADE,
  value       SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT votes_target_check CHECK (post_id IS NOT NULL OR comment_id IS NOT NULL)
);

CREATE INDEX votes_post_idx ON sm_engagement.votes(post_id) INCLUDE (value);
