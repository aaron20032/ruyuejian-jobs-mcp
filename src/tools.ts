import { ApiError, JobsGateway, UpstreamJob, UpstreamJobDetail } from './api.js';
import {
  BASE_AGENT_INSTRUCTIONS,
  CONTRACT_VERSION,
  DATA_REFRESH,
  DATA_SOURCE,
  DATE_SCAN_LIMIT,
  ToolEnvelope,
} from './contract.js';
import { JobIdInput, ListCompaniesInput, SearchJobsInput } from './schemas.js';

interface Source {
  officialUrl: string | null;
  sourceName: string;
  publishedAt: string | null;
  firstSeenAt: string | null;
  urlDowngradedToListing: boolean;
}

interface Job {
  id: string;
  title: string;
  company: string;
  companySlug: string | null;
  location: string;
  category: string | null;
  subcategory: string | null;
  recruitmentType: string | null;
  skills: string[];
  experienceRequired: string | null;
  educationRequired: string | null;
  source: Source;
}

interface JobDetail extends Job {
  description: string;
  salaryMin: number | null;
  salaryMax: number | null;
}

interface CompaniesData {
  companies: Array<{
    name: string;
    slug: string | null;
    companyType: string | null;
    activeJobCount: number;
    locations: string[];
  }>;
  total: number;
  returned: number;
}

interface CampusTimelineData {
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
      officialUrl: string | null;
      confidence: 'high' | 'medium' | 'low';
      note: string | null;
    }>;
    campusActive: number;
    campusNew7d: number;
  }>;
}

interface SearchData {
  query: Record<string, unknown>;
  jobs: Job[];
  upstreamTotal: number;
  scanned: number;
  matchedInScannedSet: number;
  returned: number;
  nextOffset: number | null;
  dateFilter: {
    requestedDays: number;
    windowStart: string;
    coverage: 'complete' | 'partial';
    excludedUnknownDate: number;
  } | null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function officialUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function mapSource(job: UpstreamJob | UpstreamJobDetail): Source {
  const detail = job as UpstreamJobDetail;
  return {
    officialUrl: officialUrl(job.source_url ?? detail.sourceUrl),
    sourceName: job.source_name ?? detail.sourceName ?? '公司招聘官网',
    publishedAt: isoOrNull(job.source_posted_at),
    firstSeenAt: isoOrNull(job.posted_at ?? detail.postedAt),
    urlDowngradedToListing: Boolean(job.source_url_downgraded_at),
  };
}

function mapJob(job: UpstreamJob): Job {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    companySlug: job.company_slug ?? null,
    location: job.location || '',
    category: job.category ?? null,
    subcategory: job.subcategory ?? null,
    recruitmentType: job.recruitment_type ?? null,
    skills: Array.isArray(job.skills) ? job.skills : [],
    experienceRequired: job.experience_required ?? null,
    educationRequired: job.education_required ?? null,
    source: mapSource(job),
  };
}

function meta(now: Date) {
  return { retrievedAt: now.toISOString(), dataSource: DATA_SOURCE, refresh: DATA_REFRESH };
}

function instructions(...extra: string[]): string[] {
  return [...BASE_AGENT_INSTRUCTIONS, ...extra];
}

export async function searchJobs(
  input: SearchJobsInput,
  gateway: JobsGateway,
  now: () => Date = () => new Date(),
): Promise<ToolEnvelope<SearchData>> {
  const current = now();
  const result = await gateway.listJobs({
    jobTitle: input.query,
    location: input.city,
    companyName: input.company,
    recruitmentType: input.recruitmentType,
    limit: input.postedWithinDays ? DATE_SCAN_LIMIT : input.limit,
    offset: input.offset,
  });
  const mapped = result.jobs.map(mapJob);
  let candidates = mapped;
  let dateFilter: SearchData['dateFilter'] = null;
  let excludedUnknownDate = 0;

  if (input.postedWithinDays) {
    const cutoffTime = current.getTime() - input.postedWithinDays * 86_400_000;
    candidates = mapped.filter((job) => {
      const date = job.source.publishedAt ?? job.source.firstSeenAt;
      if (!date) {
        excludedUnknownDate++;
        return false;
      }
      return Date.parse(date) >= cutoffTime;
    });
    const lastDate = mapped.at(-1)?.source.publishedAt ?? mapped.at(-1)?.source.firstSeenAt;
    const reachedOlderRecords = lastDate !== undefined && (lastDate === null || Date.parse(lastDate) < cutoffTime);
    const scannedAll = result.jobs.length >= result.total || reachedOlderRecords;
    dateFilter = {
      requestedDays: input.postedWithinDays,
      windowStart: new Date(cutoffTime).toISOString(),
      coverage: scannedAll ? 'complete' : 'partial',
      excludedUnknownDate,
    };
  }

  const jobs = candidates.slice(0, input.limit);
  const nextOffset = input.postedWithinDays === undefined && input.offset + result.jobs.length < result.total
    ? input.offset + result.jobs.length
    : null;
  const data: SearchData = {
    query: {
      ...(input.query ? { title: input.query } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.company ? { company: input.company } : {}),
      ...(input.recruitmentType ? { recruitmentType: input.recruitmentType } : {}),
    },
    jobs,
    upstreamTotal: result.total,
    scanned: result.jobs.length,
    matchedInScannedSet: candidates.length,
    returned: jobs.length,
    nextOffset,
    dateFilter,
  };
  const partial = dateFilter?.coverage === 'partial';
  const extra = [
    ...(partial ? ['Date-filtered coverage is partial; never describe these results as exhaustive.'] : []),
    ...(jobs.length === 0 ? ['Do not fabricate alternatives. Suggest broadening the title keyword, removing filters, or checking list_companies.'] : []),
  ];
  return {
    contractVersion: CONTRACT_VERSION,
    status: jobs.length ? 'ok' : 'no_results',
    data,
    meta: meta(current),
    ...(jobs.length === 0 ? {
      reason: {
        code: input.postedWithinDays ? 'NO_JOBS_IN_DATE_RANGE' : 'NO_MATCHING_JOBS',
        message: input.postedWithinDays
          ? 'No matching jobs were found in the requested date window within the scanned set.'
          : 'No active jobs matched the supplied filters.',
      },
    } : {}),
    agentInstructions: instructions(...extra),
  };
}

