import { DatabaseSync } from 'node:sqlite';

export interface Device {
  slot: number;
  signPk: string;
}

export class Store {
  db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS devices (
        slot INTEGER PRIMARY KEY CHECK (slot IN (1,2)),
        sign_pk TEXT NOT NULL UNIQUE,
        created INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_slot INTEGER NOT NULL,
        blob TEXT NOT NULL,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS q_to ON queue(to_slot, id);
    `);
    const cols = (this.db.prepare('PRAGMA table_info(devices)').all() as unknown as { name: string }[]).map((c) => c.name);
    if (!cols.includes('push_token')) this.db.exec('ALTER TABLE devices ADD COLUMN push_token TEXT');
    if (!cols.includes('push_kind')) this.db.exec('ALTER TABLE devices ADD COLUMN push_kind TEXT');
  }

  devices(): Device[] {
    return this.db.prepare('SELECT slot, sign_pk AS signPk FROM devices ORDER BY slot').all() as unknown as Device[];
  }

  bySignPk(pk: string): Device | undefined {
    return this.devices().find((d) => d.signPk === pk);
  }

  registrationOpen(): boolean {
    return this.devices().length < 2;
  }

  /** Adds a device. Returns the slot, or null if registration is closed or the key already exists. */
  register(signPk: string): number | null {
    const list = this.devices();
    if (list.length >= 2) return null;
    if (list.some((d) => d.signPk === signPk)) return null;
    const slot = list.length === 0 ? 1 : 2;
    this.db.prepare('INSERT INTO devices (slot, sign_pk, created) VALUES (?,?,?)').run(slot, signPk, Date.now());
    return slot;
  }

  setPush(slot: number, token: string | null, kind: string | null) {
    this.db.prepare('UPDATE devices SET push_token = ?, push_kind = ? WHERE slot = ?').run(token, kind, slot);
  }

  getPush(slot: number): { token: string; kind: string } | null {
    const r = this.db.prepare('SELECT push_token AS token, push_kind AS kind FROM devices WHERE slot = ?').get(slot) as { token: string | null; kind: string | null } | undefined;
    return r?.token ? { token: r.token, kind: r.kind ?? 'calculator' } : null;
  }

  enqueue(toSlot: number, blob: string): number {
    const r = this.db.prepare('INSERT INTO queue (to_slot, blob, ts) VALUES (?,?,?)').run(toSlot, blob, Date.now());
    return Number(r.lastInsertRowid);
  }

  pending(toSlot: number): { id: number; blob: string; ts: number }[] {
    return this.db
      .prepare('SELECT id, blob, ts FROM queue WHERE to_slot = ? ORDER BY id LIMIT 500')
      .all(toSlot) as unknown as { id: number; blob: string; ts: number }[];
  }

  ack(toSlot: number, ids: number[]) {
    const del = this.db.prepare('DELETE FROM queue WHERE to_slot = ? AND id = ?');
    for (const id of ids) del.run(toSlot, id);
  }

  /** Messages nobody picked up for 30 days are dropped. */
  prune(maxAgeMs = 30 * 86400_000) {
    this.db.prepare('DELETE FROM queue WHERE ts < ?').run(Date.now() - maxAgeMs);
  }

  queueSize(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM queue').get() as { n: number }).n;
  }

  close() {
    this.db.close();
  }
}
