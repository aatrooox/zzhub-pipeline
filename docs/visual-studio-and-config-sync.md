# WeChat Visual Studio 排版调优与云端配置同步指南

WeChat Visual Studio 是 `zzhub-pipeline` 内置的所见即所得排版调优工作台。它支持直观调节微信公众号文章的主题色彩、字号行距、语法风格预设（如二级标题柱状/底线/反差绿、表格、代码块）以及提示卡片（Callout）自定义规则，并将最终结果持久化保存到配置文件中。

本文档详细说明：
1. **本地 Visual Studio 的启动与调参方式**
2. **Studio 生成与修改的配置结构**
3. **云端 / 服务器环境下的配置文件同步流程**

---

## 一、 本地启动与排版调优

### 1. 快速启动
在安装有 `@akairos/pipeline`（或克隆本仓库）的本地环境中执行：

```bash
zzp wechat-preview studio
# 或完整别名
zzhub-pipeline wechat-preview studio
```

该命令会启动轻量本地预览服务（默认端口 `18765`），并**自动在默认浏览器中打开** `http://127.0.0.1:18765/studio`。

> 常用参数：
> - `--port <端口>`：指定监听端口（默认 `18765`，亦可通过环境变量 `ZZHUB_WECHAT_PREVIEW_PORT` 设置）。
> - `--host <地址>`：指定监听地址（默认 `127.0.0.1`）。
> - `--no-open`：后台静默启动服务，不自动弹出系统浏览器。

### 2. 界面核心能力与沙盒机制
* **实时内存沙箱**：拖动滑块、切换预设、调整颜色时，排版引擎仅在浏览器内存中实时重算与渲染，**未点击保存前绝不会写入磁盘**，可随意调试。
* **精选主题配色**：内置冷灰高雅、典雅胭脂、薄荷微风、极简纸墨、极光深紫、经典商业蓝等精选色盘，一键套用。
* **Markdown 语法风格预设**：
  * **二级标题 (H2)**：左侧色柱标、底部强调横线、渐变胶囊、反差底色（绿底白字）、上标卡片、纯文字。
  * **提示卡片 (Callout Alert)**：支持行级自定义 Emoji 与文案（如 `> [!TIP] 🚀 核心秘籍`），支持 5 种标准 GFM 级别（`NOTE` / `TIP` / `IMPORTANT` / `WARNING` / `CAUTION`）。
  * **一键提取 CSS**：右侧预设面板可一键将任一语法的完整 CSS 追加到底部自定义覆盖框，方便针对特定账号进行精细微调。
* **富文本一键复制**：点击右上角「📋 复制富文本」，可直接粘贴至微信公众平台后台草稿箱。

---

## 二、 Studio 生成与保存的配置结构

当您在 Visual Studio 点击 **「💾 保存至账号」** 时，服务端接口会把当前账号的排版参数持久化写入本机的 `config.json`（macOS 位于 `~/Library/Application Support/zzhub-pipeline/config.json`，Linux 位于 `~/.config/zzhub-pipeline/config.json`）。

保存后的配置主要影响 `wx.accounts.<account>` 下的 `theme` 和 `customCss` 字段：

```jsonc
{
  "wx": {
    "defaultAccount": "default",
    "accounts": {
      "default": {
        "name": "我的公众号",
        "appId": "wx_your_app_id",
        "appSecret": "your_app_secret",
        "pat": "your_relay_pat",
        // 自定义 CSS 文件路径（与 config.json 同目录）
        "customCss": "custom-css-default.css",
        "theme": {
          // 1. CSS 变量（前景色、背景色、强调色、分割线等）
          "editorVars": {
            "--primary": "#ca6093",
            "--brand": "#ca6093",
            "--text": "#202124",
            "--divider": "#dadce0"
          },
          // 2. 导出时全局字体与版心规则
          "exportTheme": {
            "fontSize": "16px",
            "bodyLineHeight": "1.84",
            "bodyLetterSpacing": "0.02em",
            "primaryColor": "#ca6093",
            "bodyColor": "#202124",
            "h2Color": "#1f1b1c",
            "h3Color": "#5c5658"
          },
          // 3. 选中的 Markdown 语法风格预设 ID
          "syntaxPresets": {
            "h2": "pillar",
            "h3": "left-bar",
            "code": "mac-style",
            "table": "striped"
          },
          // 4. 结构与文案预设
          "structure": {
            "numberedHeadings": false,
            "headingLabel": "SECTION",
            "quoteLabel": "NOTE",
            // 提示卡片账号级全局默认文案与 Emoji
            "calloutPresets": {
              "note": { "icon": "💡", "title": "提示" },
              "tip": { "icon": "✨", "title": "建议" },
              "warning": { "icon": "⚠️", "title": "警告" }
            }
          }
        }
      }
    }
  }
}
```

