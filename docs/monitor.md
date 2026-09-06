# 本机多任务监控与退出码迁移

CLI 独立执行并记录事件；Monitor 汇总执行历史和工作流状态，通过 HTTP/SSE 提供给 GUI。服务不调度任务，也不执行发布、重试或取消。

## 启动与发现

```sh
zzp monitor start   # 后台启动，已有实例则复用
zzp monitor serve   # 前台运行，便于诊断
zzp monitor status  # 查询可用状态，不启动服务
zzp monitor stop    # 只停止 Monitor，不停止业务 CLI
```

`start` 返回 JSON：`version`、`instance_id`、`pid`、`url`、`token`。`serve` 也返回描述信息。令牌只交给本机可信调用方，不放进 URL、日志或页面。`monitor` 管理命令不进入 CLI 的日文件日志。

每个系统用户共享一个实例，监听 `127.0.0.1` 动态端口。描述文件、启动锁和事件位于应用配置目录下的 `zzhub-pipeline/monitor/`；macOS 为 `~/Library/Application Support/zzhub-pipeline/monitor/`。目录权限为 0700，事件和描述文件为 0600。服务无 SSE 订阅且 5 分钟没有 API 访问时退出。

`ZZHUB_PIPELINE_MONITOR_DIR` 可隔离测试或独立安装的数据目录。`ZZHUB_PIPELINE_MONITOR=0` 关闭当前调用的事件记录。普通业务命令不自动启动或等待 Monitor。

## HTTP v1

所有请求，包括 health，都携带 `Authorization: Bearer <token>`。首版服务原生本机客户端，不开放任意网页的 CORS。

| 接口 | 响应 |
| --- | --- |
| `GET /v1/health` | `service`、`version`、`instance_id`、`ready`、最近采集异常 `issues` |
| `GET /v1/snapshot` | `version`、`instance_id`、`cursor`、`tasks`、`executions` |
| `GET /v1/executions/:id` | 单次执行详情 |
| `GET /v1/executions/:id/logs?after_seq=0&limit=200` | `logs`、`next_seq`、`truncated`；limit 范围 1–500 |
| `GET /v1/events` | SSE 流，使用 `Last-Event-ID` 或 `?after=<cursor>` |

`snapshot` 和 `events` 支持 `workspace`（绝对路径）、`task_id`、`execution_id` 筛选。快照包含最近 100 次匹配执行及全部匹配的活动执行；任务列表覆盖保留的执行历史，可按 Task 筛选回看其执行。日志使用独立的执行内序号分页读取。

`POST /v1/stop` 仅供 `monitor stop` 管理服务生命周期，必须认证，不影响任何业务进程。

### 接入顺序

1. 调用 `monitor start` 获取本机描述信息。
2. 请求 `/v1/snapshot`，保存快照及其 `cursor`。
3. 以该游标订阅 `/v1/events`，一条连接即可接收多个任务。
4. 按事件更新对应 Execution 或 Task，不使用全局单个 currentTask。
5. 收到 `resync` 时重新取快照并订阅。服务重启后重新发现描述文件，令牌和实例 ID 都可能变化。

浏览器原生 EventSource 不支持自定义 Authorization 头；原生应用用 `fetch` 读取流，Electron 在主进程完成认证，再通过 IPC 向页面转发。

SSE 事件为 `execution.updated`、`task.updated`、`log`，data 包含 `version`、`cursor`、`type`、可选的 `execution_id` / `task_id` 和 `data`。`resync` 不带可续读游标。普通事件 ID 是实例内单调游标，执行文件中另有 `execution_id + seq`，二者不能混用。

快照与游标来自同一投影版本。服务保留最多 1000 条 / 2MB 的重放窗口，游标过期时要求 resync。每连接缓冲限制 256KB，慢客户端断开后重新同步；不反向阻塞 CLI。服务每 500ms 增量扫描，正常本机负载以 1 秒内可见为目标。

## Task、Execution 与进度

