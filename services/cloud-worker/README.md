# Cloud worker

这是 Pipeline 的第一版云端执行进程。它负责任务接收、单 worker 串行执行和任务状态查询，实际工作仍由仓库里的 `src/cli.ts` 完成。worker 是内部服务，Pipeline 核心继续保持 CLI；Nezus 后端或同机服务通过 HTTP 契约消费它，Web、App、Tauri 不直接访问 worker。

```bash
PIPELINE_WORKER_TOKEN=dev-token \
PIPELINE_WORKSPACE_ROOT=/tmp/zzhub-pipeline-worker \
PIPELINE_WORKER_STATE_FILE=/tmp/zzhub-pipeline-worker/jobs.json \
PIPELINE_CONFIG_FILE="$HOME/Library/Application Support/zzhub-pipeline/config.json" \
bun run services/cloud-worker/server.ts
```

本机运行默认只监听 `127.0.0.1`。Docker 运行时，把只读的 Pipeline 配置挂载到容器，并把微信服务地址放在 worker 环境中。生产容器加入应用内部网络，不发布端口、不配置公网域名：

```bash
docker build -f services/cloud-worker/Dockerfile -t zzhub-pipeline-worker .
docker run --rm --network app-internal --name pipeline-worker \
  -e PIPELINE_WORKER_TOKEN='change-me' \
  -e PIPELINE_WORKER_HOST=0.0.0.0 \
  -e PIPELINE_WORKER_PRIVATE_NETWORK=1 \
  -e PIPELINE_CONFIG_FILE=/run/secrets/pipeline.json \
  -e ZZHUB_WX_BASE_URL='https://app.nezus.cn' \
  -v /srv/zzhub/pipeline.json:/run/secrets/pipeline.json:ro \
  -v /srv/zzhub/pipeline-data:/data \
  zzhub-pipeline-worker
```

`--network app-internal` 只是示例内部网络名；Nezus 通过 `http://pipeline-worker:18887` 调用。不要使用 `-p 18887:18887`，也不要给 worker 配公网反代。若只需从宿主机临时验收，可使用 `-p 127.0.0.1:18887:18887`。

`PIPELINE_WORKER_PRIVATE_NETWORK=1` 只是非回环监听的显式开关；真正的网络隔离由 Docker 的网络和端口配置保证。

提交文章草稿：

```bash
curl -X POST http://127.0.0.1:18887/v1/jobs \
  -H 'Authorization: Bearer dev-token' \
  -H 'Content-Type: application/json' \
  -d @job.json
```

健康检查也需要服务令牌：

```bash
curl http://127.0.0.1:18887/health -H 'Authorization: Bearer dev-token'
```

Nezus 首次保存账号时，会通过同一个内网令牌调用 `PUT /v1/accounts/:account` 同步公众号凭据；凭据只写入 worker 的持久卷 `accounts.json`，不进入任务请求或任务状态响应。删除账号使用 `DELETE /v1/accounts/:account`。

`job.json` 至少包含 `idempotencyKey`、`title`、`body`、`contentForm`（`article` 或 `newspic`）和 `account`。用 `GET /v1/jobs/:id` 轮询状态；`succeeded` 表示 Pipeline 已完成目标发布，`failed` 的原因在 `error`。同一个 `idempotencyKey` 会返回原任务，不会重复入队。

生产环境至少配置 `PIPELINE_WORKER_TOKEN`、`PIPELINE_WORKSPACE_ROOT`、`PIPELINE_WORKER_STATE_FILE` 和挂载的 `PIPELINE_CONFIG_FILE`。基础配置保存排版与默认值；Nezus 同步的账号凭据保存到 worker 数据卷的 `accounts.json`。

Docker 镜像默认用镜像内置的 `src/imgx/assets/icons/logo.png` 生成封面，避免把桌面配置中的本机 logo 路径带进云端；如需品牌图，把 `ZZHUB_PIPELINE_BRANDING_LOGO` 指向容器内的挂载路径。

首版是单进程、单 worker，状态和工作目录需要挂载持久卷。扩容前应把 `JobStore` 换成数据库队列，并把账号凭据改为按用户授权的密钥引用。`PIPELINE_WORKER_TOKEN` 由部署环境注入，worker 只负责校验它；它不是用户登录 token，也不是公众号 PAT。用户级鉴权、配额和公网 API 由 Nezus 负责，Nezus 后端再用这个服务令牌访问内部 worker。

调用链是 `Web / App / 桌面 → Nezus 业务 API → 内部 worker → Pipeline CLI`。业务 API 必须校验内容、任务和公众号账号归属，并为调用方生成隔离的幂等键；不能仅检查登录后就透传客户端给定的 `account` 或任意任务 ID。当前尚未接入 Nezus 的云端发布业务 API。

## 生产更新

Nezus 生产机统一使用相邻 `nezus-infra` 仓库的 `pipeline-worker` Compose 服务：

```bash
cd ../nezus-infra
./bin/nezus deploy pipeline-worker <已推送的-pipeline-commit>
./bin/nezus logs pipeline-worker
```

worker 只连接专用 `nezus_pipeline` 网络，没有宿主机端口和 Caddy 路由。Nezus 与其他获准接入此网络的后端通过 `http://pipeline-worker:18887` 调用；worker 的微信代理请求通过同网络的 `http://nezus-app:3000` 发送。

环境文件为服务器 `/srv/nezus/pipeline-worker/worker.env`，账号配置为同目录的 `config/pipeline.json`，均需保持 `0600`；数据卷为 `data/`，更新镜像时保留。密钥不打进镜像、不下发客户端。更新前等待当前任务完成；意外重启中的任务标记为 `interrupted`，检查原 Pipeline run 和草稿箱后再决定是否重试。

本次边界回归可运行 `bun test services/cloud-worker/server.test.ts`。

### 贴图发送副本

`contentForm=newspic` 可传 `newspic: { content, photos }`：`content` 是用户确认的纯文本，`photos` 为 1–20 个 HTTP(S) 图片地址，顺序即草稿配图顺序，首图作为封面。Worker 将副本写入任务目录，通过 `init --newspic-file` 交给原状态机；直接上传这些图片，正文原样发送，不生成海报，不改来源笔记。未传副本的任务继续沿用正文图片提取；显式 `newspic_render` 仍使用原海报排版。
