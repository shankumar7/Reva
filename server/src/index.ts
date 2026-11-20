import fs from 'node:fs';
import { createServer } from './server.js';

const token = process.env.SETUP_TOKEN ?? '';
if (token.length < 16) {
  console.error('SETUP_TOKEN missing or too short (need 16+ characters). Refusing to start.');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR ?? '/data';
fs.mkdirSync(dataDir, { recursive: true });

const srv = await createServer({
  dbPath: `${dataDir}/chat.db`,
  setupToken: token,
  port: Number(process.env.PORT ?? 8080),
  updatesDir: `${dataDir}/updates`,
});
// Only start-up information is logged. Never message data.
console.log(`server listening on :${srv.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await srv.close();
    process.exit(0);
  });
}
