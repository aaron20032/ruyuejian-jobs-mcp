import * as z from 'zod/v4';
import { CONTRACT_VERSION, DATA_REFRESH, DATA_SOURCE, MAX_PAGE_SIZE } from './contract.js';

const jobTitle = z.string().trim().min(1).max(80).optional()
  .describe('Short job-title keyword such as "AI 产品经理" or "前端". Do not pass a full sentence.');
const city = z.string().trim().min(1).max(40).optional()
  .describe('City or location name as written by users, for example "北京". Do not convert it to a slug.');
const recruitmentType = z.enum(['social', 'campus', 'intern']).optional()
  .describe('Recruitment type: social, campus, or intern.');

export const SearchJobsInputSchema = z.object({
  query: jobTitle,
  city,
  company: z.string().trim().min(1).max(80).optional().describe('Company name or distinctive substring, for example "腾讯".'),
  recruitmentType,
  limit: z.number().int().min(1).max(MAX_PAGE_SIZE).default(20).describe('Maximum jobs to return.'),
  offset: z.number().int().min(0).max(10_000).default(0).describe('Zero-based upstream page offset. Must be 0 with postedWithinDays.'),
  postedWithinDays: z.number().int().min(1).max(90).optional()
    .describe('Rolling N*24-hour window measured from official publication time, falling back to first-seen time. Scans at most 100 upstream records.'),
}).refine((input) => input.postedWithinDays === undefined || input.offset === 0, {
  message: 'offset must be 0 when postedWithinDays is used; date-filtered results do not support exhaustive pagination.',
  path: ['offset'],
});

export const JobIdInputSchema = z.object({
  id: z.string().uuid().describe('Exact job UUID returned by search_jobs.'),
});

export const ListCompaniesInputSchema = z.object({
  query: jobTitle,
  city,
  recruitmentType,
  limit: z.number().int().min(1).max(100).default(50).describe('Maximum companies to return after aggregation.'),
});

export const EmptyInputSchema = z.object({});

const SourceSchema = z.object({
  officialUrl: z.string().url().nullable(),
  sourceName: z.string(),
  publishedAt: z.string().nullable(),
  firstSeenAt: z.string().nullable(),
  urlDowngradedToListing: z.boolean(),
});

const JobSchema = z.object({
  id: z.string(),
  title: z.string(),
  company: z.string(),
  companySlug: z.string().nullable(),
  location: z.string(),
  category: z.string().nullable(),
  subcategory: z.string().nullable(),
  recruitmentType: z.string().nullable(),
  skills: z.array(z.string()),
  experienceRequired: z.string().nullable(),
  educationRequired: z.string().nullable(),
  source: SourceSchema,
});

const JobDetailSchema = JobSchema.extend({
  description: z.string(),
  salaryMin: z.number().nullable(),
  salaryMax: z.number().nullable(),
});

const DateFilterSchema = z.object({
  requestedDays: z.number(),
  windowStart: z.string(),
  coverage: z.enum(['complete', 'partial']),
  excludedUnknownDate: z.number(),
});

const SearchDataSchema = z.object({
  query: z.record(z.string(), z.unknown()),
  jobs: z.array(JobSchema),
  upstreamTotal: z.number(),
  scanned: z.number(),
  matchedInScannedSet: z.number(),
  returned: z.number(),
  nextOffset: z.number().nullable(),
  dateFilter: DateFilterSchema.nullable(),
});

const DetailDataSchema = z.object({ job: JobDetailSchema.nullable() });

const CompanySchema = z.object({
  name: z.string(),
  slug: z.string().nullable(),
  companyType: z.string().nullable(),
  activeJobCount: z.number(),
  locations: z.array(z.string()),
});

const CompaniesDataSchema = z.object({
  companies: z.array(CompanySchema),
  total: z.number(),
  returned: z.number(),
});

const CampusDataSchema = z.object({
  asOf: z.string(),
  year: z.number(),
  totals: z.object({
    timelineCompanies: z.number(),
    campusJobsActive: z.number(),
    campusJobsNew7d: z.number(),
  }),
  timeline: z.array(z.object({
    company: z.string(),
    slug: z.string().nullable(),
    industry: z.string().nullable(),
    phases: z.array(z.object({
      season: z.string(),
      phase: z.string(),
      startDate: z.string().nullable(),
      endDate: z.string().nullable(),
      officialUrl: z.string().url().nullable(),
      confidence: z.enum(['high', 'medium', 'low']),
      note: z.string().nullable(),
    })),
    campusActive: z.number(),
    campusNew7d: z.number(),
  })),
});

const MetaSchema = z.object({
  retrievedAt: z.string(),
  dataSource: z.literal(DATA_SOURCE),
  refresh: z.literal(DATA_REFRESH),
});

function envelope<T extends z.ZodType>(dataSchema: T) {
  return z.object({
    contractVersion: z.literal(CONTRACT_VERSION),
    status: z.enum(['ok', 'no_results', 'error']),
    data: dataSchema.nullable(),
    meta: MetaSchema,
    reason: z.object({ code: z.string(), message: z.string() }).optional(),
    error: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }).optional(),
    agentInstructions: z.array(z.string()),
  });
}

export const SearchJobsOutputSchema = envelope(SearchDataSchema);
export const JobDetailOutputSchema = envelope(DetailDataSchema);
export const ListCompaniesOutputSchema = envelope(CompaniesDataSchema);
export const CampusTimelineOutputSchema = envelope(CampusDataSchema);

export type SearchJobsInput = z.infer<typeof SearchJobsInputSchema>;
export type JobIdInput = z.infer<typeof JobIdInputSchema>;
export type ListCompaniesInput = z.infer<typeof ListCompaniesInputSchema>;
