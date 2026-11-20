// The chat database layout. Updates only ever ADD to it, so old messages are never lost.
export const BASE_SQL = `
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, ts INTEGER NOT NULL, mine INTEGER NOT NULL, text TEXT NOT NULL,
    reply_to TEXT, state INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0, r_mine TEXT, r_theirs TEXT, once INTEGER NOT NULL DEFAULT 0,
    seen INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS m_ts ON messages(ts);
  CREATE TABLE IF NOT EXISTS snotes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, ts INTEGER NOT NULL
  );
`;

/** Columns added after the first release. Each is added only if it is missing. */
export const ADDED_COLUMNS: [string, string][] = [
  ['kind', "TEXT NOT NULL DEFAULT 'text'"],
  ['viewed', 'INTEGER NOT NULL DEFAULT 0'],
  ['pinned', 'INTEGER NOT NULL DEFAULT 0'],
  ['exp', 'INTEGER NOT NULL DEFAULT 0'],
  ['thumb', "TEXT NOT NULL DEFAULT ''"],
  ['w', 'INTEGER NOT NULL DEFAULT 0'],
  ['h', 'INTEGER NOT NULL DEFAULT 0'],
  ['img_key', "TEXT NOT NULL DEFAULT ''"],
  ['starred', 'INTEGER NOT NULL DEFAULT 0'],
];