---

### 独立排版配置导出与选择

点击 **「📤 导出配置」** 会下载 `wechat-style.json`，不写入账号配置。文件包含当前字号、颜色、语法预设、结构设置、自定义 CSS，以及当前正文模板的 CSS 和内嵌页首图片；不含账号标识、PAT、App ID 或 App Secret。可以重命名并保存多份配置。

独立 JSON 复用现有的 `--article-theme` 参数：

```bash
# 校验导出的单文件
zzp article-theme --path ./styles/wechat-style.json

# 单次 HTML 排版选择，与发布账号分开
zzp wechat-export --markdown ./article.md --out ./article.html \
  --account ancientone --article-theme ./styles/wechat-style.json --no-preview

# 初始化任务时保存选择，或发布已有任务时切换
zzp init --workspace ./workspace --task-kind publish --content-origin user \
  --content-form article --targets wechat --article-theme ./styles/wechat-style.json
zzp publish --state ./workflow-state.json --article-theme ./styles/another-style.json
```

独立配置使用自身样式，不叠加目标账号的 `theme` 或 `customCss`；`wechat-export --custom-css` 仍可显式添加本次覆盖。原有目录模板继续沿用账号覆盖规则。正文配置不改变封面模板与固定素材。

账号默认引用独立 JSON 后，Studio 加载该文件的样式供调试；「保存至账号」会禁用并提示使用「导出配置」保存调整，再替换原文件，避免把不会生效的覆盖写入账号。

独立文件沿用正文模板校验规则：文件最多 5 MiB，CSS 最多 256k 字符，不支持 `url()`、`@import`、CSS 转义或可执行表达式。页首图片支持内嵌 PNG、JPEG、GIF、WebP。使用自定义 Markdown 渲染插件时，插件需支持现有 `articleThemePath` 参数。

### 复用统一部署流程

独立 JSON 与默认配置、封面模板和 Typeset Studio 固定素材一样属于运行时配置资产，无需加入 npm 包或镜像。只需复制或挂载文件，并用部署环境中的路径引用。

默认配置可通过 `wx.accounts.<account>.articleTheme` 引用它，相对路径基于默认配置文件所在目录；多个账号可引用同一个文件：

```json
{
  "wx": {
    "accounts": {
      "default": { "articleTheme": "styles/wechat-style.json" },
      "ancientone": { "articleTheme": "styles/wechat-style.json" }
    }
  }
}
```

这里仅展示配置字段，应合并到已有配置并保留凭据。`ZZHUB_PIPELINE_CONFIG` 选择整份 Pipeline 默认配置，`--article-theme` 选择正文样式文件，二者职责不同。

沿用现有 **`typeset-assets-sync` → `nezus-infra sync pipeline-runtime`** 流程时，先在本地默认配置中引用独立 JSON，再执行：

```bash
zzp typeset-assets-sync --output ./pipeline-runtime
# Worker 账号键与本地不同则沿用 --account-map
zzp typeset-assets-sync --output ./pipeline-runtime --account-map '{"default":"WORKER_ACCOUNT_KEY"}'
```

该命令将账号引用的独立 JSON 与 Markdown 样式、Typeset Studio 模板及默认槽位一起收集到运行时包，改写为容器路径并生成文件哈希清单。固定封面素材继续按原流程上传 COS、改写为 HTTPS URL。服务器同步命令继续校验清单、合并配置白名单、备份并切换，不需要新增部署入口。详见 [README 运行时配置包](../README.md) 与 [封面模板和固定素材](render-themes.md)。

