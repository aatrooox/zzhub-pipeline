# WeChat Visual Studio 排版调优与云端配置同步指南

WeChat Visual Studio 是 `zzhub-pipeline` 内置的所见即所得排版调优工作台。它支持直观调节微信公众号文章的主题色彩、字号行距、语法风格预设（如二级标题柱状/底线/反差绿、表格、代码块）以及提示卡片（Callout）自定义规则，并将最终结果持久化保存到配置文件中。

本文档详细说明：
1. **本地 Visual Studio 的启动与调参方式**
2. **Studio 生成与修改的配置结构**
3. **云端 / 服务器环境下的配置文件同步流程**

---

## 一、 本地启动与排版调优

### 1. 快速启动
在安装有 `@zzclub/pipeline`（或克隆本仓库）的本地环境中执行：

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

当您在 Visual Studio 点击 **「💾 保存配置」** 时，服务端接口会把当前账号的排版参数持久化写入本机的 `config.json`（macOS 位于 `~/Library/Application Support/zzhub-pipeline/config.json`，Linux 位于 `~/.config/zzhub-pipeline/config.json`）。

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
