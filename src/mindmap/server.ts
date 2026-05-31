// MindMap Backend Server — HTTP + SSE with proper error handling
import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CartographerAgent } from '../agents/cartographer.ts';
import type { MindMapNode, CartographerInput } from '../agents/cartographer.ts';
import type { LLMRouter } from '../llm/router.ts';
import { logger } from '../utils/logger.ts';

export interface MindMapSession {
  id: string;
  researchTopic: string;
  keywords: string[];
  targetJournal?: string;
  nodes: MindMapNode[];
  currentRound: number;
  status: 'active' | 'completed' | 'exported';
  createdAt: Date;
}

export interface MindMapServerOptions {
  port: number;
  router?: LLMRouter;
  staticDir?: string;
}

export class MindMapServer {
  private server: http.Server | null = null;
  private sessions: Map<string, MindMapSession> = new Map();
  private cartographer: CartographerAgent;
  private sseClients: Map<string, http.ServerResponse[]> = new Map();
  private options: MindMapServerOptions;

  constructor(options: MindMapServerOptions) {
    this.options = options;
    this.cartographer = new CartographerAgent(options.router);
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res).catch((err) => {
          logger.error('[MindMap] Unhandled error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });
      });
      this.server.listen(this.options.port, () => {
        logger.info(`MindMap server running on http://localhost:${this.options.port}`);
        resolve();
      });
    });
  }

  stop(): void {
    this.server?.close();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://localhost:${this.options.port}`);
    const method = req.method ?? 'GET';

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Route
    try {
      const p = url.pathname;
      if (p === '/api/mindmap/create' && method === 'POST') return await this.handleCreate(req, res);
      if (p === '/api/mindmap/diverge' && method === 'POST') return await this.handleDiverge(req, res);
      if (p === '/api/mindmap/check' && method === 'POST') return await this.handleCheck(req, res);
      if (p === '/api/mindmap/export' && method === 'POST') return await this.handleExport(req, res);
      if (p.startsWith('/api/mindmap/sse/')) return this.handleSSE(req, res, p.split('/').pop()!);
      if (p === '/api/mindmap/sessions' && method === 'GET') return this.handleListSessions(res);

      if (this.options.staticDir && method === 'GET') return this.handleStatic(res, p);

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err: any) {
      const msg = err.message?.includes('JSON') ? 'Invalid JSON body' : err.message;
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: msg }));
    }
  }

  private async handleCreate(req: any, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const parsed = JSON.parse(body);
    const { researchTopic, keywords, targetJournal } = parsed;
    if (!researchTopic || typeof researchTopic !== 'string') {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'researchTopic is required' }));
      return;
    }

    const session: MindMapSession = {
      id: `mm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      researchTopic,
      keywords: Array.isArray(keywords) ? keywords : [],
      targetJournal,
      nodes: [],
      currentRound: 0,
      status: 'active',
      createdAt: new Date(),
    };
    this.sessions.set(session.id, session);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessionId: session.id, session }));
  }

  private async handleDiverge(req: any, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { sessionId, round, selectedNodeIds } = JSON.parse(body);
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    const effectiveRound = Math.min(3, Math.max(1, round ?? session.currentRound + 1));

    const input: CartographerInput = {
      researchTopic: session.researchTopic,
      keywords: session.keywords,
      targetJournal: session.targetJournal,
      existingNodes: session.nodes,
      selectedNodeIds: Array.isArray(selectedNodeIds) ? selectedNodeIds : [],
      currentRound: effectiveRound,
    };

    this.sendSSE(sessionId, { type: 'diverge_start', round: effectiveRound });

    const output = await this.cartographer.execute(input, { mock: !this.options.router });
    session.nodes.push(...output.nodes);
    session.currentRound = output.round;

    for (const node of output.nodes) {
      this.sendSSE(sessionId, { type: 'node', node });
      await new Promise((r) => setTimeout(r, 60));
    }
    this.sendSSE(sessionId, { type: 'diverge_complete', round: output.round, summary: output.summary });

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        nodes: output.nodes,
        round: output.round,
        summary: output.summary,
        totalNodes: session.nodes.length,
      }),
    );
  }

  private async handleCheck(req: any, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { sessionId, nodeId, checked } = JSON.parse(body);
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    const node = session.nodes.find((n) => n.id === nodeId);
    if (node) node.checked = !!checked;

    this.sendSSE(sessionId, { type: 'check', nodeId, checked: !!checked });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }

  private async handleExport(req: any, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const { sessionId } = JSON.parse(body);
    const session = this.sessions.get(sessionId);
    if (!session) {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Session not found' }));
      return;
    }

    const selectedNodes = session.nodes.filter((n) => n.checked);
    const gaps = session.nodes
      .filter((n) => n.round === 3 && n.label.startsWith('[Gap]'))
      .map((n) => n.label.replace(/^\[Gap\]\s*/, ''));
    const noveltyCandidates = session.nodes
      .filter((n) => n.round === 3 && n.label.startsWith('[Novelty]'))
      .map((n) => n.label.replace(/^\[Novelty\]\s*/, ''));

    const confirmedFocus = {
      researchTopic: session.researchTopic,
      selectedBranches: selectedNodes.filter((n) => n.round === 1).map((n) => n.label),
      confirmedNodes: selectedNodes.map((n) => ({ id: n.id, label: n.label, depth: n.round })),
      contributionGaps: gaps,
      noveltyCandidates,
    };

    session.status = 'exported';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(confirmedFocus));
  }

  private handleSSE(req: any, res: http.ServerResponse, sessionId: string): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write('data: {"type":"connected"}\n\n');

    const clients = this.sseClients.get(sessionId) ?? [];
    clients.push(res);
    this.sseClients.set(sessionId, clients);

    req.on('close', () => {
      const arr = this.sseClients.get(sessionId) ?? [];
      this.sseClients.set(
        sessionId,
        arr.filter((c) => c !== res),
      );
    });
  }

  private handleListSessions(res: http.ServerResponse): void {
    const sessions = Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      researchTopic: s.researchTopic,
      currentRound: s.currentRound,
      nodeCount: s.nodes.length,
      status: s.status,
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(sessions));
  }

  private handleStatic(res: http.ServerResponse, pathname: string): void {
    const staticDir = path.resolve(this.options.staticDir!);
    const requestPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const safePath = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.resolve(staticDir, safePath);

    // Prevent path traversal
    if (!filePath.startsWith(staticDir + path.sep) && filePath !== staticDir) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath);
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  }

  private sendSSE(sessionId: string, data: any): void {
    const clients = this.sseClients.get(sessionId) ?? [];
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      try {
        client.write(msg);
      } catch {
        /* client disconnected */
      }
    }
  }

  private readBody(req: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const MAX = 1024 * 1024; // 1MB limit
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX) {
          reject(new Error('Request body too large'));
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString()));
      req.on('error', reject);
    });
  }
}
