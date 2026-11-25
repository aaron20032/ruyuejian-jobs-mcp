import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { performance } from 'node:perf_hooks';
import { JobsApi, JobsGateway } from './api.js';
import { ToolEnvelope } from './contract.js';
import {
  CampusTimelineOutputSchema,
  EmptyInputSchema,
  JobIdInputSchema,
  JobDetailOutputSchema,
  ListCompaniesInputSchema,
  ListCompaniesOutputSchema,
  SearchJobsInputSchema,
  SearchJobsOutputSchema,
} from './schemas.js';
import { executeTool, getCampusTimeline, getJobDetail, listCompanies, searchJobs } from './tools.js';
import { emitToolTelemetry } from './telemetry.js';

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function toolResult<T>(result: ToolEnvelope<T>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result,
    ...(result.status === 'error' ? { isError: true } : {}),
  };
}

async function invoke<T>(tool: string, operation: () => Promise<ToolEnvelope<T>>) {
  const started = performance.now();
  const result = await executeTool(operation);
  emitToolTelemetry(tool, result, performance.now() - started);
  return toolResult(result);
}

export function createJobsMcpServer(gateway: JobsGateway = new JobsApi()) {
  const server = new McpServer({ name: 'ruyuejian-jobs-mcp', version: '0.1.3' });

  server.registerTool('search_jobs', {
    title: 'Search official-career-page jobs in China',
    description: 'Search active China job postings collected from company official career pages. Use a short job-title keyword, a Chinese city name, optional company and recruitment type. postedWithinDays is a rolling N*24-hour filter over at most 100 scanned records. Every job includes provenance when available. NO_RESULTS and partial date coverage must be reported honestly; never invent jobs or URLs.',
    inputSchema: SearchJobsInputSchema,
    outputSchema: SearchJobsOutputSchema,
    annotations: READ_ONLY,
  }, async (input) => invoke('search_jobs', () => searchJobs(input, gateway)));

  server.registerTool('get_job_detail', {
    title: 'Get one active job and its official source',
    description: 'Get full details for an exact job UUID returned by search_jobs. A missing or delisted job returns no_results, never a reconstructed posting.',
    inputSchema: JobIdInputSchema,
    outputSchema: JobDetailOutputSchema,
    annotations: READ_ONLY,
  }, async ({ id }) => invoke('get_job_detail', () => getJobDetail({ id }, gateway)));

  server.registerTool('list_companies', {
    title: 'List companies with active official-career-page jobs',
    description: 'List companies and active job counts, optionally filtered by short job title, Chinese city and recruitment type. Counts are not postings: call search_jobs to retrieve actual jobs.',
    inputSchema: ListCompaniesInputSchema,
    outputSchema: ListCompaniesOutputSchema,
    annotations: READ_ONLY,
  }, async (input) => invoke('list_companies', () => listCompanies(input, gateway)));

  server.registerTool('get_campus_timeline', {
    title: 'Get campus recruiting dates and source links',
    description: 'Get the current campus recruiting timeline, per-phase source URLs and confidence values. Missing dates must remain missing; do not infer them.',
    inputSchema: EmptyInputSchema,
    outputSchema: CampusTimelineOutputSchema,
    annotations: READ_ONLY,
  }, async () => invoke('get_campus_timeline', () => getCampusTimeline(gateway)));

  return server;
}
