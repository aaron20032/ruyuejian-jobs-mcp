import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJobsMcpServer } from '../src/server.js';
import { makeGateway, makeJob } from './fixtures.js';

describe('MCP protocol integration', () => {
  let client: Client;
  let server: ReturnType<typeof createJobsMcpServer>;

  beforeEach(async () => {
    const gateway = makeGateway({ listJobs: vi.fn(async () => ({ jobs: [makeJob()], total: 1 })) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'eval-client', version: '1.0.0' });
    server = createJobsMcpServer(gateway);
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  it('advertises model-routing guidance and validated structured output', async () => {
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual(['search_jobs', 'get_job_detail', 'list_companies', 'get_campus_timeline']);
    const search = tools.tools[0];
    expect(search.description).toContain('never invent jobs or URLs');
    expect(search.inputSchema.properties).toHaveProperty('city');
    expect(search.outputSchema).toBeDefined();

    const result = await client.callTool({ name: 'search_jobs', arguments: { query: 'AI 产品经理', city: '北京', limit: 20, offset: 0 } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      contractVersion: '1.0.0', status: 'ok',
      data: { jobs: [{ source: { officialUrl: 'https://careers.example.com/jobs/123' } }] },
    });
  });

  it('rejects invalid model parameters before calling the upstream API', async () => {
    const result = await client.callTool({ name: 'search_jobs', arguments: { limit: 51 } });
    expect(result.isError).toBe(true);
  });
});
