// Static server for the end-to-end tests: /panel/* comes from dist/ (the built panel), everything else from test/e2e/
// (the made-up house in harness.html). Started by Playwright as its web server; PORT picks the port (default 4173).
import http from 'node:http';
import {createReadStream, existsSync, statSync} from 'node:fs';
import {dirname, extname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', '..', 'dist');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
};

export function createServer() {
  return http.createServer((req, res) => {
    const u = decodeURIComponent((req.url || '/').split('?')[0]);
    const f = u.startsWith('/panel/')
      ? resolve(DIST, '.' + u.slice(6))
      : resolve(HERE, '.' + (u === '/' ? '/harness.html' : u));
    const inside = f.startsWith(DIST + '/') || f.startsWith(HERE + '/');
    if (!inside || !existsSync(f) || !statSync(f).isFile()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store'});
    createReadStream(f).pipe(res);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.env.PORT || 4173);
  createServer().listen(port, () => console.log(`test house on http://localhost:${port}/ (panel from ${DIST})`));
}
