// The chat database. It is encrypted on the phone (SQLCipher) with a key kept in the secure store.
import * as SQLite from 'expo-sqlite';
import { Vault } from './storage';
import { ADDED_COLUMNS, BASE_SQL } from './schema';

export type MsgState = 0 | 1 | 2 | 3; // queued, sent, delivered, read
export interface Msg {
  id: string;
  ts: number;
  mine: boolean;
  kind: 'text' | 'img' | 'aud' | 'stk'; // voice note: `w` is the length in seconds. Sticker: `text` is the sticker id
  text: string;
  replyTo: string | null;
  state: MsgState;
  edited: boolean;
  deleted: boolean;
  rMine: string | null;
  rTheirs: string | null;
  once: boolean; // view-once picture
  viewed: boolean; // a view-once picture has been opened (by me, or by them if it is mine)
  seen: boolean; // for me: have I read it
  pinned: boolean;
  exp: number; // when it disappears (ms), 0 = never
  thumb: string; // small picture, base64 jpeg
  w: number;
  h: number;
  imgKey: string; // key for the encrypted picture file
  starred: boolean; // only on this phone
}

export interface SharedNote { id: string; title: string; body: string; ts: number }

interface Row {
  id: string; ts: number; mine: number; kind: string; text: string; reply_to: string | null; state: number;
  edited: number; deleted: number; r_mine: string | null; r_theirs: string | null; once: number; viewed: number; seen: number;
  pinned: number; exp: number; thumb: string; w: number; h: number; img_key: string; starred: number;
}
const fromRow = (r: Row): Msg => ({
  id: r.id, ts: r.ts, mine: !!r.mine, kind: r.kind === 'img' ? 'img' : r.kind === 'aud' ? 'aud' : r.kind === 'stk' ? 'stk' : 'text', text: r.text, replyTo: r.reply_to,
  state: r.state as MsgState, edited: !!r.edited, deleted: !!r.deleted, rMine: r.r_mine, rTheirs: r.r_theirs,
  once: !!r.once, viewed: !!r.viewed, seen: !!r.seen, pinned: !!r.pinned, exp: r.exp ?? 0,
  thumb: r.thumb ?? '', w: r.w ?? 0, h: r.h ?? 0, imgKey: r.img_key ?? '', starred: !!r.starred,
});

const NAME = 'chat-v1.db';
let db: SQLite.SQLiteDatabase | null = null;

