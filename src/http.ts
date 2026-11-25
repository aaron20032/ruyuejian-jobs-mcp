#!/usr/bin/env node
/**
 * Streamable HTTP entry for ruyuejian-jobs-mcp (remote-first transport).
 *
 * The tool surface is identical to stdio: both transports attach to the same
 * createJobsMcpServer() factory, so the data contract, provenance rules and
 * anti-fabrication instructions never diverge between local and remote.
 *
 * Mode: stateless. Every POST gets a fresh McpServer + transport bound to a single
 * shared JobsApi gateway. Read-only tools carry no session state, so this scales
 * horizontally without sticky sessions. The shared gateway keeps api.ts's upstream
 * budget (30 req/min) meaningful across all clients of this process.
 *
 * Edge defenses (the local stdio bucket cannot isolate clients on a public endpoint):
 *   - per-IP sliding-window rate limit (server-side, enforced before any tool work)
 *   - optional bearer token (RUYUEJIAN_MCP_HTTP_TOKEN); unset = public read-only
 *   - narrow scraper User-Agent block, consistent with the project's crawler stance
 *
 * Deployment is a gated production step (see PUBLISHING.md). This file only serves;
 * it does not publish registry metadata or touch the production host.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { DEFAULT_API_BASE_URL, JobsApi, type JobsGateway } from './api.js';
import { createJobsMcpServer } from './server.js';
import { createRateLimiter } from './rateLimit.js';

export interface HttpServerOptions {
  /** Upstream gateway; defaults to a single shared JobsApi (keeps the upstream budget global). */
  gateway?: JobsGateway;
  host?: string;
  port?: number;
  /** MCP endpoint path. Default '/mcp'. */
  path?: string;
  /** Optional bearer token. When set, requests must send `Authorization: Bearer <token>`. */
  token?: string;
  /** Per-IP requests allowed per minute. Default 60. */
  rateLimitPerMinute?: number;
  /** Block obvious scraper User-Agents. Default true. */
  blockBots?: boolean;
  /** Trust X-Forwarded-For left-most segment for the client IP. Default false (socket address). */
  trustProxy?: boolean;
  /** Injectable clock for the edge limiter (tests). */
  now?: () => number;
  /** Startup/diagnostic logger. Defaults to console.error. */
  logger?: (line: string) => void;
}

const BOT_UA = /bot|spider|crawler|scrapy|playwright|headlesschrome|python-requests|ahrefs|semrush|bytespider|gptbot|claudebot|ccbot/i;

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    // EdgeOne follows origin Cache-Control; health/error JSON must not be cached at the edge.
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(payload);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = raw?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/**
 * Build (but do not listen on) the HTTP server. Exported so tests can inject a mock
 * gateway and tight limits, and so an operator can embed it behind their own proxy.
 */
export function createJobsHttpServer(options: HttpServerOptions = {}): Server {
  const gateway = options.gateway ?? new JobsApi();
  const path = options.path ?? '/mcp';
  const token = options.token;
  const blockBots = options.blockBots ?? true;
  const trustProxy = options.trustProxy ?? false;
  const limiter = createRateLimiter({
    limit: options.rateLimitPerMinute ?? 60,
    windowMs: 60_000,
    now: options.now,
  });

  return createServer((req, res) => {
    void handle(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
      else res.end();
      options.logger?.(`http handler error: ${error instanceof Error ? error.message : String(error)}`);
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://localhost');

    // CORS for browser-based MCP clients. Public read-only data, no credentials.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url.pathname === '/healthz') {
      sendJson(res, 200, { status: 'ok', transport: 'streamable-http' });
      return;
    }

    if (url.pathname !== path) {
      sendJson(res, 404, { error: 'not_found', message: `MCP endpoint is ${path}` });
      return;
    }

    const ua = req.headers['user-agent'] ?? '';
    if (blockBots && BOT_UA.test(ua)) {
      sendJson(res, 403, { error: 'forbidden', message: 'Automated scraping clients are not permitted on this endpoint.' });
      return;
    }

    if (token) {
      const header = req.headers.authorization ?? '';
      const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!presented || !safeEqual(presented, token)) {
        sendJson(res, 401, { error: 'unauthorized', message: 'A valid bearer token is required.' }, { 'WWW-Authenticate': 'Bearer' });
        return;
      }
    }

    const ip = clientIp(req, trustProxy);
    const verdict = limiter.check(ip);
    if (!verdict.allowed) {
      const retryAfterSeconds = Math.ceil(verdict.retryAfterMs / 1000);
      sendJson(res, 429, { error: 'rate_limited', message: 'Per-IP request budget exhausted; retry later.' }, { 'Retry-After': String(retryAfterSeconds) });
      return;
    }

    // Stateless: a fresh server + transport per request, sharing the upstream gateway.
    const mcp = createJobsMcpServer(gateway);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void mcp.close();
    });
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  }
}

/** Read configuration from the environment and start listening. Used by the bin entry. */
export function startFromEnv(env: NodeJS.ProcessEnv = process.env): Server {
  const logger = (line: string) => console.error(line);
  const port = Number(env.RUYUEJIAN_MCP_HTTP_PORT ?? env.PORT ?? 8080);
  const host = env.RUYUEJIAN_MCP_HTTP_HOST ?? '127.0.0.1';
  const path = env.RUYUEJIAN_MCP_HTTP_PATH ?? '/mcp';
  const rateLimitPerMinute = Number(env.RUYUEJIAN_MCP_HTTP_RATE_LIMIT ?? 60);
  const server = createJobsHttpServer({
    host,
    port,
    path,
    token: env.RUYUEJIAN_MCP_HTTP_TOKEN || undefined,
    rateLimitPerMinute: Number.isFinite(rateLimitPerMinute) && rateLimitPerMinute > 0 ? rateLimitPerMinute : 60,
    blockBots: env.RUYUEJIAN_MCP_BLOCK_BOTS !== '0',
    trustProxy: env.RUYUEJIAN_MCP_TRUST_PROXY === '1',
    logger,
  });
  server.listen(port, host, () => {
    logger(JSON.stringify({
      event: 'mcp_http_listening',
      host,
      port,
      path,
      auth: env.RUYUEJIAN_MCP_HTTP_TOKEN ? 'bearer' : 'public',
      rateLimitPerMinute,
      upstream: env.RUYUEJIAN_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    }));
  });
  return server;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  startFromEnv();
}