# 发布与推广执行手册

本文件列出必须由账号所有者或发布者执行的外部操作。当前代码、测试和发布物料已就绪，但尚未发布 npm、提交 Registry、创建 PR、发帖或部署生产。

## 0. 发布前最后检查

在 `mcp/` 目录执行：

```bash
npm ci
npm test
npm run build
npm run eval:live
npm pack --dry-run
```

要求：测试全绿；live eval 返回 `result: "passed"`；打包清单不含 `node_modules`、测试、密钥或本地文件。校招时间线返回 `no_results` 在官方源无时间线记录时属于合法结果。

每次发布必须同步三处版本：`package.json`、`package-lock.json`、`server.json`。`server.json.name` 与 `package.json.mcpName` 已固定为 `com.ruyuejian/ruyuejian-jobs-mcp`，不要改名，否则会变成另一个 Registry 条目。

## 1. 建立独立公开仓库并发布 npm

不要把招聘主仓库整体公开。本目录是独立、无凭证、只读调用的公开包。

1. 在主仓库提交并合入本次 `mcp/` 变更。
2. 在 GitHub 手工创建公开仓库 `ruyuejian-jobs-mcp`，不要自动初始化 README。
3. 用 `git subtree` 只导出 `mcp/` 的历史：

   ```bash
   git subtree split --prefix=mcp -b mcp-public
   git push <新建的公开仓库地址> mcp-public:main
   ```

4. 在新仓库根目录给 `package.json` 和 `server.json` 补真实 `repository` 地址；不要把占位符提交进去。
5. 确认 npm 包名可用并登录本人 npm 账号：

   ```bash
   npm view ruyuejian-jobs-mcp version
   npm whoami
   # 未登录时按 npm 官方流程登录，不要把 token 写进仓库
   ```

   `npm view` 返回 404 通常表示名称尚未被占用；若已有他人包，先改名并同步所有物料，不要覆盖他人包。2026-11-20 已实测该名称返回 404，但正式发布前仍须复查。

6. 在独立公开仓库根目录执行：

   ```bash
   npm ci
   npm test
   npm run build
   npm publish --access public
   npm view ruyuejian-jobs-mcp version
   ```

7. 用 Claude Desktop 或 Cursor 的真实配置做首次安装验证，确认能列出四个工具，并完成一次搜索和详情调用。不要只以 npm 页面存在作为验收。

## 1b. 国内只读镜像（Gitee）

GitHub 仓库 `github.com/aaron20032/ruyuejian-jobs-mcp` 是**唯一权威源**；Gitee 仓库 `gitee.com/mindisland_1_0/ruyuejian-jobs-mcp` 只是给国内读者用的**只读镜像**（国内访问 GitHub 可能慢）。同步方向恒为 GitHub → Gitee 单向。

- 提交、PR、Issue 与 npm / MCP Registry 元数据一律指向 GitHub；**禁止**把开发入口、`package.json.repository.url`、`server.json.repository.url` 或文档来源链接改指镜像地址。
- 镜像仓永远不要手工提交：Gitee 同步会覆盖目标仓库的分支、标签与提交记录。
- **命名空间易拼错**：Gitee 侧路径是 `mindisland_1_0`（账号昵称在页面面包屑里显示为 `Admin`），与 GitHub 侧的 `aaron20032` 并不同名；照 GitHub 用户名去拼 Gitee 地址只会得到 404。

### 镜像同步操作

1. 先按第 1 步把主仓库 `mcp/` 的改动推到 GitHub `main`。
2. 在 Gitee 仓库首页点「同步」（同步来源已配为 `https://github.com/aaron20032/ruyuejian-jobs-mcp.git`）；或改用「管理 → 仓库镜像管理」的 Pull 方向镜像实现自动同步（需 GitHub 私人令牌，`repo` 必选；勾选自动同步还需 `admin:repo_hook`，它在 GitHub 侧自动生成 webhook）。
3. 复核两边一致：

   ```bash
   git ls-remote --heads https://gitee.com/mindisland_1_0/ruyuejian-jobs-mcp.git
   git ls-remote --heads git@github.com:aaron20032/ruyuejian-jobs-mcp.git
   ```

   两边 `refs/heads/main` 的 sha 必须相同。

   2026-11-21 首次建镜像已复核通过：两边 `refs/heads/main` 同为 `ecbba0a`，Gitee 仓库页与 `raw/main/README.md` 均返回 200（开源可见，匿名可读）。

