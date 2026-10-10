import { $markSchema, $remark } from "@milkdown/kit/utils";
import type { WechatMarkdownPlugin } from "./types";
import type { WechatElementRenderer } from "../wechat-renderer";

/** Remark plugin to match [badge:type|text] syntax. */
export function remarkBadge() {
  return (tree: any) => {
    function visit(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.type === "paragraph" || node.type === "listItem" || node.type === "heading") {
        if (Array.isArray(node.children)) {
          const newChildren: any[] = [];
          for (const child of node.children) {
            if (child.type === "text" && typeof child.value === "string") {
              const regex = /\[badge:(brand|success|warning|danger|info)\|([^\]]+)\]/gi;
              let lastIndex = 0;
              let match;
              let found = false;
              while ((match = regex.exec(child.value)) !== null) {
                found = true;
                if (match.index > lastIndex) {
                  newChildren.push({
                    type: "text",
                    value: child.value.slice(lastIndex, match.index),
                  });
                }
                const badgeType = match[1].toLowerCase();
                const badgeText = match[2];
                newChildren.push({
                  type: "badge",
                  badgeType,
                  children: [{ type: "text", value: badgeText }],
                });
                lastIndex = regex.lastIndex;
              }
              if (found) {
                if (lastIndex < child.value.length) {
                  newChildren.push({
                    type: "text",
                    value: child.value.slice(lastIndex),
                  });
                }
                continue;
              }
            }
            newChildren.push(child);
          }
          node.children = newChildren;
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

export const badgeMilkdownPlugins = [
  $remark("remarkBadge", () => remarkBadge as any),
  $markSchema("badge", () => ({
    attrs: {
      type: { default: "brand" },
    },
    parseDOM: [
      {
        tag: "span[data-wechat-node='badge']",
        getAttrs: (dom) => ({
          type: (dom as HTMLElement).getAttribute("data-badge-type") || "brand",
        }),
      },
    ],
    toDOM: (mark) => [
      "span",
      {
        class: `wechat-badge wechat-badge-${mark.attrs.type}`,
        "data-wechat-node": "badge",
        "data-badge-type": mark.attrs.type,
      },
      0,
    ],
    parseMarkdown: {
      match: (node) => node.type === "badge",
      runner: (state, node, markType) => {
        state.openMark(markType, { type: node.badgeType || "brand" });
        state.next(node.children);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === "badge",
      runner: (state, mark) => {
        state.withMark(mark, "badge");
      },
    },
  })),
].flat();

export const badgeWechatRenderer: WechatElementRenderer = {
  kind: "badge",
  selector: 'span[data-wechat-node="badge"]',
};

export const builtinBadgePlugin: WechatMarkdownPlugin = {
  doc: {
    id: "badge",
    name: "状态徽章 (Badge)",
    category: "inline",
    description: "使用 [badge:类型|文字] 插入圆角状态胶囊标签（支持 brand/success/warning/danger/info）",
    sampleMarkdown: "当前服务状态：[badge:success|运行正常]，新版特性：[badge:brand|重点推荐]！",
    syntaxGuide: "[badge:类型|标签文字]",
    cssSelectors: ['span[data-wechat-node="badge"]', ".wechat-badge"],
  },
  milkdownPlugins: badgeMilkdownPlugins,
  wechatRenderer: badgeWechatRenderer,
  defaultCss: `
.milkdown .editor .wechat-badge,
.milkdown .editor span[data-wechat-node="badge"] {
  display: inline-block;
  padding: 1px 7px;
  font-size: 0.78em;
  font-weight: 600;
  line-height: 1.4;
  border-radius: 999px;
  margin: 0 3px;
  vertical-align: baseline;
  box-sizing: border-box;
}
.milkdown .editor .wechat-badge-brand {
  background-color: rgba(202, 96, 147, 0.12);
  color: #a94473;
}
.milkdown .editor .wechat-badge-success {
  background-color: #e8f6ec;
  color: #2f7d4a;
}
.milkdown .editor .wechat-badge-warning {
  background-color: #fef3c7;
  color: #b45309;
}
.milkdown .editor .wechat-badge-danger {
  background-color: #fee2e2;
  color: #b91c1c;
}
.milkdown .editor .wechat-badge-info {
  background-color: #eff6ff;
  color: #1d4ed8;
}
`.trim(),
};
