import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../src/api.js';
import { CONTRACT_VERSION } from '../src/contract.js';
import { executeTool, getCampusTimeline, getJobDetail, listCompanies, searchJobs } from '../src/tools.js';
import { makeGateway, makeJob, NOW, now } from './fixtures.js';

const baseInput = { limit: 20, offset: 0 };

describe('agentic job-data eval', () => {
  it('returns only recent jobs with official timestamps and a citable URL', async () => {
    const recent = makeJob();
    const old = makeJob({
      id: '22222222-2222-4222-8222-222222222222',
      title: '旧岗位',
      source_url: 'https://careers.example.com/jobs/old',
      posted_at: '2026-11-01T04:00:00.000Z',
      source_posted_at: '2026-11-01T04:00:00.000Z',
    });
    const gateway = makeGateway({ listJobs: vi.fn(async () => ({ jobs: [recent, old], total: 2 })) });

    const result = await searchJobs({ ...baseInput, query: 'AI 产品经理', city: '北京', postedWithinDays: 3 }, gateway, now);

    expect(result.contractVersion).toBe(CONTRACT_VERSION);
    expect(result.status).toBe('ok');
    expect(result.data?.jobs).toHaveLength(1);
    expect(result.data?.jobs[0].source.officialUrl).toBe('https://careers.example.com/jobs/123');
    expect(result.data?.jobs[0].source.publishedAt).toBe('2026-11-19T02:00:00.000Z');
    expect(result.data?.dateFilter?.coverage).toBe('complete');
    expect(gateway.listJobs).toHaveBeenCalledWith(expect.objectContaining({
      jobTitle: 'AI 产品经理', location: '北京', limit: 100, offset: 0,
    }));
  });

  it('marks a truncated recent-jobs scan as partial instead of claiming exhaustive coverage', async () => {
    const jobs = Array.from({ length: 100 }, (_, index) => makeJob({
      id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
    }));
    const gateway = makeGateway({ listJobs: vi.fn(async () => ({ jobs, total: 150 })) });

    const result = await searchJobs({ ...baseInput, postedWithinDays: 3 }, gateway, now);

    expect(result.data?.dateFilter?.coverage).toBe('partial');
    expect(result.data?.upstreamTotal).toBe(150);
    expect(result.data?.matchedInScannedSet).toBe(100);
    expect(result.agentInstructions.join(' ')).toContain('never describe these results as exhaustive');
  });

  it('returns structured NO_RESULTS and forbids fabricated alternatives', async () => {
    const result = await searchJobs({ ...baseInput, query: '不存在的产品岗位', city: '北京' }, makeGateway(), now);

    expect(result.status).toBe('no_results');
    expect(result.reason?.code).toBe('NO_MATCHING_JOBS');
    expect(result.data?.jobs).toEqual([]);
    expect(result.agentInstructions.join(' ')).toContain('Do not fabricate alternatives');
  });

  it('never turns a missing or unsafe source into an invented citation', async () => {
    const gateway = makeGateway({
      listJobs: vi.fn(async () => ({ jobs: [makeJob({ source_url: 'javascript:alert(1)' })], total: 1 })),
    });

    const result = await searchJobs(baseInput, gateway, now);

    expect(result.data?.jobs[0].source.officialUrl).toBeNull();
    expect(result.agentInstructions.join(' ')).toContain('official URL is unavailable');
  });

  it('distinguishes a delisted job from an upstream failure', async () => {
    const missing = await getJobDetail({ id: '33333333-3333-4333-8333-333333333333' }, makeGateway(), now);
    expect(missing.status).toBe('no_results');
    expect(missing.reason?.code).toBe('JOB_NOT_FOUND_OR_DELISTED');

    const failed = await executeTool(
      () => { throw new ApiError('UPSTREAM_UNAVAILABLE', 'Jobs API returned HTTP 503.', true); },
      now,
    );
    expect(failed.status).toBe('error');
    expect(failed.error).toEqual({ code: 'UPSTREAM_UNAVAILABLE', message: 'Jobs API returned HTTP 503.', retryable: true });
    expect(failed.data).toBeNull();
    expect(failed.agentInstructions.join(' ')).toContain('Do not substitute remembered or fabricated job data');
  });

  it('keeps company counts separate from actual job postings', async () => {
    const gateway = makeGateway({
      listCompanies: vi.fn(async () => [{ company: '示例科技', slug: 'example-tech', company_type: '民营', job_count: 8, locations: ['北京'] }]),
    });

    const result = await listCompanies({ limit: 50 }, gateway, now);

    expect(result.data?.companies[0].activeJobCount).toBe(8);
    expect(result.data).not.toHaveProperty('jobs');
    expect(result.agentInstructions.join(' ')).toContain('never infer postings from activeJobCount');
  });

  it('preserves campus-date confidence and rejects non-HTTP source links', async () => {
    const gateway = makeGateway({
      getCampusTimeline: vi.fn(async () => ({
        asOf: '2026-11-20', year: 2027,
        totals: { timelineCompanies: 1, campusJobsActive: 4, campusJobsNew7d: 2 },
        timeline: [{
          company: '示例科技', slug: 'example-tech', industry: '互联网', campusActive: 4, campusNew7d: 2,
          phases: [{ season: '秋招', phase: '网申', startDate: null, endDate: '2026-12-01', sourceUrl: 'javascript:alert(1)', confidence: 'low' as const, note: null }],
        }],
      })),
    });

    const result = await getCampusTimeline(gateway, now);

    expect(result.data?.timeline[0].phases[0].startDate).toBeNull();
    expect(result.data?.timeline[0].phases[0].confidence).toBe('low');
    expect(result.data?.timeline[0].phases[0].officialUrl).toBeNull();
    expect(result.meta.retrievedAt).toBe(NOW.toISOString());
  });
});
