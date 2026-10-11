import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { WechatMarkdownPlugin } from "./types";
import type { WechatElementRenderer } from "../wechat-renderer";

export interface CalloutMeta {
  title: string;
  icon: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
}

export const CALLOUT_PRESETS: Record<string, CalloutMeta> = {
  note: {
    title: "提示",
    icon: "💡",
    borderColor: "#3b82f6",
    bgColor: "rgba(59, 130, 246, 0.08)",
    textColor: "#1d4ed8",
  },
  tip: {
    title: "建议",
    icon: "✨",
    borderColor: "#10b981",
    bgColor: "rgba(16, 185, 129, 0.08)",
    textColor: "#047857",
  },
  important: {
    title: "重点",
    icon: "📌",
    borderColor: "#8b5cf6",
    bgColor: "rgba(139, 92, 246, 0.08)",
    textColor: "#6d28d9",
  },
  warning: {
    title: "警告",
    icon: "⚠️",
    borderColor: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.08)",
    textColor: "#b45309",
  },
  caution: {
    title: "注意",
    icon: "🛑",
    borderColor: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.08)",
    textColor: "#b91c1c",
  },
};

/** Remark AST plugin: transforms GFM alert blockquote into callout node. */
export function remarkCallout() {
  return (tree: any) => {
    function visit(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.type === "blockquote" && Array.isArray(node.children) && node.children.length > 0) {
        const firstParagraph = node.children[0];
        if (
          firstParagraph &&
          firstParagraph.type === "paragraph" &&
          Array.isArray(firstParagraph.children) &&
          firstParagraph.children.length > 0
        ) {
          const firstText = firstParagraph.children[0];
          if (firstText && firstText.type === "text" && typeof firstText.value === "string") {
            const match = firstText.value.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:[ \t]+([^\r\n]+))?(?:\r?\n|$)/i);
            if (match) {
              const rawType = match[1].toLowerCase();
              const customTitle = match[2] ? match[2].trim() : "";
              // Strip the [!TAG] marker
              firstText.value = firstText.value.slice(match[0].length);
              if (!firstText.value.trim() && firstParagraph.children.length > 1) {
                firstParagraph.children.shift();
              } else if (!firstText.value.trim() && firstParagraph.children.length === 1) {
                node.children.shift();
              }
              node.type = "callout";
              node.calloutType = rawType;
              node.customTitle = customTitle;
            }
          }
        }
      }
      if (Array.isArray(node.children)) {
        for (const child of node.children) {
          visit(child);
        }
      }
    }
    visit(tree);
  };
}

