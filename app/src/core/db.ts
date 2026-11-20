// The chat database. It is encrypted on the phone (SQLCipher) with a key kept in the secure store.
import * as SQLite from 'expo-sqlite';
import { Vault } from './storage';

export type MsgState = 0 | 1 | 2 | 3; // queued, sent, delivered, read
export interface Msg {
  id: string;
  ts: number;
  mine: boolean;
  text: string;
  replyTo: string | null;
  state: MsgState;
  edited: boolean;
  deleted: boolean;
  rMine: string | null;
  rTheirs: string | null;
  once: boolean;
  seen: boolean; // for me: have I read it
}

interface Row {
  id: string; ts: number; mine: number; text: string; reply_to: string | null; state: number;
  edited: number; deleted: number; r_mine: string | null; r_theirs: string | null; once: number; seen: number;
}
const fromRow = (r: Row): Msg => ({
  id: r.id, ts: r.ts, mine: !!r.mine, text: r.text, replyTo: r.reply_to, state: r.state as MsgState,
  edited: !!r.edited, deleted: !!r.deleted, rMine: r.r_mine, rTheirs: r.r_theirs, once: !!r.once, seen: !!r.seen,
});

const NAME = 'chat-v1.db';
let db: SQLite.SQLiteDatabase | null = null;

export async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const key = await Vault.dbKey();
  const d = await SQLite.openDatabaseAsync(NAME);
  await d.execAsync(`PRAGMA key = "x'${key}'";`);
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, mine INTEGER NOT NULL, text TEXT NOT NULL,
      reply_to TEXT, state INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0,
      deleted INTEGER NOT NULL DEFAULT 0, r_mine TEXT, r_theirs TEXT, once INTEGER NOT NULL DEFAULT 0,
      seen INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS m_ts ON messages(ts);
  `);
  db = d;
  return d;
}

export async function closeDb() {
  await db?.closeAsync().catch(() => {});
  db = null;
}

export async function wipeDb() {
  await closeDb();
  await SQLite.deleteDatabaseAsync(NAME).catch(() => {});
}

export const Messages = {
  async all(): Promise<Msg[]> {
    const d = await openDb();
    return (await d.getAllAsync<Row>('SELECT * FROM messages ORDER BY ts ASC, rowid ASC')).map(fromRow);
  },
  async get(id: string): Promise<Msg | null> {
    const d = await openDb();
    const r = await d.getFirstAsync<Row>('SELECT * FROM messages WHERE id = ?', id);
    return r ? fromRow(r) : null;
  },
  async insert(m: Msg) {
    const d = await openDb();
    await d.runAsync(
      'INSERT OR IGNORE INTO messages (id,ts,mine,text,reply_to,state,edited,deleted,r_mine,r_theirs,once,seen) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      m.id, m.ts, m.mine ? 1 : 0, m.text, m.replyTo, m.state, m.edited ? 1 : 0, m.deleted ? 1 : 0, m.rMine, m.rTheirs, m.once ? 1 : 0, m.seen ? 1 : 0,
    );
  },
  async setState(id: string, state: MsgState) {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET state = ? WHERE id = ? AND state < ?', state, id, state);
  },
  async edit(id: string, text: string) {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET text = ?, edited = 1 WHERE id = ? AND deleted = 0', text, id);
  },
  async remove(id: string) {
    const d = await openDb();
    await d.runAsync("UPDATE messages SET deleted = 1, text = '' WHERE id = ?", id);
  },
  async react(id: string, who: 'mine' | 'theirs', emoji: string | null) {
    const d = await openDb();
    await d.runAsync(`UPDATE messages SET ${who === 'mine' ? 'r_mine' : 'r_theirs'} = ? WHERE id = ?`, emoji, id);
  },
  async markSeen() {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET seen = 1 WHERE mine = 0 AND seen = 0');
  },
  async unseenIds(): Promise<string[]> {
    const d = await openDb();
    return (await d.getAllAsync<{ id: string }>('SELECT id FROM messages WHERE mine = 0 AND seen = 0')).map((r) => r.id);
  },
  async search(q: string): Promise<Msg[]> {
    const d = await openDb();
    const like = '%' + q.replace(/[%_\\]/g, (c) => '\\' + c) + '%';
    return (await d.getAllAsync<Row>("SELECT * FROM messages WHERE deleted = 0 AND text LIKE ? ESCAPE '\\' ORDER BY ts DESC LIMIT 100", like)).map(fromRow);
  },
};
