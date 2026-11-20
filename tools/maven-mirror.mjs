// Local retrying Maven mirror for sandboxes where Maven Central answers 429/404 at random.
// Usage: node maven-mirror.mjs [port] [cacheDir]      (set NODE_USE_ENV_PROXY=1 when behind a proxy)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] || 8899);
const CACHE = process.argv[3] || path.join(process.env.TMPDIR || '/tmp', 'maven-mirror-cache');
fs.mkdirSync(CACHE, { recursive: true });

const UP = {
  central: 'https://repo.maven.apache.org/maven2/',
  google: 'https://dl.google.com/dl/android/maven2/',
  plugins: 'https://plugins.gradle.org/m2/',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRetry(url, method) {
  let last = 0;
  for (let i = 0; i < 9; i++) {
    try {
      const r = await fetch(url, { method, redirect: 'follow' });
      last = r.status;
      if (r.status === 200) return r;
      if (r.status === 404 && i >= 2) return r; // a real miss, give up after a few tries
      if (r.status !== 404 && r.status !== 429 && r.status < 500) return r;
    } catch {
      last = 0;
    }
    await sleep(Math.min(8000, 400 * 2 ** i));
  }
  return { status: last || 502, body: null, headers: new Headers() };
}

http
  .createServer(async (req, res) => {
    try {
      const [, repo, ...rest] = (req.url || '').split('?')[0].split('/');
      const base = UP[repo];
      if (!base || !rest.length) { res.writeHead(404); return res.end(); }
      const rel = rest.join('/');
      const file = path.join(CACHE, repo, rel);
      if (!file.startsWith(CACHE)) { res.writeHead(400); return res.end(); }
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        res.writeHead(200, { 'Content-Length': fs.statSync(file).size });
        return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
      }
      const r = await fetchRetry(base + rel, 'GET');
      if (r.status !== 200) { res.writeHead(r.status); return res.end(); }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.part', buf);
      fs.renameSync(file + '.part', file);
      res.writeHead(200, { 'Content-Length': buf.length });
      res.end(req.method === 'HEAD' ? undefined : buf);
    } catch {
      res.writeHead(502); res.end();
    }
  })
  .listen(PORT, '127.0.0.1', () => console.log('mirror on', PORT));