export const calloutMilkdownPlugins = [
  $remark("remarkCallout", () => remarkCallout as any),
  $nodeSchema("callout", () => ({
    content: "block+",
    group: "block",
    defining: true,
    attrs: {
      type: { default: "note" },
      title: { default: "" },
    },
    parseDOM: [
      {
        tag: "section[data-wechat-node='callout']",
        getAttrs: (dom) => ({
          type: (dom as HTMLElement).getAttribute("data-callout-type") || "note",
          title: (dom as HTMLElement).getAttribute("data-callout-title") || "",
        }),
      },
    ],
    toDOM: (node) => [
      "section",
      {
        class: `wechat-callout wechat-callout-${node.attrs.type}`,
        "data-wechat-node": "callout",
        "data-callout-type": node.attrs.type,
        ...(node.attrs.title ? { "data-callout-title": node.attrs.title } : {}),
      },
      0,
    ],
    parseMarkdown: {
      match: (node) => node.type === "callout",
      runner: (state, node, type) => {
        state.openNode(type, {
          type: node.calloutType || "note",
          title: node.customTitle || "",
        });
        state.next(node.children);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "callout",
      runner: (state, node) => {
        state.openNode("blockquote");
        state.next(node.content);
        state.closeNode();
      },
    },
  })),
].flat();

export const calloutWechatRenderer: WechatElementRenderer = {
  kind: "callout",
  selector: 'section[data-wechat-node="callout"]',
  prepare(element, context) {
    const type = element.getAttribute("data-callout-type") || "note";
    const customTitleAttr = element.getAttribute("data-callout-title");
    const configuredPreset = context.structure?.calloutPresets?.[type];
    const basePreset = CALLOUT_PRESETS[type] || CALLOUT_PRESETS.note;
    const preset = {
      ...basePreset,
      ...configuredPreset,
    };

    let iconText = preset.icon;
    let titleText = preset.title;

    if (customTitleAttr && customTitleAttr.trim()) {
      const trimmed = customTitleAttr.trim();
      const emojiMatch = trimmed.match(/^(\p{Extended_Pictographic}|\p{Emoji_Presentation})\s*(.*)$/u);
      if (emojiMatch) {
        iconText = emojiMatch[1];
        titleText = emojiMatch[2].trim() || preset.title;
      } else {
        titleText = trimmed;
      }
    }

    // Build callout header section
    const header = context.document.createElement("section");
    header.className = "wechat-callout-header";
    header.setAttribute("data-wechat-node", "callout-header");

    const icon = context.document.createElement("span");
    icon.className = "wechat-callout-icon";
    icon.textContent = iconText;
    header.appendChild(icon);

    const title = context.document.createElement("strong");
    title.className = "wechat-callout-title";
    title.textContent = titleText;
    header.appendChild(title);

    element.prepend(header);
  },
};

export const builtinCalloutPlugin: WechatMarkdownPlugin = {
  doc: {
    id: "callout",
    name: "提示卡片 (Callout)",
    category: "block",
    description: "使用 GFM 规范语法 (> [!NOTE]) 生成带左侧边框与图标的微信高亮卡片",
    sampleMarkdown: `> [!NOTE]
> 这里是一条标准提示，适用于操作备忘。

> [!TIP] 实用技巧
> 这是带自定义标题的建议卡片。

> [!WARNING] ⚠️ 重点防护
> 这是带自定义 Emoji 与标题的警告卡片。`,
    syntaxGuide: "> [!NOTE] 自定义标题 (可选，可包含 Emoji)\n> 提示内容...",
    cssSelectors: [
      'section[data-wechat-node="callout"]',
      ".wechat-callout",
      ".wechat-callout-note",
      ".wechat-callout-tip",
      ".wechat-callout-warning",
    ],
  },
  milkdownPlugins: calloutMilkdownPlugins,
  wechatRenderer: calloutWechatRenderer,
  defaultCss: `
.milkdown .editor section[data-wechat-node="callout"],
.milkdown .editor .wechat-callout {
  margin: 1.2em 0;
  padding: 12px 16px;
  border-radius: 6px;
  border-left-width: 4px;
  border-left-style: solid;
  box-sizing: border-box;
}
.milkdown .editor .wechat-callout-note {
  border-left-color: #3b82f6;
  background-color: rgba(59, 130, 246, 0.08);
}
.milkdown .editor .wechat-callout-tip {
  border-left-color: #10b981;
  background-color: rgba(16, 185, 129, 0.08);
}
.milkdown .editor .wechat-callout-important {
  border-left-color: #8b5cf6;
  background-color: rgba(139, 92, 246, 0.08);
}
.milkdown .editor .wechat-callout-warning {
  border-left-color: #f59e0b;
  background-color: rgba(245, 158, 11, 0.08);
}
.milkdown .editor .wechat-callout-caution {
  border-left-color: #ef4444;
  background-color: rgba(239, 68, 68, 0.08);
}
.milkdown .editor section[data-wechat-node="callout-header"] {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 6px;
  line-height: 1.4;
}
.milkdown .editor .wechat-callout-icon {
  margin-right: 6px;
}
.milkdown .editor .wechat-callout p {
  margin: 0.4em 0;
  font-size: 15px;
  line-height: 1.7;
}
`.trim(),
};