export async function openDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  const key = await Vault.dbKey();
  const d = await SQLite.openDatabaseAsync(NAME);
  await d.execAsync(`PRAGMA key = "x'${key}'";`);
  await d.execAsync(BASE_SQL);
  // upgrade older databases in place
  const cols = (await d.getAllAsync<{ name: string }>('PRAGMA table_info(messages)')).map((c) => c.name);
  for (const [name, ddl] of ADDED_COLUMNS) {
    if (!cols.includes(name)) await d.execAsync(`ALTER TABLE messages ADD COLUMN ${name} ${ddl}`);
  }
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
  async insert(m: Partial<Msg> & Pick<Msg, 'id' | 'ts' | 'mine'>) {
    const d = await openDb();
    await d.runAsync(
      `INSERT OR IGNORE INTO messages (id,ts,mine,kind,text,reply_to,state,edited,deleted,r_mine,r_theirs,once,viewed,seen,pinned,exp,thumb,w,h,img_key,starred)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      m.id, m.ts, m.mine ? 1 : 0, m.kind ?? 'text', m.text ?? '', m.replyTo ?? null, m.state ?? 0, m.edited ? 1 : 0, m.deleted ? 1 : 0,
      m.rMine ?? null, m.rTheirs ?? null, m.once ? 1 : 0, m.viewed ? 1 : 0, m.seen ? 1 : 0, m.pinned ? 1 : 0, m.exp ?? 0,
      m.thumb ?? '', m.w ?? 0, m.h ?? 0, m.imgKey ?? '', m.starred ? 1 : 0,
    );
  },
  async setState(id: string, state: MsgState) {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET state = ? WHERE id = ? AND state < ?', state, id, state);
  },
  async edit(id: string, text: string) {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET text = ?, edited = 1 WHERE id = ? AND deleted = 0 AND kind = ?', text, id, 'text');
  },
  async remove(id: string) {
    const d = await openDb();
    await d.runAsync("UPDATE messages SET deleted = 1, text = '', thumb = '', img_key = '', pinned = 0 WHERE id = ?", id);
  },
  async react(id: string, who: 'mine' | 'theirs', emoji: string | null) {
    const d = await openDb();
    await d.runAsync(`UPDATE messages SET ${who === 'mine' ? 'r_mine' : 'r_theirs'} = ? WHERE id = ?`, emoji, id);
  },
  async star(id: string, on: boolean) {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET starred = ? WHERE id = ?', on ? 1 : 0, id);
  },
  async exists(id: string): Promise<boolean> {
    const d = await openDb();
    return !!(await d.getFirstAsync('SELECT 1 FROM messages WHERE id = ?', id));
  },
  async pin(id: string, on: boolean) {
    const d = await openDb();
    await d.runAsync('UPDATE messages SET pinned = ? WHERE id = ? AND deleted = 0', on ? 1 : 0, id);
  },
  /** A view-once picture was opened: forget the picture, keep a note that it was opened. */
  async markViewed(id: string) {
    const d = await openDb();
    await d.runAsync("UPDATE messages SET viewed = 1, thumb = '', img_key = '' WHERE id = ?", id);
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
    return (await d.getAllAsync<Row>("SELECT * FROM messages WHERE deleted = 0 AND kind = 'text' AND text LIKE ? ESCAPE '\\' ORDER BY ts DESC LIMIT 100", like)).map(fromRow);
  },
  /** Removes messages whose time is up. Returns the ids of pictures whose files must be deleted too. */
  async purgeExpired(now: number): Promise<string[]> {
    const d = await openDb();
    const rows = await d.getAllAsync<{ id: string; kind: string }>('SELECT id, kind FROM messages WHERE exp > 0 AND exp <= ?', now);
    if (rows.length) await d.runAsync('DELETE FROM messages WHERE exp > 0 AND exp <= ?', now);
    return rows.filter((r) => r.kind === 'img' || r.kind === 'aud').map((r) => r.id);
  },
};

export const SharedNotes = {
  async all(): Promise<SharedNote[]> {
    const d = await openDb();
    return d.getAllAsync<SharedNote>('SELECT id, title, body, ts FROM snotes ORDER BY ts DESC');
  },
  /** Last write wins. Returns true if it changed anything. */
  async put(n: SharedNote): Promise<boolean> {
    const d = await openDb();
    const old = await d.getFirstAsync<{ ts: number }>('SELECT ts FROM snotes WHERE id = ?', n.id);
    if (old && old.ts >= n.ts) return false;
    await d.runAsync('INSERT OR REPLACE INTO snotes (id,title,body,ts) VALUES (?,?,?,?)', n.id, n.title, n.body, n.ts);
    return true;
  },
  async remove(id: string) {
    const d = await openDb();
    await d.runAsync('DELETE FROM snotes WHERE id = ?', id);
  },
};

/** Photo albums: which photos belong to which named album. Shared with your partner. */
export const Albums = {
  async all(): Promise<{ name: string; ids: string[] }[]> {
    const d = await openDb();
    const rows = await d.getAllAsync<{ name: string; msg_id: string }>('SELECT name, msg_id FROM albums ORDER BY name COLLATE NOCASE');
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.name, [...(map.get(r.name) ?? []), r.msg_id]);
    return [...map.entries()].map(([name, ids]) => ({ name, ids }));
  },
  async add(msgId: string, name: string) {
    const d = await openDb();
    await d.runAsync('INSERT OR IGNORE INTO albums (msg_id, name) VALUES (?,?)', msgId, name);
  },
  async remove(msgId: string, name: string) {
    const d = await openDb();
    await d.runAsync('DELETE FROM albums WHERE msg_id = ? AND name = ?', msgId, name);
  },
};
