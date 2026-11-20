import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createJobsMcpServer } from '../dist/server.js';

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: 'ruyuejian-live-eval', version: '1.0.0' });
const server = createJobsMcpServer();

try {
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  const search = await client.callTool({ name: 'search_jobs', arguments: { limit: 2, offset: 0 } });
  const searchData = search.structuredContent?.data;
  assert.equal(search.structuredContent?.status, 'ok');
  assert.ok(searchData.jobs.length > 0);
  for (const job of searchData.jobs) {
    assert.ok(job.id && job.title && job.company);
    assert.ok(job.source && Object.hasOwn(job.source, 'officialUrl'));
  }

  const detail = await client.callTool({ name: 'get_job_detail', arguments: { id: searchData.jobs[0].id } });
  assert.equal(detail.structuredContent?.status, 'ok');
  assert.equal(detail.structuredContent?.data.job.id, searchData.jobs[0].id);

  const companies = await client.callTool({ name: 'list_companies', arguments: { limit: 2 } });
  assert.equal(companies.structuredContent?.status, 'ok');
  assert.ok(companies.structuredContent.data.companies.length > 0);

  const recent = await client.callTool({ name: 'search_jobs', arguments: { postedWithinDays: 3, limit: 2, offset: 0 } });
  assert.ok(['ok', 'no_results'].includes(recent.structuredContent?.status));
  assert.ok(['complete', 'partial'].includes(recent.structuredContent?.data.dateFilter.coverage));

  const campus = await client.callTool({ name: 'get_campus_timeline', arguments: {} });
  assert.ok(['ok', 'no_results'].includes(campus.structuredContent?.status));
  assert.ok(Array.isArray(campus.structuredContent?.data.timeline));

  console.log(JSON.stringify({
    result: 'passed',
    search: search.structuredContent.status,
    detail: detail.structuredContent.status,
    companies: companies.structuredContent.status,
    recentCoverage: recent.structuredContent.data.dateFilter.coverage,
    campus: campus.structuredContent.status,
  }));
} finally {
  await client.close();
  await server.close();
}
