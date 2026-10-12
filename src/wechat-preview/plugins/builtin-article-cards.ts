import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { WechatMarkdownPlugin } from "./types";
import type { WechatElementRenderer } from "../wechat-renderer";

export type ArticleCardType = "intro" | "author" | "cta";

/** Remark AST plugin: transforms [!INTRO], [!AUTHOR], [!CTA] blockquotes into articleCard nodes. */
export function remarkArticleCards() {
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
            const match = firstText.value.match(
              /^\[!(INTRO|PREFACE|AUTHOR|PROFILE|CTA|OUTRO)\](?:[ \t]+([^\r\n]+))?(?:\r?\n|$)/i,
            );
            if (match) {
              const rawTag = match[1].toUpperCase();
              let cardType: ArticleCardType = "intro";
              if (rawTag === "AUTHOR" || rawTag === "PROFILE") {
                cardType = "author";
              } else if (rawTag === "CTA" || rawTag === "OUTRO") {
                cardType = "cta";
              }

              const customTitle = match[2] ? match[2].trim() : "";
              // Strip the [!TAG] marker
              firstText.value = firstText.value.slice(match[0].length);
              if (!firstText.value.trim() && firstParagraph.children.length > 1) {
                firstParagraph.children.shift();
              } else if (!firstText.value.trim() && firstParagraph.children.length === 1) {
                node.children.shift();
              }

              node.type = "articleCard";
              node.cardType = cardType;
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

export const articleCardMilkdownPlugins = [
  $remark("remarkArticleCards", () => remarkArticleCards as any),
  $nodeSchema("articleCard", () => ({
    content: "block+",
    group: "block",
    defining: true,
    attrs: {
      type: { default: "intro" },
      title: { default: "" },
    },
    parseDOM: [
      {
        tag: "section[data-wechat-node='article-card']",
        getAttrs: (dom) => ({
          type: (dom as HTMLElement).getAttribute("data-card-type") || "intro",
          title: (dom as HTMLElement).getAttribute("data-card-title") || "",
        }),
      },
    ],
    toDOM: (node) => [
      "section",
      {
        class: `wechat-article-card wechat-article-card-${node.attrs.type}`,
        "data-wechat-node": "article-card",
        "data-card-type": node.attrs.type,
        ...(node.attrs.title ? { "data-card-title": node.attrs.title } : {}),
      },
      0,
    ],
    parseMarkdown: {
      match: (node) => node.type === "articleCard",
      runner: (state, node, type) => {
        state.openNode(type, {
          type: node.cardType || "intro",
          title: node.customTitle || "",
        });
        state.next(node.children);
        state.closeNode();
      },
    },
    toMarkdown: {
      match: (node) => node.type.name === "articleCard",
      runner: (state, node) => {
        state.openNode("blockquote");
        state.next(node.content);
        state.closeNode();
      },
    },
  })),
].flat();

export const articleCardWechatRenderer: WechatElementRenderer = {
  kind: "article-card",
  selector: 'section[data-wechat-node="article-card"]',
  prepare(element, context) {
    const type = (element.getAttribute("data-card-type") || "intro") as ArticleCardType;
    const customTitle = element.getAttribute("data-card-title") || "";

    // 1. Build Eyebrow Tag Header
    let defaultEyebrow = "导读 · READING GUIDE";
    let defaultIcon = "📖";

    if (type === "author") {
      defaultEyebrow = "创作者 · AUTHOR";
      defaultIcon = "👤";
    } else if (type === "cta") {
      defaultEyebrow = "互动交流 · CONNECT";
      defaultIcon = "✨";
    }

    const eyebrow = context.document.createElement("section");
    eyebrow.className = "wechat-card-eyebrow";
    eyebrow.setAttribute("data-wechat-node", "card-eyebrow");

    const iconSpan = context.document.createElement("span");
    iconSpan.className = "wechat-card-eyebrow-icon";
    iconSpan.textContent = defaultIcon;
    eyebrow.appendChild(iconSpan);

    const labelSpan = context.document.createElement("span");
    labelSpan.className = "wechat-card-eyebrow-label";
    labelSpan.textContent = customTitle.trim() || defaultEyebrow;
    eyebrow.appendChild(labelSpan);

    // 2. Special structure for Author card (Avatar + Info horizontal split)
    if (type === "author") {
      const img = element.querySelector("img");
      if (img) {
        // Find avatar image and detach its parent paragraph if it only had the image
        const imgParent = img.parentElement;
        const remainingNodes: any[] = [];
        for (let i = 0; i < element.childNodes.length; i++) {
          const child = element.childNodes[i];
          if (child !== imgParent) {
            remainingNodes.push(child);
          }
        }

        const row = context.document.createElement("section");
        row.className = "wechat-author-row";
        row.setAttribute("data-wechat-node", "author-row");

        const avatarWrap = context.document.createElement("section");
        avatarWrap.className = "wechat-author-avatar-wrap";
        avatarWrap.setAttribute("data-wechat-node", "author-avatar-wrap");

        img.className = "wechat-author-avatar";
        img.setAttribute("data-wechat-node", "author-avatar");
        avatarWrap.appendChild(img);
        row.appendChild(avatarWrap);

        const infoWrap = context.document.createElement("section");
        infoWrap.className = "wechat-author-info";
        infoWrap.setAttribute("data-wechat-node", "author-info");

        for (const rem of remainingNodes) {
          infoWrap.appendChild(rem);
        }
        row.appendChild(infoWrap);

        // Clear element and assemble eyebrow + row
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
        element.appendChild(eyebrow);
        element.appendChild(row);
        return;
      }
    }

    // Default assembly (Intro and CTA)
    element.prepend(eyebrow);
  },
};

export const builtinArticleCardsPlugin: WechatMarkdownPlugin = {
  doc: {
    id: "article-card",
    name: "结构卡片 (Article Card)",
    category: "block",
    description: "专为文章开头的导读指引 (> [!INTRO]) 和结尾的作者名片 (> [!AUTHOR])、互动号召 (> [!CTA]) 设计的高级结构化卡片",
    sampleMarkdown: `> [!INTRO] 导读指南
> 本文共 3,200 字，预计阅读 6 分钟。系统解析工作流核心状态机与排版架构。

> [!AUTHOR]
> ![头像](https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop)
> **Aatrox** · 全栈独立开发者
> 持续探索 Agentic Coding 与个人技术资产沉淀。[badge:brand|AI 含量 20%]

> [!CTA] 欢迎交流与关注
> 如果这篇文章对你有所启发，欢迎点击右下角 **「点赞」** 和 **「在看」** 支持！`,
    syntaxGuide: "> [!INTRO] 导读标题\n> [!AUTHOR]\n> [!CTA] 互动标题",
    cssSelectors: [
      'section[data-wechat-node="article-card"]',
      ".wechat-article-card",
      ".wechat-article-card-intro",
      ".wechat-article-card-author",
      ".wechat-article-card-cta",
      'section[data-wechat-node="card-eyebrow"]',
      'section[data-wechat-node="author-row"]',
      'img[data-wechat-node="author-avatar"]',
    ],
  },
  milkdownPlugins: articleCardMilkdownPlugins,
  wechatRenderer: articleCardWechatRenderer,
  defaultCss: `
.milkdown .editor section[data-wechat-node="article-card"],
.milkdown .editor .wechat-article-card {
  margin: 1.8em 0;
  padding: 16px 20px;
  border-radius: 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.milkdown .editor .wechat-article-card-intro {
  background-color: var(--wx-soft-surface, #fbfafb);
  border: 1px solid var(--wx-divider, #e8e2e5);
  border-left: 4px solid var(--wx-brand-accent, #ca6093);
}
.milkdown .editor .wechat-article-card-author {
  background-color: var(--wx-soft-surface, #faf9fa);
  border: 1px solid var(--wx-divider, #e5e0e3);
  border-radius: 10px;
}
.milkdown .editor .wechat-article-card-cta {
  background-color: rgba(202, 96, 147, 0.04);
  border: 1px dashed var(--wx-brand-accent, #ca6093);
  text-align: center;
}
.milkdown .editor section[data-wechat-node="card-eyebrow"],
.milkdown .editor .wechat-card-eyebrow {
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--wx-brand-accent, #ca6093);
  text-transform: uppercase;
}
.milkdown .editor .wechat-card-eyebrow-icon {
  margin-right: 6px;
  font-size: 14px;
  display: inline-block;
  vertical-align: middle;
}
.milkdown .editor .wechat-card-eyebrow-label {
  display: inline-block;
  vertical-align: middle;
}
.milkdown .editor .wechat-article-card-cta section[data-wechat-node="card-eyebrow"],
.milkdown .editor .wechat-article-card-cta .wechat-card-eyebrow {
  text-align: center;
}
.milkdown .editor section[data-wechat-node="author-row"],
.milkdown .editor .wechat-author-row {
  display: table;
  width: 100%;
}
.milkdown .editor section[data-wechat-node="author-avatar-wrap"],
.milkdown .editor .wechat-author-avatar-wrap {
  display: table-cell;
  vertical-align: middle;
  width: 52px;
  padding-right: 14px;
}
.milkdown .editor img[data-wechat-node="author-avatar"],
.milkdown .editor .wechat-author-avatar {
  width: 52px !important;
  height: 52px !important;
  max-width: 52px !important;
  border-radius: 50% !important;
  object-fit: cover !important;
  display: block;
  border: 2px solid #ffffff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.milkdown .editor section[data-wechat-node="author-info"],
.milkdown .editor .wechat-author-info {
  display: table-cell;
  vertical-align: middle;
}
.milkdown .editor .wechat-article-card p {
  margin: 0.35em 0;
  font-size: 14px;
  line-height: 1.68;
  color: var(--wx-text, #2c2c2c);
}
.milkdown .editor .wechat-article-card-author .wechat-author-info p:first-child {
  font-size: 15px;
  font-weight: 700;
  color: var(--wx-h2-color, #1f1b1c);
  margin-bottom: 2px;
}
`.trim(),
};