export async function getJobDetail(
  input: JobIdInput,
  gateway: JobsGateway,
  now: () => Date = () => new Date(),
): Promise<ToolEnvelope<{ job: JobDetail | null }>> {
  const job = await gateway.getJobDetail(input.id);
  const current = now();
  if (!job) {
    return {
      contractVersion: CONTRACT_VERSION,
      status: 'no_results' as const,
      data: { job: null },
      meta: meta(current),
      reason: { code: 'JOB_NOT_FOUND_OR_DELISTED', message: 'The job does not exist or is no longer active. Do not reconstruct it from memory.' },
      agentInstructions: instructions('Tell the user the posting is unavailable and suggest a fresh search_jobs call.'),
    };
  }
  const base = mapJob(job);
  const data = {
    job: {
      ...base,
      companySlug: job.companySlug ?? base.companySlug,
      experienceRequired: job.experienceRequired ?? base.experienceRequired,
      educationRequired: job.educationRequired ?? base.educationRequired,
      description: job.description ?? '',
      salaryMin: job.salaryMin ?? null,
      salaryMax: job.salaryMax ?? null,
      source: mapSource(job),
    },
  };
  return {
    contractVersion: CONTRACT_VERSION,
    status: 'ok' as const,
    data,
    meta: meta(current),
    agentInstructions: instructions(),
  };
}

export async function listCompanies(
  input: ListCompaniesInput,
  gateway: JobsGateway,
  now: () => Date = () => new Date(),
): Promise<ToolEnvelope<CompaniesData>> {
  const companies = await gateway.listCompanies({
    jobTitle: input.query,
    location: input.city,
    recruitmentType: input.recruitmentType,
  });
  const mapped = companies.map((company) => ({
    name: company.company,
    slug: company.slug,
    companyType: company.company_type,
    activeJobCount: company.job_count,
    locations: company.locations,
  }));
  const current = now();
  return {
    contractVersion: CONTRACT_VERSION,
    status: mapped.length ? 'ok' as const : 'no_results' as const,
    data: { companies: mapped.slice(0, input.limit), total: mapped.length, returned: Math.min(mapped.length, input.limit) },
    meta: meta(current),
    ...(mapped.length === 0 ? { reason: { code: 'NO_MATCHING_COMPANIES', message: 'No companies matched the supplied filters.' } } : {}),
    agentInstructions: instructions('Use search_jobs with the company field to retrieve actual postings; never infer postings from activeJobCount.'),
  };
}

export async function getCampusTimeline(
  gateway: JobsGateway,
  now: () => Date = () => new Date(),
): Promise<ToolEnvelope<CampusTimelineData>> {
  const timeline = await gateway.getCampusTimeline();
  const current = now();
  const data = {
    asOf: timeline.asOf,
    year: timeline.year,
    totals: timeline.totals,
    timeline: timeline.timeline.map((company) => ({
      ...company,
      phases: company.phases.map((phase) => ({
        season: phase.season,
        phase: phase.phase,
        startDate: phase.startDate,
        endDate: phase.endDate,
        officialUrl: officialUrl(phase.sourceUrl),
        confidence: phase.confidence,
        note: phase.note,
      })),
    })),
  };
  return {
    contractVersion: CONTRACT_VERSION,
    status: data.timeline.length ? 'ok' as const : 'no_results' as const,
    data,
    meta: meta(current),
    ...(data.timeline.length === 0 ? { reason: { code: 'NO_CAMPUS_TIMELINE_DATA', message: 'No campus timeline records are currently available.' } } : {}),
    agentInstructions: instructions('Respect each phase confidence value and do not infer missing application dates.'),
  };
}

export async function executeTool<T>(operation: () => Promise<ToolEnvelope<T>>, now: () => Date = () => new Date()): Promise<ToolEnvelope<T>> {
  try {
    return await operation();
  } catch (error) {
    const apiError = error instanceof ApiError
      ? error
      : new ApiError('INTERNAL_ERROR', 'The MCP tool could not complete the request.', false);
    return {
      contractVersion: CONTRACT_VERSION,
      status: 'error',
      data: null,
      meta: meta(now()),
      error: { code: apiError.code, message: apiError.message, retryable: apiError.retryable },
      agentInstructions: instructions('Report the tool failure honestly. Do not substitute remembered or fabricated job data.'),
    };
  }
}
