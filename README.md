# Ruyuejian Jobs MCP

Search China tech jobs from companies' **official career pages**, directly inside Claude, Cursor, or another MCP client. Every result preserves its official source URL when available, source publication time, and first-seen time.

**Data is collected from public official career pages and refreshed daily, not in real time.** Delisted jobs are removed by source-reachability checks and the existing delisting pipeline. No API key is required; the server is read-only.

## 30-second example

User: `帮我找北京最近三天发布的 AI 产品经理岗位，给出官网链接。`

The client should call:

```json
{
  "query": "AI 产品经理",
  "city": "北京",
  "postedWithinDays": 3,
  "limit": 20,
  "offset": 0
}
```

The response contains active matching jobs with `source.officialUrl`, `source.publishedAt`, and `source.firstSeenAt`. If `dateFilter.coverage` is `partial`, the agent must say the scan was incomplete rather than claiming these are all matching jobs.

## Clients

### Claude Desktop / Cursor / generic `mcpServers`

```json
{
  "mcpServers": {
    "ruyuejian-jobs": {
      "command": "npx",
      "args": ["-y", "ruyuejian-jobs-mcp"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add ruyuejian-jobs -- npx -y ruyuejian-jobs-mcp
```

Node.js 20 or newer is required. For a local checkout, build with `npm run build`, then use `node /absolute/path/to/mcp/dist/index.js` as the command instead.

## Tools

| Tool | Purpose | Important inputs |
| --- | --- | --- |
| `search_jobs` | Search active postings with provenance | `query`, `city`, `company`, `recruitmentType`, `limit`, `offset`, `postedWithinDays` |
| `get_job_detail` | Read one active posting by UUID | `id` |
| `list_companies` | List companies and active-job counts | `query`, `city`, `recruitmentType`, `limit` |
| `get_campus_timeline` | Read campus phases, dates, source links and confidence | none |

Use short title keywords such as `AI 产品经理`, not a full natural-language sentence. City values are normal names such as `北京`, not URL slugs.

## Data contract v1

The durable contract is the versioned JSON returned by the tools; MCP is only its transport. Every response has:

- `contractVersion`: currently `1.0.0`.
- `status`: `ok`, `no_results`, or `error`.
- `data`: tool-specific structured data, or `null` on failure.
- `meta`: retrieval time, `company_official_career_pages`, and `daily` refresh semantics.
- `reason`: structured empty-result semantics when applicable.
- `error`: stable code, message, and retryability on failure.
- `agentInstructions`: constraints the consuming agent must preserve in its answer.

### Provenance and time

- `source.officialUrl` is an HTTP(S) official-career-page link, or `null`. Agents must never invent a replacement URL.
- `source.publishedAt` is the publication time supplied by the official source, or `null`.
- `source.firstSeenAt` is when Ruyuejian first observed the job; it is not represented as the official publication time.
- `urlDowngradedToListing=true` means the source leads to an official listing page rather than a reliable job-detail page.
- Detail `salaryMin`/`salaryMax` follow the website's monthly-K convention: values at least 1000 are divided by 1000 for K/month; smaller values are already K/month. Agents must not silently convert them to annual salary.

### Empty results and anti-fabrication

`no_results` is a successful, authoritative tool outcome—not an invitation to fill gaps from model memory. Stable reason codes include `NO_MATCHING_JOBS`, `NO_JOBS_IN_DATE_RANGE`, `JOB_NOT_FOUND_OR_DELISTED`, `NO_MATCHING_COMPANIES`, and `NO_CAMPUS_TIMELINE_DATA`.

### Date-window completeness

The existing public API has no server-side relative-date filter. `postedWithinDays` therefore uses a rolling `N * 24h` window and scans at most 100 upstream records, newest first:

- `complete`: the scan reached all candidates or records older than the window.
- `partial`: more recent candidates may exist beyond the scanned set. `matchedInScannedSet` is not a global total.
- Records with no usable date are excluded and counted as `excludedUnknownDate`.
- Date-filtered searches do not support offset pagination; the input schema rejects that combination.

### Errors and local budgets

Upstream timeout, HTTP 429/5xx, invalid responses, and local rate limiting return `status=error` with no fabricated fallback data. The package limits itself to 30 upstream requests per rolling minute, 50 jobs per normal page, 100 records per date scan, and a 10-second upstream timeout.

`RUYUEJIAN_API_BASE_URL` can point to another HTTP(S) API base for development. It defaults to `https://ruyuejian.com/api`.

## Measurement and live eval

Set `RUYUEJIAN_MCP_TELEMETRY=1` to emit one structured JSON event per tool call to stderr. Events contain tool name, status, reason/error code, result counts, date coverage and duration; they deliberately exclude raw queries, job IDs, descriptions and source URLs. This is local, opt-in telemetry—nothing is transmitted to Ruyuejian by the package.

Run `npm run eval:live` after each schema or mapping change. It performs read-only production calls through a real MCP client and asserts search, detail, companies, recent-date coverage and campus-timeline contracts.

## Development

```bash
npm install
npm run build
npm test
```

The eval suite covers source citation, recent-date filtering, partial coverage, empty results, delisting, upstream failures, invalid parameters, and real MCP client/server calls over an in-memory transport.

Maintainers: see [PUBLISHING.md](./PUBLISHING.md) for npm, Official Registry, directory submission, production rollout and community-post steps.

## 中文说明

如约见岗位数据全部来自公司官方招聘页，由 Scrapy + Playwright 采集，并非第三方岗位聚合。每条结果尽可能保留官网原始链接、官网发布时间与首次收录时间；数据按日刷新，**不得宣称实时**。空结果、部分日期覆盖和上游故障都有独立机器可读状态，Agent 不得编造岗位、日期或链接。

**国内访问**：本仓库的权威源是 GitHub（`github.com/aaron20032/ruyuejian-jobs-mcp`）。若访问 GitHub 较慢，可用只读镜像 `gitee.com/mindisland_1_0/ruyuejian-jobs-mcp` 浏览与克隆代码；镜像由 GitHub 单向同步，**Issue、PR 与代码提交请一律提到 GitHub**，在镜像仓的提交会被同步覆盖。
