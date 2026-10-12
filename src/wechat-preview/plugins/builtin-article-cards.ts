import { $nodeSchema, $remark } from "@milkdown/kit/utils";
import type { WechatMarkdownPlugin } from "./types";
import type { WechatElementRenderer } from "../wechat-renderer";

export type ArticleCardType = "intro" | "cta";

/** Helper: detect if a paragraph inside an INTRO card is author/meta information */
function isMetaParagraph(text: string): boolean {
  const trimmed = text.trim();
  return /^(?:\*{0,2}(?:文\s*[/：:]|作者[：:]|By\s+|执笔[：:]|策划[：:]|编辑[：:])|预计阅读|阅读需|字数[：:]|共\s*\d+\s*字)/i.test(trimmed);
}

/** Helper: detect if a paragraph inside an INTRO card is a follow / subscribe guide */
function isGuideParagraph(text: string): boolean {
  const trimmed = text.trim();
  return /(?:欢迎关注|关注公众号|星标|不错过|点击右下角|扫码关注|关注我们|回复「)/i.test(trimmed);
}

/** Remark AST plugin: transforms [!INTRO], [!CTA] blockquotes into articleCard nodes. */
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
              /^\[!(INTRO|PREFACE|CTA|OUTRO)\](?:[ \t]+([^\r\n]+))?(?:\r?\n|$)/i,
            );
            if (match) {
              const rawTag = match[1].toUpperCase();
              let cardType: ArticleCardType = "intro";
              if (rawTag === "CTA" || rawTag === "OUTRO") {
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

    if (type === "intro") {
      // 1. Build refined Eyebrow Pill Badge
      const eyebrow = context.document.createElement("section");
      eyebrow.className = "wechat-card-eyebrow";
      eyebrow.setAttribute("data-wechat-node", "card-eyebrow");

      const badge = context.document.createElement("span");
      badge.className = "wechat-card-eyebrow-badge";
      badge.setAttribute("data-wechat-node", "card-eyebrow-badge");

      const iconSpan = context.document.createElement("span");
      iconSpan.className = "wechat-card-eyebrow-icon";
      iconSpan.textContent = "📖";
      badge.appendChild(iconSpan);

      const labelSpan = context.document.createElement("span");
      labelSpan.className = "wechat-card-eyebrow-label";
      labelSpan.textContent = customTitle.trim() || "导读 · READING GUIDE";
      badge.appendChild(labelSpan);

      eyebrow.appendChild(badge);
      element.prepend(eyebrow);

      // 2. Scan child paragraphs for meta line (author/time) and guide line (follow)
      const paragraphs = Array.from(element.querySelectorAll("p"));
      for (const p of paragraphs) {
        const text = p.textContent?.trim() || "";
        if (isMetaParagraph(text)) {
          p.className = (p.className ? p.className + " " : "") + "wechat-intro-meta";
          p.setAttribute("data-wechat-node", "intro-meta");
        } else if (isGuideParagraph(text)) {
          p.className = (p.className ? p.className + " " : "") + "wechat-intro-guide";
          p.setAttribute("data-wechat-node", "intro-guide");
        }
      }
      return;
    }

    if (type === "cta") {
      const eyebrow = context.document.createElement("section");
      eyebrow.className = "wechat-card-eyebrow";
      eyebrow.setAttribute("data-wechat-node", "card-eyebrow");

      const badge = context.document.createElement("span");
      badge.className = "wechat-card-eyebrow-badge";
      badge.setAttribute("data-wechat-node", "card-eyebrow-badge");

      const iconSpan = context.document.createElement("span");
      iconSpan.className = "wechat-card-eyebrow-icon";
      iconSpan.textContent = "✨";
      badge.appendChild(iconSpan);

      const labelSpan = context.document.createElement("span");
      labelSpan.className = "wechat-card-eyebrow-label";
      labelSpan.textContent = customTitle.trim() || "互动交流 · CONNECT";
      badge.appendChild(labelSpan);

      eyebrow.appendChild(badge);
      element.prepend(eyebrow);
    }
  },
};

