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

**快速接入**：需要 Node.js 20 或更高版本。把下面的配置加进客户端的 `mcpServers`，重启客户端后即可让 AI 调用如约见岗位工具：

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

Claude Code 用户执行：

```bash
claude mcp add ruyuejian-jobs -- npx -y ruyuejian-jobs-mcp
```

国内网络若访问 npm 官方源较慢，可先执行 `npm config set registry https://registry.npmmirror.com`（该包已在 npmmirror 同步）。

### 支持的客户端

本服务为标准 stdio 型 MCP，凡支持自定义 MCP 的客户端均可接入（本包已同步 npmmirror）。除 Claude Desktop / Cursor / Claude Code 外，以下国内主流客户端也在支持范围内，多数直接复用上方 `mcpServers` JSON。

**桌面办公 Agent 客户端**

| 客户端 | 接入方式 |
| --- | --- |
| WorkBuddy（腾讯） | 「专家 · 技能 · 连接器」→ 自定义连接器 → 配置 MCP，在 `~/.workbuddy/mcp.json`（用户级）或 `<项目>/.workbuddy/mcp.json`（项目级）的 `mcpServers` 中**合并**加入条目；配置不支持注释，首次连接需点「信任」；**首次连接易报 `MCP initialize timed out`**，成因与规避见下方「冷启动超时」 |
| 豆包工作（字节） | 桌面客户端「技能 · 连接器 · 伙伴」→ 连接器 → 新建自定义连接器，传输类型选 STDIO，填 `npx` 命令与参数 |
| 千问办公（阿里） | 桌面客户端「扩展」→「连接器」→ 添加，粘贴 `mcpServers` JSON 或手动配置选 STDIO |
| Kimi Work（月之暗面） | 走插件体系：Plugin Builder 可导入官方 MCP Registry 中本包的 `server.json`（`com.ruyuejian/ruyuejian-jobs-mcp`）生成插件 |
| Marvis（腾讯应用宝） | 工具箱 → 连接（MCP/CLI）→ 我的连接 → 自定义连接；传输类型以客户端表单为准 |
| QClaw（腾讯电脑管家） | 设置或对话内配置；OpenClaw 系，`~/.openclaw/openclaw.json` 的 `mcpServers`（type: stdio）或 `openclaw mcp add` |
| DeepSeek Harness | **不读 `mcpServers` JSON**：在 `~/.dsh/cordis.patch.yml` 用内置插件 `@deepseek-ai/dsh-mcp-client` 声明本服务（transport: stdio，command: npx，args: `["-y","ruyuejian-jobs-mcp"]`），YAML 结构以其官方文档为准 |
| 百度搭子（DuMate） | **暂不可直连**：官方当前仅支持远程 streamableHttp/SSE 型 MCP，本地 stdio 包待远程形态上线后接入 |
| 纳米 Work（360） | 内置 MCP/连接器生态；自定义本地 stdio 入口未见公开文档，**待验证** |
| 金山灵犀（WPS 灵犀专业版） | 设置 → 连接器管理 → 自定义连接器，传输模式选 STDIO；配置文件加密，只能走 UI 表单 |
| KroWork（快手） | 未见公开自定义 MCP 入口，**待验证** |
| AStudio（科大讯飞） | 设置中启用 MCP；自定义 stdio 具体入口无公开文档，待确认 |

**⚠️ 冷启动超时（WorkBuddy 真机实测，2026-11-22）**

WorkBuddy 守护进程对 stdio 服务的 initialize 探针是**固定 30 秒超时**（日志形如 `stdio-probe-failed {"command":"npx","elapsedMs":30074,"timeoutMs":30000,"stderrChunks":0}`）。`npx -y ruyuejian-jobs-mcp` 在**本包尚未进入 npx 缓存**的首次连接时，必须现场解析并下载整棵依赖树（实测 101 次网络请求、纯下载约 14 秒，加上解压与模块加载总耗时越过 30 秒），进程在装完前就被杀掉 → 缓存写不成功 → 下次重连又从冷启动重来，表现为反复点「重连」始终超时。凡 initialize 超时较短的桌面 Agent 客户端都可能命中同一坑，与包本身无关。

两种规避：

1. **预热一次**：先在终端执行 `npx -y ruyuejian-jobs-mcp`（启动后 Ctrl+C 退出即可），把包写进 npx 缓存，再回客户端启用；此后握手约 3 秒。
2. **改为本地执行、启动零下载**（推荐，实测握手约 0.45 秒）：先 `npm i -g ruyuejian-jobs-mcp`，再把条目指向全局产物——

```json
{
  "mcpServers": {
    "ruyuejian-jobs": {
      "command": "node",
      "args": ["<npm root -g 的输出路径>/ruyuejian-jobs-mcp/dist/index.js"]
    }
  }
}
```

客户端若不解析 PATH 里的 `node`（Windows 常见），把 `command` 换成 node 可执行文件的绝对路径。用 nvm / nvm-windows 管理多版本时，全局目录是**按 node 版本隔离**的（`npm root -g` 随当前版本变化），切换版本后需重新 `npm i -g` 一次，否则配置里的路径会指向空目录。开发调试期也可以直接指向本地 checkout 的 `mcp/dist/index.js`，但那样每次改完 `src` 必须重新 `npm run build`，产物落后于源码时客户端会静默跑旧逻辑。

**AI 编程客户端**

| 客户端 | 接入方式 |
| --- | --- |
| Qoder / Qoder CN（阿里） | 终端执行下方命令，或在 MCP 设置中粘贴 `mcpServers` JSON |
| TRAE（字节，含原豆包 MarsCode 插件） | MCP 设置页添加 stdio 类型服务，粘贴 `mcpServers` JSON；MarsCode 品牌已并入 TRAE，按 TRAE 入口接入 |
| CodeBuddy（腾讯） | IDE 右上角 MCP 面板 → 手工粘贴 `mcpServers` JSON；CLI 版（CodeBuddy Code）用项目 `.mcp.json` |
| 文心快码 Comate（百度） | 插件「···」→ MCP → 手动配置；项目级 `.comate/mcp.json` 或全局 `~/.comate/mcp.json` |
| Kimi Code（月之暗面） | `~/.kimi-code/mcp.json`（项目级 `.kimi-code/mcp.json`）；CLI `kimi mcp add --transport stdio ruyuejian-jobs -- npx -y ruyuejian-jobs-mcp` |
| ZCode（智谱） | 设置 → MCP 服务器 → 添加（stdio 本地命令）或 JSON 模式粘贴 `mcpServers` |
| 华为云码道（CodeArts 代码智能体） | 设置 → MCP 工具 → `mcp_settings.json`；**格式有差异**：本地服务用 `type: "local"`、`command` 为数组（如 `["npx","-y","ruyuejian-jobs-mcp"]`），勿照抄通用 JSON |
| MiniMax Code | 添加服务器支持表单/JSON 模式（`mcpServers`，stdio 用 command/args） |
| CodeGeeX（智谱） | 未见公开 MCP 扩展入口，**待验证**（智谱系带 MCP 的编程客户端为 ZCode） |

Qoder CLI 一键添加：

```bash
qoder mcp add ruyuejian-jobs -- npx -y ruyuejian-jobs-mcp
```

VS Code（GitHub Copilot）、Windsurf、Cline、Cherry Studio 等其他支持标准 MCP 协议的客户端，均直接使用上方 `mcpServers` JSON。标注「待验证」的客户端暂未找到公开的自定义 MCP 入口，接入前请以客户端当前版本为准。
