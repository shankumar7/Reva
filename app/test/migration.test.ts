import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ADDED_COLUMNS, BASE_SQL } from '../src/core/schema';

test('an update keeps every old message and fills the new columns with safe defaults', () => {
  const d = new DatabaseSync(':memory:');
  // the database exactly as the very first release made it
  d.exec(`CREATE TABLE messages (
    id TEXT PRIMARY KEY, ts INTEGER NOT NULL, mine INTEGER NOT NULL, text TEXT NOT NULL,
    reply_to TEXT, state INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0, r_mine TEXT, r_theirs TEXT, once INTEGER NOT NULL DEFAULT 0,
    seen INTEGER NOT NULL DEFAULT 0)`);
  d.prepare("INSERT INTO messages (id,ts,mine,text,state,r_theirs) VALUES ('a',100,1,'hello love',3,'❤️')").run();
  d.prepare("INSERT INTO messages (id,ts,mine,text) VALUES ('b',200,0,'good morning')").run();

  // what the app does on every start (twice, to prove it is safe to repeat)
  for (let run = 0; run < 2; run++) {
    d.exec(BASE_SQL);
    const cols = (d.prepare('PRAGMA table_info(messages)').all() as { name: string }[]).map((c) => c.name);
    for (const [name, ddl] of ADDED_COLUMNS) if (!cols.includes(name)) d.exec(`ALTER TABLE messages ADD COLUMN ${name} ${ddl}`);
  }

  const rows = d.prepare('SELECT * FROM messages ORDER BY ts').all() as any[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].text, 'hello love');
  assert.equal(rows[0].r_theirs, '❤️');
  assert.equal(rows[1].text, 'good morning');
  assert.equal(rows[0].kind, 'text');
  assert.equal(rows[0].starred, 0);
  assert.equal(rows[0].pinned, 0);
  assert.equal(rows[0].exp, 0);
});
