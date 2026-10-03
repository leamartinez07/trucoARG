import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import handler from './api.ts';
const root = resolve('dist');
const server = createServer(async (req, res) => {
  if (req.url?.split('?')[0] === '/api/game') {
    await handler(req, res);
    return;
  }
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    let path = resolve(root, '.' + pathname);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    let body: Buffer;
    try {
      body = await readFile(path);
    } catch {
      if (extname(path)) {
        res.writeHead(404);
        res.end();
        return;
      }
      path = resolve(root, 'index.html');
      body = await readFile(path);
    }
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.woff2': 'font/woff2',
      '.png': 'image/png',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
    };
    res.writeHead(200, {
      'Content-Type': types[extname(path)] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Ejecutá pnpm build para servir la aplicación.');
  }
});
const port = Number(process.env.PORT ?? 3001);
server.listen(port, '0.0.0.0', () => console.log(`Truco · servidor http://localhost:${port}`));