直接挂载时，同时挂载默认配置与其引用的 `styles/` 目录；Cloud Worker 使用 `PIPELINE_CONFIG_FILE` 指定默认配置。当前 Worker 任务 API 未提供单次正文配置选择字段，云端任务通过服务器默认配置引用。未被账号引用的备用 JSON 需要自行复制或挂载，`typeset-assets-sync` 不会扫描任意样式目录。

---

## 三、 云端服务器配置同步流程

### 为什么云端需要同步配置文件？
在典型的生产环境（如通过 Docker 部署的私有 Cloud Worker）中：
* **Cloud Worker 是无头（Headless）服务**：为了服务器精简与安全，云端容器不暴露任何交互式界面，只通过挂载只读配置文件（如 `/run/secrets/pipeline.json:ro`）驱动发布流水线。
* **Studio 是本地交互工具**：人工调参在本地电脑完成，满意后只需将生成的 `theme` 参数同步到云端即可生效。

### 标准同步步骤（备份 ➔ 合并/上传 ➔ 重载）

#### 步骤 1：SSH 备份远端当前运行的配置文件
在本地终端通过 SSH 备份服务器上的配置，避免误操作导致网络凭据丢失：

```bash
# 以 nezus.cn 上的 pipeline-worker 为例
ssh your-server "cp /srv/nezus/pipeline-worker/config/pipeline.json /srv/nezus/pipeline-worker/config/pipeline.json.bak-\$(date +%Y%m%d%H%M%S)"
```

#### 步骤 2：同步更新样式与主题配置
将本地调好的 `theme` 字段以及附带的 `custom-css-*.css` 文件同步到远端服务器。

> **重要注意**：云端服务器的 `pipeline.json` 通常包含特定于服务器内网的配置（例如 `wx.baseUrl` 指向容器内网 `http://nezus-api:3000`，以及服务器端专有的中转 Token）。**请勿盲目用本地含有 `http://127.0.0.1` 的配置全量覆盖远端网络字段。**

**推荐方式 A（仅上传自定义 CSS 与更新后的配置文件）：**
如果您已经在本地将远端的凭据和本地的新 `theme` 整合到了一个新文件（例如 `server-pipeline.json`）：
```bash
# 上传配置文件
scp server-pipeline.json your-server:/srv/nezus/pipeline-worker/config/pipeline.json

# 如有自定义 CSS 文件，一并上传
scp ~/Library/Application\ Support/zzhub-pipeline/custom-css-default.css your-server:/srv/nezus/pipeline-worker/config/
```

**推荐方式 B（使用 jq 在远端自动合并 theme 字段）：**
如果远端安装了 `jq`，可以只提取本地的 `theme` 并远程合并：
```bash
# 提取本地 default 账号的 theme 并在远端原子合并
LOCAL_THEME=$(jq '.wx.accounts.default.theme' ~/Library/Application\ Support/zzhub-pipeline/config.json)
ssh your-server "jq --argjson theme '$LOCAL_THEME' '.wx.accounts.default.theme = \$theme' /srv/nezus/pipeline-worker/config/pipeline.json > /tmp/p.json && mv /tmp/p.json /srv/nezus/pipeline-worker/config/pipeline.json"
```

#### 步骤 3：严格收紧文件权限
云端敏感配置文件必须保持 `0600`：
```bash
ssh your-server "chmod 600 /srv/nezus/pipeline-worker/config/pipeline.json"
```

#### 步骤 4：重启 Worker 容器重载配置
Docker Compose 挂载单文件后，重启 Worker 容器使配置生效：
```bash
ssh your-server "cd /srv/nezus/stack && sudo docker compose restart pipeline-worker"
```

---

## 四、 进阶：直接在云端服务器部署 Studio（可选）

如果您希望团队其他成员能直接通过浏览器公网远程访问 Visual Studio：

1. **以无头常驻模式启动**：
   ```bash
   zzp wechat-preview studio --no-open --port 18765
   ```
2. **使用 PM2 或 Systemd 守护进程**：
   ```bash
   pm2 start "zzp wechat-preview studio --no-open --port 18765" --name "wechat-studio"
   ```
3. **安全防护（必须）**：
   Studio 的保存按钮会直接写入宿主机配置，暴露公网时必须在反向代理层（如 Nginx / Caddy）加上 **HTTP Basic Auth**（密码验证）或挂在内部 VPN（如 Tailscale）网络后。