export const builtinArticleCardsPlugin: WechatMarkdownPlugin = {
  doc: {
    id: "article-card",
    name: "篇章结构卡片 (Article Card)",
    category: "block",
    description: "专为文章开头的精修导读卡 (> [!INTRO]) 和结尾互动号召 (> [!CTA]) 设计的高级结构化卡片，去引用化设计，支持悬挂作者与元信息条、引导关注及精致小字排版",
    sampleMarkdown: `> [!INTRO] 导读
> **文 / Aatrox** · 预计阅读 5 分钟
>
> 本文系统解析工作流核心状态机与排版架构。从 AST 转换到微信安全内联，带你掌握定制化排版全流程。
>
> 💡 欢迎关注公众号「早早集市」，星标不错过每次更新。

> [!CTA] 欢迎交流与关注
> 如果这篇文章对你有所启发，欢迎点击右下角 **「点赞」** 和 **「在看」** 支持！`,
    syntaxGuide: `> [!INTRO] 自定义标题 (可选)
> **文 / 作者** · 预计阅读 5 分钟 (可选悬挂元信息)
> 导读正文...
> 💡 欢迎关注... (可选引导关注)

> [!CTA] 互动标题 (可选)
> 互动号召正文...`,
    cssSelectors: [
      'section[data-wechat-node="article-card"]',
      ".wechat-article-card",
      ".wechat-article-card-intro",
      ".wechat-article-card-cta",
      'section[data-wechat-node="card-eyebrow"]',
      'span[data-wechat-node="card-eyebrow-badge"]',
      'p[data-wechat-node="intro-meta"]',
      'p[data-wechat-node="intro-guide"]',
    ],
  },
  milkdownPlugins: articleCardMilkdownPlugins,
  wechatRenderer: articleCardWechatRenderer,
  defaultCss: `
.milkdown .editor section[data-wechat-node="article-card"],
.milkdown .editor .wechat-article-card {
  margin: 1.8em 0;
  padding: 16px 20px;
  border-radius: 10px;
  box-sizing: border-box;
  overflow: hidden;
}
.milkdown .editor .wechat-article-card-intro {
  background-color: var(--wx-soft-surface, #faf8f9);
  border: 1px solid var(--wx-divider, #eae4e7);
}
.milkdown .editor .wechat-article-card-cta {
  background-color: rgba(202, 96, 147, 0.04);
  border: 1px dashed var(--wx-brand-accent, #ca6093);
  text-align: center;
}
.milkdown .editor section[data-wechat-node="card-eyebrow"],
.milkdown .editor .wechat-card-eyebrow {
  margin-bottom: 10px;
}
.milkdown .editor .wechat-article-card-cta section[data-wechat-node="card-eyebrow"],
.milkdown .editor .wechat-article-card-cta .wechat-card-eyebrow {
  text-align: center;
}
.milkdown .editor span[data-wechat-node="card-eyebrow-badge"],
.milkdown .editor .wechat-card-eyebrow-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background-color: rgba(202, 96, 147, 0.08);
  color: var(--wx-brand-accent, #ca6093);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.5;
}
.milkdown .editor .wechat-card-eyebrow-icon {
  margin-right: 4px;
  font-size: 12px;
  display: inline-block;
  vertical-align: middle;
}
.milkdown .editor .wechat-card-eyebrow-label {
  display: inline-block;
  vertical-align: middle;
}
.milkdown .editor .wechat-article-card p {
  margin: 0.4em 0;
  font-size: 13px;
  line-height: 1.72;
  color: var(--wx-text-soft, #555555);
  letter-spacing: 0.02em;
}
.milkdown .editor p[data-wechat-node="intro-meta"],
.milkdown .editor .wechat-intro-meta {
  margin: 4px 0 10px 0 !important;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--wx-divider, #f0ebed);
  font-size: 12px !important;
  color: var(--wx-muted-color, #756b6e) !important;
  line-height: 1.5 !important;
}
.milkdown .editor p[data-wechat-node="intro-meta"] strong,
.milkdown .editor .wechat-intro-meta strong {
  color: var(--wx-brand-accent, #ca6093);
  font-weight: 600;
}
.milkdown .editor p[data-wechat-node="intro-guide"],
.milkdown .editor .wechat-intro-guide {
  margin-top: 10px !important;
  padding-top: 8px;
  border-top: 1px dashed rgba(202, 96, 147, 0.25);
  font-size: 12px !important;
  color: var(--wx-brand-accent, #ca6093) !important;
  line-height: 1.6 !important;
}
`.trim(),
};