- Task ID 来自规范化工作区路径和 run_id，状态文件迁移不会改变身份。
- 每次 CLI 调用都有独立 Execution UUID，包括没有工作流的工具命令。只读命令带 `is_query`，GUI 可隐藏它们。
- Execution 的 `status` 为 `running`、`exited`、`interrupted` 或 `unknown`；`outcome` 为本次业务结果，`exit_code` 是命令退出值。异常中断无法确定退出码时为 null。
- 工作流 `mode`、`phase`、`next_action`、发布结果仍来自原状态文件。一次操作失败不等于整个工作流不可继续。
- `progress` 包含 `stage`、可选消息、`current`、`total`、`unit`、渠道与账号。数量表示已处理页、文件、字节或目标，不表示业务成功率。
- 内置图片渲染报告封面、分页和逐页进度，HTML 导出报告开始/完成，微信上传报告图片数，COS 使用 SDK 字节进度，多目标发布报告当前账号及处理数量。
- 渲染插件输入新增可选 `onProgress`，旧插件忽略它仍兼容；不知道总量时不要构造百分比。

进度同一阶段最多每 200ms 记录一次，阶段变化及完成立即记录。Monitor 用 PID 与可获得的系统启动指纹确认进程身份，不因同步等待 Chrome 或缺少心跳判定失败。不支持或无法查询进程指纹的平台，存活状态可能显示 unknown。

## 记录与故障隔离

事件按 Execution 独立追加 JSONL；没有服务或 GUI 时也记录。采集失败只停用当前记录器，不影响 CLI 的结果。状态变化事件在原状态文件成功写入、释放锁后发出。损坏的行被忽略并报告采集异常，不完整尾行等待后续数据。

默认保留 14 天；单次普通日志内容限制 10MB，达到上限后明确标记 truncated，进度、错误和终态继续记录。Monitor 启动后及运行期间清理历史，总容量目标为 512MB，优先删除最旧的已结束执行；活动记录不删除，因此为软上限。监控未运行时清理延后到下一次启动。

监控不复制完整 argv、环境、stdout JSON、配置或正文。只收集内置诊断通道，对常见凭据和正文参数脱敏、限长。现有日文件日志保持原用途，不能当作监控 API 原样对外提供。外部脚本仅保留开始/结束和失败摘要，不做逐行捕获。

发布成功但预览登记、Nezus 回调或监控不可用，仍算发布成功，诊断信息作为警告。外部系统成功而状态保存失败时必须人工核实，不能按退出 1 无条件重发。

## 退出码迁移

本版默认修正历史上“业务失败但退出 0”的行为，未增加兼容开关：

| 情况 | 退出码 |
| --- | --- |
| 操作成功、幂等跳过、有效 dry-run、等待输入 | 0 |
| 发布全部/部分失败、abandon 失败、校验失败、执行异常 | 1 |
| status 成功查询到一个失败或待重试任务 | 0 |
| checkpoint 校验不通过 | 1 |

成功 JSON 结构保持原样；部分失败仍先保存并输出完整结果，再退出 1。发布错误汇总涵盖 provider 返回 failed 和抛异常两条路径。诊断提示和发布子脚本输出归入 stderr，避免破坏 JSON stdout。

调用方不能在非零退出时丢弃 stdout：其中可能有成功目标和明确错误。拿到失败后读取一次最新状态，保留原错误；不要自动继续下一步或重试发布。

Nezus 桥接返回原有 `item`，并增加可选 `error` 与 `exitCode`。共享发布流程兼容旧 CLI 的退出 0 + failed 结果，也会因新版桥接的执行错误停止推进。

Nezus 的 `useDesktop().pipeline.monitor` 提供 `connect()`、`disconnect()`、`getSnapshot()`、`onMessage(callback)`。先注册消息监听再 connect，connect 返回初始快照；重连时会推送 snapshot 消息。每个窗口共享订阅，disconnect 取消当前窗口订阅；不停止共享 Monitor 服务。现有页面未自动接入监控 UI。
