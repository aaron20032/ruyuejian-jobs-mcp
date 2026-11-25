import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createJobsHttpServer, type HttpServerOptions } from '../src/http.js';
import { makeGateway, makeJob } from './fixtures.js';

const cleanups: Array<() => Promise<void>> = [];

async function startServer(options: HttpServerOptions = {}) {
  const server = createJobsHttpServer({ host: '127.0.0.1', port: 0, ...options });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { server, base };
}

function initializeBody(id = 1) {
  return JSON.stringify({
    jsonrpc: '2.0', id, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw-test', version: '1.0.0' } },
  });
}

const postHeaders = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe('Streamable HTTP transport', () => {
  it('serves the same tool surface as stdio over a real MCP client', async () => {
    const gateway = makeGateway({ listJobs: vi.fn(async () => ({ jobs: [makeJob()], total: 1 })) });
    const { base } = await startServer({ gateway });
    const client = new Client({ name: 'http-eval', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`));
    cleanups.push(async () => { await client.close(); });
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name)).toEqual(['search_jobs', 'get_job_detail', 'list_companies', 'get_campus_timeline']);

    const result = await client.callTool({ name: 'search_jobs', arguments: { query: 'AI 产品经理', city: '北京', limit: 20, offset: 0 } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      contractVersion: '1.0.0', status: 'ok',
      data: { jobs: [{ source: { officialUrl: 'https://careers.example.com/jobs/123' } }] },
    });
  });

  it('answers healthz and rejects unknown paths', async () => {
    const { base } = await startServer({ gateway: makeGateway() });
    const health = await fetch(`${base}/healthz`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok', transport: 'streamable-http' });
    const missing = await fetch(`${base}/nope`);
    expect(missing.status).toBe(404);
  });

  it('requires a bearer token when one is configured', async () => {
    const { base } = await startServer({ gateway: makeGateway(), token: 'secret-token' });
    const anonymous = await fetch(`${base}/mcp`, { method: 'POST', headers: postHeaders, body: initializeBody() });
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('www-authenticate')).toBe('Bearer');

    const wrong = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...postHeaders, Authorization: 'Bearer nope' }, body: initializeBody() });
    expect(wrong.status).toBe(401);

    const authorized = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...postHeaders, Authorization: 'Bearer secret-token' }, body: initializeBody() });
    expect(authorized.status).not.toBe(401);
  });

  it('enforces a per-IP rate limit with Retry-After', async () => {
    const { base } = await startServer({ gateway: makeGateway(), rateLimitPerMinute: 2 });
    const first = await fetch(`${base}/mcp`, { method: 'POST', headers: postHeaders, body: initializeBody(1) });
    const second = await fetch(`${base}/mcp`, { method: 'POST', headers: postHeaders, body: initializeBody(2) });
    const third = await fetch(`${base}/mcp`, { method: 'POST', headers: postHeaders, body: initializeBody(3) });
    expect(first.status).not.toBe(429);
    expect(second.status).not.toBe(429);
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await third.json()).toMatchObject({ error: 'rate_limited' });
  });

  it('blocks obvious scraper User-Agents', async () => {
    const { base } = await startServer({ gateway: makeGateway() });
    const bot = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...postHeaders, 'User-Agent': 'Scrapy/2.11 (+https://scrapy.org)' }, body: initializeBody() });
    expect(bot.status).toBe(403);
  });
});