### 镜像仓已固化的设置（勿改回）

- 仓库状态 = **开始**。`暂停` / `关闭` 会连 Push 一起禁掉（Gitee 官方权限矩阵），镜像就再也同步不进来；这两档还会把仓库从项目列表隐藏。
- 基本信息：可见性 = **开源**（私有仓起不到国内可读的作用）；「介绍」栏建议固定写「如约见招聘 MCP 的国内只读镜像，权威源 https://github.com/aaron20032/ruyuejian-jobs-mcp ，Issue / PR 请提 GitHub」，避免国内留言沉在没人看的渠道。
- 保护分支 `main`（标准模式，权重 1）：可推送代码成员 = 仓库所有者本人；可合并 Pull Request 成员 = **禁止任何人**。
- 功能设置：勾选「关闭 Issue 新建、更新」与「关闭 Pull Request 新建、更新」；取消「接受轻量级 Pull Request」（否则无需 fork 也能发起 PR，等于留侧门）、「启用 Wiki 功能」（Wiki 不在同步范围内，会攒下 GitHub 侧不存在的漂移内容）、「允许仓库文件在线编辑」。
- **不要**勾「禁止仓库同步」——勾了会关闭同步按钮与强制同步，自断镜像链路。
- 「禁止强制推送」「文件/目录只读」为付费企业版功能，社区版不可用，别指望它们兜底。

### 同步姿势：split + merge（每次都要，勿改回）

GitHub `main` 上有两笔在公开仓直接提交的元数据 commit（`552cd8e` 补 `repository`/`homepage`、`ecbba0a` 规范化 url），主仓库 `mcp/` 历史里没有对应影子，于是两边成了**并行两条线**：

```
08c8998 ── 552cd8e ── ecbba0a          ← GitHub main（tree 6ef0ef25）
   └──── 55f12d5                        ← 主仓库 subtree split 产出（tree 6ef0ef25）
```

2026-11-21 实测：`git subtree split --prefix=mcp` 复用了同一根影子 `08c8998`（无 `git-subtree-dir` 标注也能确定性重算），新影子 `55f12d5` 的 tree 与 GitHub `main` 头 **完全相同**（`6ef0ef25`）。内容零差异，只是历史形状不同 ⇒ 直接把影子推到 `main` 必被拒（non-fast-forward，`ecbba0a` 不在影子链上）。

固定做法（在公开仓做一次 merge，之后 push 就是快进）：

```bash
# 1) 主仓库：切出影子分支（分支名带日期，勿复用旧名）
git subtree split --prefix=mcp -b mcp-sync-YYYYMMDD

# 2) 公开仓工作副本：把影子合进 main（merge base = 08c8998，两侧 tree 相同 ⇒ 无冲突）
cd ../ruyuejian-jobs-mcp
git fetch ../ruyuejian mcp-sync-YYYYMMDD
git merge --no-ff FETCH_HEAD -m "Sync mcp/ from main repo (subtree split <sha>)"

# 3) 门禁 + 推送 + 镜像
npm test && npm run build && npm run eval:live
git push origin main
```

- 必须走 merge 而不是「复制文件再提交」：merge 是三方合并，主仓库里**删除**的文件会正确删除；目录复制会留下删不掉的僵尸文件。
- merge 之后 `main` 里同时含两条线，**下次同步仍要重复这套 split + merge**（每次一个合并提交），这是并行历史的正常代价，不是故障。
- 根治办法只有一条：**`mcp/` 的任何改动只在主仓库提交，公开仓不再手工提交**。本次之后照此执行。
- 不推荐 `--force` / `--force-with-lease` 用纯影子链覆盖 `main`：会改写公开历史，npm 已发布包记录的 `gitHead`（`ecbba0a`）将失去引用。

