CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('member', 'professional')),
  -- IANA name such as 'Asia/Kolkata'. Validated by the app; all instants are stored in UTC.
  timezone      TEXT NOT NULL,
  bio           TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_role_idx ON users (role);

-- Server-side login sessions. Only a SHA-256 hash of the cookie token is stored,
-- so a database leak does not hand out working tokens. Logout deletes the row.
CREATE TABLE auth_sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX auth_sessions_user_idx ON auth_sessions (user_id);
