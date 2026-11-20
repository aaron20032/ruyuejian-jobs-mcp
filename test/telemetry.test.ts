import { describe, expect, it, vi } from 'vitest';
import { emitToolTelemetry } from '../src/telemetry.js';
import { searchJobs } from '../src/tools.js';
import { makeGateway, makeJob, now } from './fixtures.js';

describe('tool telemetry', () => {
  it('is opt-in', async () => {
    const write = vi.fn();
    const result = await searchJobs({ limit: 20, offset: 0 }, makeGateway(), now);
    emitToolTelemetry('search_jobs', result, 12, {}, write);
    expect(write).not.toHaveBeenCalled();
  });

  it('records outcome and coverage without query text, job IDs or URLs', async () => {
    const write = vi.fn();
    const gateway = makeGateway({ listJobs: vi.fn(async () => ({ jobs: [makeJob()], total: 1 })) });
    const result = await searchJobs({ query: '保密关键词', city: '北京', postedWithinDays: 3, limit: 20, offset: 0 }, gateway, now);

    emitToolTelemetry('search_jobs', result, 12.4, { RUYUEJIAN_MCP_TELEMETRY: '1' }, write);

    const event = JSON.parse(write.mock.calls[0][0]);
    expect(event).toMatchObject({ event: 'mcp_tool_call', tool: 'search_jobs', status: 'ok', returned: 1, upstreamTotal: 1, scanned: 1, dateCoverage: 'complete', durationMs: 12 });
    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain('保密关键词');
    expect(serialized).not.toContain(makeJob().id);
    expect(serialized).not.toContain('careers.example.com');
  });
});
