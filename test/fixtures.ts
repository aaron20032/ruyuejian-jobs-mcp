import { vi } from 'vitest';
import { JobsGateway, UpstreamJob } from '../src/api.js';

export const NOW = new Date('2026-11-20T04:00:00.000Z');
export const now = () => new Date(NOW);

export function makeJob(overrides: Partial<UpstreamJob> = {}): UpstreamJob {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'AI 产品经理',
    company: '示例科技',
    company_slug: 'example-tech',
    location: '北京',
    category: '产品经理',
    subcategory: null,
    recruitment_type: 'social',
    skills: ['AI', '产品规划'],
    experience_required: '3-5年',
    education_required: '本科',
    source_url: 'https://careers.example.com/jobs/123',
    source_name: '示例科技招聘官网',
    posted_at: '2026-11-19T04:00:00.000Z',
    source_posted_at: '2026-11-19T02:00:00.000Z',
    ...overrides,
  };
}

export function makeGateway(overrides: Partial<JobsGateway> = {}): JobsGateway {
  return {
    listJobs: vi.fn(async () => ({ jobs: [], total: 0 })),
    getJobDetail: vi.fn(async () => null),
    listCompanies: vi.fn(async () => []),
    getCampusTimeline: vi.fn(async () => ({ asOf: '2026-11-20', year: 2027, totals: { timelineCompanies: 0, campusJobsActive: 0, campusJobsNew7d: 0 }, timeline: [] })),
    ...overrides,
  };
}