## 2. 发布到 Official MCP Registry

本项目使用域名命名空间 `com.ruyuejian`，因此采用 DNS 认证，不依赖某个 GitHub 个人账号命名空间。

### 2.1 安装官方发布工具

从官方仓库最新 Release 下载 `mcp-publisher_windows_amd64.tar.gz`，解压并将 `mcp-publisher.exe` 放入 PATH。官方流程与下载入口：

- https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/quickstart.mdx
- https://github.com/modelcontextprotocol/registry/releases

验证：

```bash
mcp-publisher --help
mcp-publisher validate server.json
```

### 2.2 生成域名证明密钥

在 Git Bash 的一个不进入版本库的私有目录执行。需要 OpenSSL 3+：

```bash
MY_DOMAIN="ruyuejian.com"
openssl genpkey -algorithm Ed25519 -out key.pem
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
printf '%s. IN TXT "v=MCPv1; k=ed25519; p=%s"\n' "$MY_DOMAIN" "$PUBLIC_KEY"
```

`key.pem` 是私钥：不得提交、上传或贴到聊天中。后续发布仍需它，应由发布者安全保管。

### 2.3 配置并验证 DNS

1. 在 DNSPod 给 **根域 `ruyuejian.com`** 新增一条 TXT，主机记录为 `@`，值为上一步完整输出中的 `v=MCPv1; k=ed25519; p=...`。
2. 必须放在根域，不能放在 `_mcp-auth` 或其他子域；保留已有 TXT，不要覆盖 SPF 等记录。
3. 等待解析生效并检查：

   ```bash
   nslookup -type=TXT ruyuejian.com
   ```

4. 回到私有目录登录：

   ```bash
   MCP_PRIVATE_KEY="$(openssl pkey -in key.pem -noout -text | sed -n '/priv:/,/pub:/p' | sed '1d;$d' | tr -d ' :\n')" \
     mcp-publisher login dns --domain "ruyuejian.com"
   ```

### 2.4 发布并回读确认

在包含 `server.json` 的目录执行：

```bash
mcp-publisher validate server.json
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=com.ruyuejian%2Fruyuejian-jobs-mcp"
```

验收必须同时满足：命令显示发布成功；API 能检索到条目；条目版本与 npm 一致；官方元数据 `status` 为 `active`。若失败，先读详细错误和官方认证文档，不要反复生成新密钥：

- https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/authentication.mdx

## 3. 提交其他目录

先搜索是否已从官方 Registry 或 GitHub 自动收录，避免重复条目。

1. **Smithery**：https://smithery.ai — 登录后选择 Publish/Add MCP，连接独立公开仓库，优先选择 npm stdio 包；完成后用其安装流程实测。
2. **Glama**：https://glama.ai — 搜索 GitHub 仓库；若已自动索引则 claim/校正元数据，否则按站点流程提交。重点检查描述、来源链接和最后更新时间。
3. **PulseMCP**：https://www.pulsemcp.com — 先等待/检查官方 Registry 同步；未收录再走其提交入口。
4. **mcp.so**：https://mcp.so — 提交独立仓库，中文描述用「如约见岗位 MCP：在 Claude/Cursor 中查询来自公司官方招聘页的在招岗位，保留官网来源，按日刷新」。
5. **MCPMarket / mcpservers.org**：https://mcpmarket.com 、https://mcpservers.org — 使用相同英文描述，不宣称 real-time 或 no scrapers。
6. **awesome-mcp-servers**：Fork https://github.com/punkpeye/awesome-mcp-servers ，放入最贴切的现有分类并按字母序排列，不自行创造新大类。建议条目：

   ```md
   - [ruyuejian-jobs-mcp](<独立公开仓库地址>) - Search active China tech jobs collected from official company career pages, with traceable source URLs and daily refresh.
   ```

   PR 标题：`Add ruyuejian-jobs-mcp`。正文说明只读、无 API key、npm 安装、官方 Registry 名称、测试与 live eval 命令。

