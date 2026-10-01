# zzhub-pipeline 维护入口

本文记录当前源码的阅读入口和实现边界。用户使用说明以 [README](README.md) 为准；发布版本以对应 Git tag / npm 包为准，不用历史测试数、构建大小或某次部署结果代表当前状态。

## 运行与分发

- 包名：`@zzclub/pipeline`；CLI 别名：`zzp`、`zzhub-pipeline`。
- npm 的 `bin` 指向 `src/cli.ts`，使用 Bun；`bun run build:npm` 的 `dist/cli.js` 是另一个构建产物。
- `bun run build` 生成独立二进制及资源目录；不要把它与 npm 安装入口混淆。
- 浏览器端 HTML 渲染 bundle 由 `bun run build:wechat-preview` 构建。全局安装副本用 `bun install --global .` 更新。
- CJK 字体随资源分发，按需读取本地文件，不在运行时从 CDN 下载。
- Worker 在 `services/cloud-worker/`，不包含在 npm 的 `files` 清单内，需从源码构建镜像。

## 实现边界

| 模块 | 入口 | 约束 |
| --- | --- | --- |
| 工作流 | `src/task-manager.ts`、`src/state.ts`、`src/commands/` | `workflow-state.json` 是业务真相源，按 `next_action` 推进 |
| 渲染插件 | `src/adapter-types.ts`、`src/adapter-loader.ts` | 内置 imgx / Markdown renderer，可用本地或 npm 模块替换 |
| 公众号 provider | `src/providers/wechat.ts` | 调用兼容 `/api/v1/wx/*` 中转服务；文章和贴图都进入草稿箱 |
| 博客 provider | `src/providers/blog.ts` | 固定目录 `content/nezus/YYYY/MM/slug.md`，执行配置的发布命令 |
| 本机 Monitor | `src/monitor/` | HTTP/SSE 观测，不执行任务；业务失败退出 1 |
| Cloud Worker | `services/cloud-worker/` | 私有 HTTP、单进程串行队列、状态轮询；没有通用 serve API |
| 离线正文模板 | `src/article-theme.ts` | 本地校验、快照、渲染；与封面主题独立 |

Cloud Worker 已实现并可从 `services/cloud-worker/` 独立部署。当前源码的账号来自 `accounts.json`，通过账号 API 同步；任务状态不返回凭据，服务令牌与用户 PAT 是两种凭据。`v0.14.0` tag 是初版 Worker，固定旧 tag 时要按该 tag 的账号配置契约运行；npm 包不包含 Worker。

Cloud Worker 关闭子进程 Monitor 和预览登记；目前只返回 `step` 与结果，没有云端 SSE 或逐图片进度。Worker 视正文为已审核，遇到额外补图或修订需求会失败。中断任务保留原 run，核对草稿箱后再决定重试。

## 文档与验证

- [贡献与代码约定](AGENTS.md)
- [云端配置、API、部署更新和恢复](services/cloud-worker/README.md)
- [本机 Monitor 和退出码](docs/monitor.md)
- [封面主题与图片分页](docs/render-themes.md)
- [离线正文模板与语法范围](ARTICLE-THEMES.md)
- README 中的 Cloud Worker 章节（旧 serve 草案不属于当前公开 API）

代码变更按涉及模块运行对应 `bun test <文件>`；浏览器渲染测试需要 Chrome。完整检查命令为 `bun test` 与 `bun x tsc --noEmit`，执行结果应在每次变更中单独报告，不把环境检查、单元测试或 dry-run 当作真实微信发布验收。
