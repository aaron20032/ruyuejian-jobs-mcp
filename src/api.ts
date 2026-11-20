import { MAX_REQUESTS_PER_MINUTE } from './contract.js';

export const DEFAULT_API_BASE_URL = 'https://ruyuejian.com/api';

export interface UpstreamJob {
  id: string;
  title: string;
  company: string;
  company_slug?: string | null;
  location: string;
  category?: string | null;
  subcategory?: string | null;
  recruitment_type?: string;
  skills?: string[];
  experience_required?: string | null;
  education_required?: string | null;
  source_url?: string | null;
  source_url_downgraded_at?: string | null;
  source_name?: string;
  posted_at?: string;
  source_posted_at?: string | null;
}

export interface UpstreamJobDetail extends UpstreamJob {
  companySlug?: string | null;
  description?: string;
  salaryMin?: number | null;
  salaryMax?: number | null;
  experienceRequired?: string | null;
  educationRequired?: string | null;
  postedAt?: string;
  sourceUrl?: string | null;
  sourceName?: string | null;
}

export interface UpstreamCompany {
  company: string;
  company_type: string | null;
  job_count: number;
  locations: string[];
  slug: string | null;
}

export interface UpstreamCampusTimeline {
  asOf: string;
  year: number;
  totals: {
    timelineCompanies: number;
    campusJobsActive: number;
    campusJobsNew7d: number;
  };
  timeline: Array<{
    company: string;
    slug: string | null;
    industry: string | null;
    phases: Array<{
      season: string;
      phase: string;
      startDate: string | null;
      endDate: string | null;
      sourceUrl: string | null;
      confidence: 'high' | 'medium' | 'low';
      note: string | null;
    }>;
    campusActive: number;
    campusNew7d: number;
  }>;
}

export interface ListJobsParams {
  jobTitle?: string;
  location?: string;
  companyName?: string;
  recruitmentType?: 'social' | 'campus' | 'intern';
  limit: number;
  offset: number;
}

export interface ListCompaniesParams {
  jobTitle?: string;
  location?: string;
  recruitmentType?: 'social' | 'campus' | 'intern';
}

export interface JobsGateway {
  listJobs(params: ListJobsParams): Promise<{ jobs: UpstreamJob[]; total: number }>;
  getJobDetail(id: string): Promise<UpstreamJobDetail | null>;
  listCompanies(params: ListCompaniesParams): Promise<UpstreamCompany[]>;
  getCampusTimeline(): Promise<UpstreamCampusTimeline>;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class JobsApi implements JobsGateway {
  private readonly baseUrl: string;
  private readonly requestTimes: number[] = [];

  constructor(
    baseUrl = process.env.RUYUEJIAN_API_BASE_URL || DEFAULT_API_BASE_URL,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('RUYUEJIAN_API_BASE_URL must use HTTP or HTTPS');
    }
    this.baseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  }

  async listJobs(params: ListJobsParams) {
    const query = this.paginationQuery(params);
    if (params.jobTitle) query.set('job_title', params.jobTitle);
    if (params.location) query.set('location', params.location);
    if (params.companyName) query.set('company_name', params.companyName);
    if (params.recruitmentType) query.set('recruitment_type', params.recruitmentType);
    query.set('sort', 'latest');
    const data = await this.request<{ jobs: UpstreamJob[]; total: number }>('jobs/list', query);
    return { jobs: Array.isArray(data.jobs) ? data.jobs : [], total: Number(data.total) || 0 };
  }

  async getJobDetail(id: string) {
    const data = await this.request<UpstreamJobDetail>(`jobs/detail/${encodeURIComponent(id)}`, undefined, true);
    return data;
  }

  async listCompanies(params: ListCompaniesParams) {
    const query = new URLSearchParams();
    if (params.jobTitle) query.set('job_title', params.jobTitle);
    if (params.location) query.set('location', params.location);
    if (params.recruitmentType) query.set('recruitment_type', params.recruitmentType);
    const data = await this.request<{ companies: UpstreamCompany[] }>('jobs/companies', query);
    return Array.isArray(data.companies) ? data.companies : [];
  }

  async getCampusTimeline() {
    return this.request<UpstreamCampusTimeline>('jobs/campus-timeline');
  }

  private paginationQuery(params: ListJobsParams) {
    return new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
  }

  private acquire() {
    const now = this.now();
    const cutoff = now - 60_000;
    while (this.requestTimes.length && this.requestTimes[0] <= cutoff) this.requestTimes.shift();
    if (this.requestTimes.length >= MAX_REQUESTS_PER_MINUTE) {
      throw new ApiError('LOCAL_RATE_LIMITED', 'Local MCP request budget exhausted; retry after the current minute.', true);
    }
    this.requestTimes.push(now);
  }

  private async request<T>(path: string, query?: URLSearchParams, allowNotFound = false): Promise<T> {
    this.acquire();
    const url = new URL(path, this.baseUrl);
    if (query) url.search = query.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'ruyuejian-jobs-mcp/0.1.0',
        },
        signal: controller.signal,
      });
      if (allowNotFound && response.status === 404) return null as T;
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new ApiError(
          retryable ? 'UPSTREAM_UNAVAILABLE' : 'UPSTREAM_REJECTED',
          `Jobs API returned HTTP ${response.status}.`,
          retryable,
        );
      }
      const body = await response.json() as ApiResponse<T>;
      if (!body.success || body.data === undefined || body.data === null) {
        throw new ApiError('UPSTREAM_INVALID_RESPONSE', 'Jobs API returned an invalid response envelope.', true);
      }
      return body.data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError('UPSTREAM_TIMEOUT', 'Jobs API did not respond within 10 seconds.', true);
      }
      throw new ApiError('UPSTREAM_UNAVAILABLE', 'Jobs API could not be reached.', true);
    } finally {
      clearTimeout(timeout);
    }
  }
}
