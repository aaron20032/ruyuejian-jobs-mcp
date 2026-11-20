import { describe, expect, it, vi } from 'vitest';
import { JobsApi } from '../src/api.js';
import { MAX_REQUESTS_PER_MINUTE } from '../src/contract.js';

describe('JobsApi', () => {
  it('maps model-friendly inputs to the public API without credentials', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { jobs: [], total: 0 } }), { status: 200 }));
    const api = new JobsApi('https://example.test/api', fetchMock);

    await api.listJobs({ jobTitle: '前端', location: '北京', companyName: '腾讯', recruitmentType: 'social', limit: 20, offset: 40 });

    const [url, options] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://example.test');
    expect(url.pathname).toBe('/api/jobs/list');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      job_title: '前端', location: '北京', company_name: '腾讯', recruitment_type: 'social', sort: 'latest', limit: '20', offset: '40',
    });
    expect(options.headers).toMatchObject({ Accept: 'application/json', 'User-Agent': 'ruyuejian-jobs-mcp/0.1.0' });
    expect(options.headers).not.toHaveProperty('Authorization');
  });

  it('returns null for a missing or delisted detail', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 }));
    const api = new JobsApi('https://example.test/api', fetchMock);
    await expect(api.getJobDetail('33333333-3333-4333-8333-333333333333')).resolves.toBeNull();
  });

  it('enforces the local request budget', async () => {
    let clock = 0;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { companies: [] } }), { status: 200 }));
    const api = new JobsApi('https://example.test/api', fetchMock, () => clock);
    for (let index = 0; index < MAX_REQUESTS_PER_MINUTE; index++) await api.listCompanies({});
    await expect(api.listCompanies({})).rejects.toMatchObject({ code: 'LOCAL_RATE_LIMITED', retryable: true });
    clock += 60_001;
    await expect(api.listCompanies({})).resolves.toEqual([]);
  });
});
