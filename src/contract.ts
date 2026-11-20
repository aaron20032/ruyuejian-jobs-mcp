export const CONTRACT_VERSION = '1.0.0';
export const DATA_SOURCE = 'company_official_career_pages' as const;
export const DATA_REFRESH = 'daily' as const;
export const MAX_PAGE_SIZE = 50;
export const DATE_SCAN_LIMIT = 100;
export const MAX_REQUESTS_PER_MINUTE = 30;

export const BASE_AGENT_INSTRUCTIONS = [
  'Use only returned records and fields. Never invent jobs, companies, dates, descriptions, or URLs.',
  'Cite source.officialUrl when present. If it is null, explicitly say that the official URL is unavailable.',
  'Data is refreshed daily, not in real time.',
] as const;

export type ToolStatus = 'ok' | 'no_results' | 'error';

export interface ResultReason {
  code: string;
  message: string;
}

export interface ResultError extends ResultReason {
  retryable: boolean;
}

export interface ResultMeta {
  retrievedAt: string;
  dataSource: typeof DATA_SOURCE;
  refresh: typeof DATA_REFRESH;
}

export interface ToolEnvelope<T> extends Record<string, unknown> {
  contractVersion: typeof CONTRACT_VERSION;
  status: ToolStatus;
  data: T | null;
  meta: ResultMeta;
  reason?: ResultReason;
  error?: ResultError;
  agentInstructions: string[];
}
