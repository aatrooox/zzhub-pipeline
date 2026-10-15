# Cloud Worker：私有云端执行服务

Worker 接收完整正文，串行调用本仓库的 CLI，按 `status → next_action` 推进到微信公众号文章或贴图草稿。Pipeline 状态机仍是业务真相源；Worker 只管理队列、执行和查询，不包含 LLM 写稿、用户登录、计费或公众号中转服务。

> 云端 Worker 已实现并可从本仓库独立部署。本文描述当前源码：账号通过 `accounts.json` 和账号 API 管理，任务通过 HTTP 提交并轮询。`v0.14.0` tag 的初版 Worker 使用 Pipeline 配置中的账号，若固定到该旧 tag，请按对应源码和文档部署。Worker 位于 `services/`，不包含在 npm 包中。

推荐调用链：

```text
Web / App / 桌面端 → 业务后端 → 私有 Worker → Pipeline CLI → 微信中转 API → 微信草稿箱
```

Worker 是 [Pipeline](../../README.md) 仓库中的部署组件，不是独立 npm 包。现有应用消费方包括 Nezus 后端；其他后端可按本文 HTTP 契约接入，无需依赖该应用。正文可通过 [myno](https://github.com/k7airos/myno) 排版，封面与贴图可通过 [Typeset Studio](https://github.com/k7airos/typeset-studio) 渲染，均由 Pipeline 配置选择。

Pipeline 0.19.1 固定安装 myno 0.3.1，并从 myno 复用正文 CSS。完整 myno 排版配置示例：

```json
{
  "plugins": {
    "markdownRenderer": { "module": "@akairos/myno/adapter", "options": {} }
  }
}
```

镜像需要包含可解析的插件包；myno 提供排版资源，Chrome、超时清理和输出由 Pipeline 管理。Worker 本身不托管 Studio 页面。

业务后端负责用户鉴权、账号与任务归属、配额、请求内容校验和幂等键隔离。Worker 的服务令牌允许访问所有任务及账号，不能下发到客户端，也不能仅检查登录后就透传客户端提供的账号键或任务 ID。

## 本机启动

先按[主 README](../../README.md)安装 Bun、依赖和 Chrome/Chromium。准备服务端配置文件，至少包含兼容微信中转服务的地址：

```json
{
  "wx": { "baseUrl": "https://wx-api.example.com" }
}
```

`wx.baseUrl` 不能直接指向微信官方 API；中转服务需实现 `/api/v1/wx/*` 契约，详见[账号与外部服务](../../README.md#微信账号与外部服务)。账号凭据通过下文的账号接口写入，配置文件还可保存排版、Logo 等默认值。

在仓库根目录运行（替换配置路径，令牌由调用后端安全保存）：

```bash
export PIPELINE_WORKER_TOKEN="$(openssl rand -hex 32)"
PIPELINE_WORKSPACE_ROOT="$HOME/.local/share/zzhub-pipeline-worker" \
PIPELINE_WORKER_STATE_FILE="$HOME/.local/share/zzhub-pipeline-worker/jobs.json" \
PIPELINE_CONFIG_FILE=/absolute/path/to/pipeline.json \
bun run services/cloud-worker/server.ts
```

默认监听 `127.0.0.1:18887`。调用方使用同一个令牌；包括健康检查在内，所有接口均要求 `Authorization: Bearer <PIPELINE_WORKER_TOKEN>`。令牌由部署环境生成、保存和轮换，Worker 只校验，不签发或管理用户 token。

## Docker 部署

仓库自带的 [Dockerfile](Dockerfile) 使用 Bun 1.3.14，并安装 Chromium 与 CJK 字体，云端不需要桌面浏览器或 Electron。先准备外部配置文件、数据目录和已导出的 `PIPELINE_WORKER_TOKEN`，再运行：

```bash
docker build -f services/cloud-worker/Dockerfile -t zzhub-pipeline-worker:local .
docker network create pipeline-internal

docker run -d --name pipeline-worker --restart unless-stopped \
  --network pipeline-internal \
  -e PIPELINE_WORKER_TOKEN \
  -e PIPELINE_WORKER_HOST=0.0.0.0 \
  -e PIPELINE_WORKER_PRIVATE_NETWORK=1 \
  -e PIPELINE_CONFIG_FILE=/run/secrets/pipeline.json \
  --mount type=bind,src=/absolute/path/to/pipeline.json,dst=/run/secrets/pipeline.json,readonly \
  --mount type=bind,src=/absolute/path/to/worker-data,dst=/data \
  zzhub-pipeline-worker:local
```

`pipeline-internal` 是示例网络名。将获准访问的业务后端加入该网络，通过 `http://pipeline-worker:18887` 调用；不要添加公网端口映射或公网反代。仅供宿主机验收时，可加 `-p 127.0.0.1:18887:18887`。Worker 还需要访问中转服务及正文图片地址；网络隔离不能阻断这些必需的出站请求。

`PIPELINE_WORKER_PRIVATE_NETWORK=1` 仅允许绑定非回环地址，实际隔离由部署网络保证。镜像没有内置凭据，配置与数据放在镜像外。示例适用于自行部署，不要求使用 Nezus 或其内部运维仓库。

### 环境变量

| 变量 | 默认值 / 作用 |
| --- | --- |
| `PIPELINE_WORKER_TOKEN` | 必填；后端访问 Worker 的共享服务令牌 |
| `PIPELINE_WORKER_HOST` | `127.0.0.1` |
| `PIPELINE_WORKER_PORT` | `18887` |
| `PIPELINE_WORKER_PRIVATE_NETWORK` | 非回环监听时必须显式设为 `1` |
| `PIPELINE_WORKSPACE_ROOT` | `/data/pipeline-worker`，每个 job 建立独立工作目录 |
| `PIPELINE_WORKER_STATE_FILE` | `/data/pipeline-worker/jobs.json`，队列与正文存储 |
| `PIPELINE_WORKER_ACCOUNT_STATE_FILE` | 默认与 `jobs.json` 同目录的 `accounts.json` |
| `PIPELINE_CONFIG_FILE` | 传给子进程的 Pipeline 配置路径；未设时遵循 CLI 配置发现规则 |
| `ZZHUB_WX_BASE_URL` | 可覆盖配置中的微信中转服务地址 |
| `ZZHUB_PIPELINE_BRANDING_LOGO` | Docker 默认使用镜像内 Logo；可指定容器内已挂载图片路径 |
| `PIPELINE_ROOT` / `BUN_BIN` | 可覆盖源码根目录 / Bun 可执行路径，一般无需设置 |

Worker 每次执行从账号存储读取 `appId`、`appSecret`、`pat`，通过子进程环境注入；不接受在任务正文参数里传入凭据。Pipeline 基础配置中的账号可提供样式，但当前 Worker 不会用它替代账号存储中的注册。

## HTTP API

下列 curl 示例用于本机监听或宿主机回环映射；在业务后端容器中将地址换为 `http://pipeline-worker:18887`。

| 方法与路径 | 行为 |
| --- | --- |
| `GET /health` | 返回服务状态、排队数、是否正在处理队列及已同步账号数 |
| `PUT /v1/maintenance` | `{ "enabled": true/false }` 暂停或恢复接收新任务；已有任务继续，重复幂等请求仍返回原任务 |
| `PUT /v1/accounts/:account` | 创建或替换公众号凭据，返回账号键和 `active` |
| `DELETE /v1/accounts/:account` | 删除同步的凭据，返回 `deleted`；不删除微信草稿 |
| `POST /v1/jobs` | 新任务返回 `202`；相同幂等键及内容返回原任务 `200` |
| `GET /v1/jobs/:id` | 查询任务；不存在返回 `404` |

未认证为 `401`，非法输入为 `400`，相同幂等键对应不同输入为 `409 idempotency_conflict`。提交任务时 `Content-Length` 超过 2,500,000 字节会返回 `413`。当前没有任务列表、取消、重试、SSE 或文件上传接口。

### 正文样式快照

新源码的 `/health` 包含 `capabilities.articleStyleSchemaVersions: [1]`。调用方有样式时必须先确认该能力；旧 Worker 缺此字段，不能假设它会应用未知参数。无样式请求不增加字段，沿用原请求 hash 和执行方式。

业务后端通过 `@akairos/pipeline/article-style` 的 `createArticleStyleSnapshot(manifest, id, revision)` 创建快照，用 `validateArticleStyleSnapshot(value)` 复查与验证 hash。可选 `articleStyle` 仅用于 article，格式为 `{ schemaVersion: 1, id, revision, manifest, hash }`；根 id 必须等于 manifest.id。身份字段沿用 ArticleThemeSchema，revision 为正整数。manifest 只支持 `editorVars.--brand`、`exportTheme.bodyFontSize`（12–24px）、`bodyLineHeight`（1.2–2.4）、`primaryColor`、`h2Color` 与 `syntaxPresets.h2`（pillar/bottom-line/plain）。颜色仅 `#RRGGBB`，归一化小写；数值去多余零。css 缺省为空且只允许空字符串；structure、资源、字体、路径、模块及其他字段均拒绝。

Worker 严格验证后持久化 `input.articleStyle`，执行时写入 job 私有 `article-style.json` 并传给 CLI `init --article-theme`，不修改共享配置。`result.articleStyleHash` 是规范化 manifest 的 SHA-256；`result.articleThemeHash` 是现有 CLI 加入主题默认字段后的独立 hash，与实际发布结果 `article_theme_hash` 核对，两者不要求相等。这样可以从请求快照、私有文件追踪到 CLI 发布主题；未知版本、篡改或主题不匹配明确失败，不回落默认样式继续确认成功。

维护模式下提交新任务返回 `503 worker_maintenance`，`/health` 增加 `maintenance`。该开关持久化在任务存储旁，重启后仍保持暂停，必须显式恢复。更新时暂停并等待队列清空，再备份、停止 Worker、切换配置并重建容器，验收后恢复。图片插件和 myno 都使用镜像内的 npm 入口，不要求独立 Studio 服务或管理员密钥。运行时资产可同步到 `/data/pipeline-runtime`，业务凭据仍在 `accounts.json`，详见[运行时配置指南](../../docs/visual-studio-and-config-sync.md)。

### 1. 同步账号

准备受控的 `account.json`（不要提交到 Git）：

```json
{
  "appId": "YOUR_WECHAT_APP_ID",
  "appSecret": "YOUR_WECHAT_APP_SECRET",
  "pat": "YOUR_RELAY_API_PAT"
}
```

```bash
curl -X PUT http://127.0.0.1:18887/v1/accounts/my-account \
  -H "Authorization: Bearer ${PIPELINE_WORKER_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary @account.json
```

账号键只允许字母、数字、`_`、`.`、`-`，注册时长度为 1–80。三个凭据必填；可选 `account` 字段必须与路径一致。凭据以文件权限 `0600` 写入 `accounts.json`，并非加密保管库，数据卷与备份需要限制访问。任务响应不包含这些凭据。

### 2. 提交完整正文

`job.json`：

```json
{
  "idempotencyKey": "user-123:article-456:revision-1",
  "title": "Pipeline 云端草稿示例",
  "body": "# Pipeline 云端草稿示例\n\n这是一篇已确认的 Markdown 正文。",
  "contentForm": "article",
  "account": "my-account"
}
```

```bash
curl -X POST http://127.0.0.1:18887/v1/jobs \
  -H "Authorization: Bearer ${PIPELINE_WORKER_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data-binary @job.json
```

| 字段 | 约束 |
| --- | --- |
| `idempotencyKey` | 必填，最多 200 字符；后端应绑定用户、内容和修订版本 |
| `title` | 必填，最多 255 字符 |
| `body` | 必填，完整 Markdown；代码按 JS 字符串长度限制为 2,000,000 |
| `contentForm` | 必填，`article` 或 `newspic` |
| `account` | 必填，已经通过账号接口注册的键 |
| `intentText` | 可选，发布意图；默认使用标题 |
| `existingDraftMediaId` | 可选，更新已有草稿；必须属于目标公众号 |

Worker 不提供客户端本地文件传输。正文内的图片必须在 Worker 环境中可读取，例如可访问的 HTTP(S) 图片或在请求大小范围内的 Base64 图片；客户端本机路径不会自动上传。当前任务接口没有正文模板/封面主题选择字段；默认样式可由服务端配置提供。

Worker 将正文视为调用方已确认的内容，遇到 `review-content` 会执行 `review --status passed`，这不代表进行过模型或人工审核。需要补图、修订或其他未支持动作时，会返回失败而不会调用外部 Agent。

### 3. 查询步骤与结果

把 `JOB_ID` 替换为提交响应里的 `id`：

```bash
curl http://127.0.0.1:18887/v1/jobs/JOB_ID \
  -H "Authorization: Bearer ${PIPELINE_WORKER_TOKEN}"
```

主要字段：

- `id`、`status`、`step`、`createdAt`、`updatedAt`、`startedAt`、`finishedAt`：队列身份、阶段和时间。
- `input`：提交元数据，不含 `body`；`requestHash` 用于幂等冲突校验。
- `runId`、`statePath`：原 Pipeline run 及服务端状态路径。
- `result.publishResults`：发布结果，成功目标含 `external_id`（微信草稿 `media_id`）。
- `error`：失败或中断说明；发布失败时 `result` 也可能保留已有业务结果。
- `progress`：运行中的当前 CLI 动作若已记录进度，附带 `stage`、可选 `message/current/total/unit`；轮询获取，不是 SSE，也不保证每个动作都有进度。

调用后端保存账号时可使用 `PUT /v1/accounts/:account` 同步公众号凭据；Nezus 已采用此路径。凭据只写入 Worker 的持久卷 `accounts.json`，不进入任务请求或任务状态响应。删除账号使用 `DELETE /v1/accounts/:account`。

`job.json` 至少包含 `idempotencyKey`、`title`、`body`、`contentForm`（`article` 或 `newspic`）和 `account`。用 `GET /v1/jobs/:id` 轮询状态；`succeeded` 表示 Pipeline 已完成目标发布，`failed` 的原因在 `error`。同一个 `idempotencyKey` 会返回原任务，不会重复入队。

生产环境至少配置 `PIPELINE_WORKER_TOKEN`、`PIPELINE_WORKSPACE_ROOT`、`PIPELINE_WORKER_STATE_FILE` 和挂载的 `PIPELINE_CONFIG_FILE`。基础配置保存排版与默认值；Nezus 同步的账号凭据保存到 worker 数据卷的 `accounts.json`。

状态为 `queued → running → succeeded / failed`；服务重启时发现原来在运行的任务，会标记 `interrupted`。成功要求 Pipeline 已完成，并有该账号成功的草稿 `media_id`，不代表文章已经公开发布。

`step` 可能为 `queued`、`starting`、`attach-body`、`prepare`、`review-content`、`prepare-finalize`、`render`、`publish`、`done`。Worker 为每个任务隔离 CLI 事件记录，只投影当前动作的可用进度，不返回原始日志或提供云端 SSE。[本机 Monitor](../../docs/monitor.md) 的 HTTP/SSE 是另一套接口。

查询响应包含服务端路径等内部信息。业务后端应生成面向用户的响应，保留自己的账号绑定和 job 归属，不直接公开 Worker 原始接口。

## 幂等、恢复与更新

相同 `idempotencyKey` 且输入一致时，返回已存任务，包含已经失败或中断的任务；不会重新入队。输入变化必须使用新的键。键在整个 Worker 内共享，由业务后端隔离不同用户。

`jobs.json` 持久化任务和正文，每个工作区位于 `<PIPELINE_WORKSPACE_ROOT>/jobs/<job-id>/`。重启后 `queued` 任务继续执行，`running` 任务标记为 `interrupted`，不自动重发。没有任务历史自动清理或多副本锁；只运行一个 Worker 进程管理该数据目录。

出现 `WX_RESULT_UNKNOWN`、超时或 `interrupted` 时，先检查原 Pipeline run 和微信草稿箱。确认已创建草稿后，后续修订可通过 `existingDraftMediaId` 更新；确认需要新任务后再分配新的幂等键。不要通过更换键来盲目重试，否则可能重复建草稿。

更新流程：

1. 暂停业务后端提交，等待队列清空且 `/health` 的 `running` 为 `false`。健康状态不证明公众号凭据可用。
2. 备份配置、`jobs.json`、`accounts.json` 和工作目录；检出指定 tag/commit，使用该 revision 作为镜像标签构建新镜像。
3. 用新镜像重建容器，沿用相同令牌、挂载路径与网络。停止容器不会删除绑定挂载数据；不要删数据目录。
4. 检查认证后的 `/health`、旧任务可查询，再提交一篇草稿验收，核对最终 `media_id` 与草稿箱。

Worker 镜像可以独立于前端更新；账号同步等 API 变更仍需与业务后端协调。此实现是单进程 JSON 队列，不具备多副本调度或自动故障重试能力。

边界测试：`bun test services/cloud-worker/server.test.ts`（临时目录内验证鉴权、账号接口和监听限制，不等同于真实微信发布验收）。

### 贴图发送副本

`contentForm=newspic` 可传 `newspic: { content, photos }`：`content` 是用户确认的纯文本，`photos` 为 0–20 个 HTTP(S) 图片地址。未上传图片（空数组或未传副本）时，Worker 通过原状态机生成封面和分页内容图；最多 19 张内容图，另加 1 张封面。上传图片时直接使用这些图片，顺序即草稿配图顺序，首图作为封面，跳过自动生成。副本通过 `init --newspic-file` 传递，正文原样发送，不修改来源笔记。
