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
    const dir = path.resolve(ctx.staticDir!);
    const requestPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const safe = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fp = path.resolve(dir, safe);
    if (!fp.startsWith(dir + path.sep) && fp !== dir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(fp)) {
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
    res.writeHead(200, { 'Content-Type': mimes[path.extname(fp)] ?? 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  });
}
