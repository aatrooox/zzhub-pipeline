import { $markSchema, $remark } from "@milkdown/kit/utils";
import { remarkHighlightMark } from "remark-highlight-mark";

/** 与 Nezus 使用相同的 remark 扩展，代码及转义不参与高亮解析。 */
export const highlightPlugins = [
  $remark("remarkHighlightMark", () => remarkHighlightMark as any),
  $markSchema("highlight", () => ({
    parseDOM: [{ tag: "mark" }],
    toDOM: () => ["mark", 0],
    parseMarkdown: {
      match: node => node.type === "highlight",
      runner: (state, node, markType) => { state.openMark(markType, {}); state.next(node.children); state.closeMark(markType); },
    },
    toMarkdown: {
      match: mark => mark.type.name === "highlight",
      runner: (state, mark) => { state.withMark(mark, "highlight"); },
    },
  })),
].flat();
