import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ServerContext } from '../context.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

type StaticContext = Pick<ServerContext, 'staticDir'>;

export function registerStaticRoutes(
  ctx: StaticContext,
  register: (
    method: string,
    path: string | RegExp,
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  ) => void,
): void {
  register('GET', '*', async (req, res) => {
    const reqAny = req as any;
    const pathname = reqAny.url ?? '/';
    let dir: string;
    try {
      dir = fs.realpathSync(path.resolve(ctx.staticDir!));
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const requestPath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''));
    const safe = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fp = path.resolve(dir, safe);
    let realFp: string;
    try {
      realFp = fs.realpathSync(fp);
    } catch {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    if (!realFp.startsWith(dir + path.sep) && realFp !== dir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(realFp)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const mimes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.woff2': 'font/woff2',
    };
    res.writeHead(200, { 'Content-Type': mimes[path.extname(realFp)] ?? 'application/octet-stream' });
    fs.createReadStream(realFp).pipe(res);
  });
}