## 4. 上线站内入口

本地 `/mcp` 页面、发现页入口和 `llms-full.txt` 已实现。上线属于生产发版，必须走项目既有门禁，不能由本手册绕过。

如需交给 Agent 执行生产部署，请另行明确发送完整指令：**「请将最新项目部署到腾讯云服务器」**。部署后验收：

1. `https://www.ruyuejian.com/mcp` 可直达且刷新不 404。
2. `/ai-tools` 工具栏出现「MCP 接入」并能跳转。
3. 页面复制按钮在 HTTPS 下可用，复制内容与 README 配置一致。
4. `https://www.ruyuejian.com/llms-full.txt` 包含 MCP 段落。
5. 移动端与桌面端各检查一次，确认无横向溢出。

## 5. 集中曝光文案

前提：npm、官方 Registry、真实客户端安装均已验收，再安排发布。HN/Reddit 选择周二至周四；使用有真实历史的账号，并在评论区回答数据覆盖、刷新、爬取方式和隐私问题。

### Show HN

标题：

```text
Show HN: Ruyuejian MCP – Search China tech jobs from official career pages
```

正文：

```text
Finding relevant openings often means jumping between company career pages, filters and pagination. Ruyuejian Jobs MCP lets Claude, Cursor and other MCP clients query active China tech jobs directly.

The data is collected from public company career pages rather than third-party job-board aggregators. Results preserve the official source URL when available, official publication time and first-seen time. It is refreshed daily, not in real time; unavailable fields remain null.

There are four read-only tools: search_jobs, get_job_detail, list_companies and get_campus_timeline. Empty results, partial date-window coverage and upstream failures are explicit so the agent should not fill gaps from memory.

Install:
{
  "mcpServers": {
    "ruyuejian-jobs": {
      "command": "npx",
      "args": ["-y", "ruyuejian-jobs-mcp"]
    }
  }
}

Source: <独立公开仓库地址>
Registry: com.ruyuejian/ruyuejian-jobs-mcp
```

### r/ClaudeAI 与 r/mcp

标题：`A read-only MCP for searching China tech jobs from official career pages`

正文采用 Show HN 的痛点和安装段，但去掉发布式宣传，补充一句：`I built this to make agent-based job search traceable back to official postings. Feedback on tool schemas, empty-result behavior and date filtering is especially welcome.` 不要在多个子区逐字刷屏。

### V2EX / 掘金 / 即刻

标题：`把如约见岗位库做成了 MCP：在 Claude/Cursor 里直接查公司官网岗位`

正文：

```text
如约见岗位库现在可以通过 MCP 接入 Claude、Cursor 等客户端。你可以直接说「帮我找北京最近三天发布的 AI 产品经理岗位，给出官网链接」。

数据来自公司官方招聘页，由 Scrapy + Playwright 采集，不是第三方岗位聚合；保留官网来源、官网发布时间和首次收录时间，按日刷新，不是实时接口。工具只读、无需 API key。空结果、部分日期覆盖和上游故障会明确返回，避免让模型补编岗位。

安装配置：
{
  "mcpServers": {
    "ruyuejian-jobs": {
      "command": "npx",
      "args": ["-y", "ruyuejian-jobs-mcp"]
    }
  }
}

代码：<独立公开仓库地址>
```

## 6. 发布后的质量闭环

每周以及每次修改 Schema 后执行 `npm run eval:live`。重点看：

- 工具调用成功率、上游错误率和耗时；
- `no_results` 比例及日期过滤 `partial` 比例；
- 有结果但 `officialUrl=null` 的比例；
- 是否出现模型补造岗位、日期或官网链接的反馈。

本地排障可设置 `RUYUEJIAN_MCP_TELEMETRY=1`，事件只写 stderr，不含原始查询词、岗位 ID、描述或 URL。若遥测显示某类查询持续空结果，先改工具 Schema/描述或补 eval，再考虑扩大推广，不用新增目录掩盖质量问题。
