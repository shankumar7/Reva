import fs from 'node:fs';
import { createServer } from './server.js';
import { Fcm } from './fcm.js';

const token = process.env.SETUP_TOKEN ?? '';
if (token.length < 16) {
  console.error('SETUP_TOKEN missing or too short (need 16+ characters). Refusing to start.');
  process.exit(1);
}

const dataDir = process.env.DATA_DIR ?? '/data';
fs.mkdirSync(dataDir, { recursive: true });

let fcm: Fcm | null = null;
const fcmFile = process.env.FCM_SERVICE_ACCOUNT_FILE ?? '/secrets/fcm.json';
if (fs.existsSync(fcmFile)) {
  try {
    fcm = new Fcm(fcmFile);
    console.log('push notifications: on');
  } catch (e) {
    console.error('push notifications: off,', (e as Error).message);
  }
} else {
  console.log('push notifications: off (no service account file)');
}

const srv = await createServer({
  fcm,
  dbPath: `${dataDir}/chat.db`,
  setupToken: token,
  port: Number(process.env.PORT ?? 8080),
  updatesDir: `${dataDir}/updates`,
  backupDir: `${dataDir}/backups`,
  backupKey: process.env.BACKUP_KEY,
  turnHost: process.env.TURN_HOST,
  turnSecret: process.env.TURN_SECRET,
});
// Only start-up information is logged. Never message data.
console.log(`server listening on :${srv.port}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await srv.close();
    process.exit(0);
  });
}
