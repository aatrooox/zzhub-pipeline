import { $markSchema, $remark } from "@milkdown/kit/utils";
import { remarkHighlightMark } from "remark-highlight-mark";
import type { WechatMarkdownPlugin } from "./types";

export const highlightMilkdownPlugins = [
  $remark("remarkHighlightMark", () => remarkHighlightMark as any),
  $markSchema("highlight", () => ({
    parseDOM: [{ tag: "mark" }],
    toDOM: () => ["mark", 0],
    parseMarkdown: {
      match: (node) => node.type === "highlight",
      runner: (state, node, markType) => {
        state.openMark(markType, {});
        state.next(node.children);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === "highlight",
      runner: (state, mark) => {
        state.withMark(mark, "highlight");
      },
    },
  })),
].flat();

export const builtinHighlightPlugin: WechatMarkdownPlugin = {
  doc: {
    id: "highlight",
    name: "高亮标记 (Highlight)",
    category: "inline",
    description: "使用 ==文本== 添加荧光笔黄色高亮背景",
    sampleMarkdown: "这里支持 ==重要结论== 与 ==关键观点== 的高亮展示。",
    syntaxGuide: "==高亮文本==",
    cssSelectors: ["mark", ".milkdown .editor mark"],
  },
  milkdownPlugins: highlightMilkdownPlugins,
  defaultCss: `
.milkdown .editor mark {
  background-color: #fff0a8;
  color: inherit;
  padding: 1px 3px;
  border-radius: 2px;
}
`.trim(),
};
