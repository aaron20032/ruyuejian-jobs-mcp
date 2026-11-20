import { CONTRACT_VERSION, ToolEnvelope } from './contract.js';

export function emitToolTelemetry(
  tool: string,
  result: ToolEnvelope<unknown>,
  durationMs: number,
  env: NodeJS.ProcessEnv = process.env,
  write: (line: string) => void = console.error,
) {
  if (env.RUYUEJIAN_MCP_TELEMETRY !== '1') return;
  const data = result.data as Record<string, unknown> | null;
  const jobs = Array.isArray(data?.jobs) ? data.jobs.length : undefined;
  const companies = Array.isArray(data?.companies) ? data.companies.length : undefined;
  const dateFilter = data?.dateFilter as { coverage?: string } | null | undefined;
  write(JSON.stringify({
    event: 'mcp_tool_call',
    timestamp: new Date().toISOString(),
    contractVersion: CONTRACT_VERSION,
    tool,
    status: result.status,
    reasonCode: result.reason?.code,
    errorCode: result.error?.code,
    retryable: result.error?.retryable,
    returned: jobs ?? companies ?? (data && 'job' in data ? Number(Boolean(data.job)) : undefined),
    upstreamTotal: typeof data?.upstreamTotal === 'number' ? data.upstreamTotal : undefined,
    scanned: typeof data?.scanned === 'number' ? data.scanned : undefined,
    dateCoverage: dateFilter?.coverage,
    durationMs: Math.round(durationMs),
  }));
}
