import { $markSchema, $remark } from "@milkdown/kit/utils";
import type { WechatMarkdownPlugin } from "./types";
import type { WechatElementRenderer } from "../wechat-renderer";

/** Remark plugin to match [[kbd:Key]] syntax. */
export function remarkKbd() {
  return (tree: any) => {
    function visit(node: any) {
      if (!node || typeof node !== "object") return;
      if (node.type === "paragraph" || node.type === "listItem" || node.type === "heading") {
        if (Array.isArray(node.children)) {
          const newChildren: any[] = [];
          for (const child of node.children) {
            if (child.type === "text" && typeof child.value === "string") {
              const regex = /\[\[kbd:([^\]]+)\]\]/g;
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
                newChildren.push({
                  type: "kbd",
                  children: [{ type: "text", value: match[1] }],
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

export const kbdMilkdownPlugins = [
  $remark("remarkKbd", () => remarkKbd as any),
  $markSchema("kbd", () => ({
    parseDOM: [{ tag: "kbd" }, { tag: "span[data-wechat-node='kbd']" }],
    toDOM: () => [
      "span",
      {
        class: "wechat-kbd",
        "data-wechat-node": "kbd",
      },
      0,
    ],
    parseMarkdown: {
      match: (node) => node.type === "kbd",
      runner: (state, node, markType) => {
        state.openMark(markType, {});
        state.next(node.children);
        state.closeMark(markType);
      },
    },
    toMarkdown: {
      match: (mark) => mark.type.name === "kbd",
      runner: (state, mark) => {
        state.withMark(mark, "kbd");
      },
    },
  })),
].flat();

export const kbdWechatRenderer: WechatElementRenderer = {
  kind: "kbd",
  selector: 'span[data-wechat-node="kbd"], kbd',
  finalize(element) {
    if (element.tagName.toLowerCase() === "kbd") {
      const replacement = element.ownerDocument.createElement("span");
      for (const attr of Array.from(element.attributes)) {
        replacement.setAttribute(attr.name, attr.value);
      }
      while (element.firstChild) {
        replacement.appendChild(element.firstChild);
      }
      element.replaceWith(replacement);
    }
  },
};

export const builtinKbdPlugin: WechatMarkdownPlugin = {
  doc: {
    id: "kbd",
    name: "按键标记 (Keyboard Key)",
    category: "inline",
    description: "使用 [[kbd:按键]] 输出带轻拟物阴影的键盘按键胶囊",
    sampleMarkdown: "按下快捷键 [[kbd:Cmd]] + [[kbd:K]] 快速唤起全局指令台。",
    syntaxGuide: "[[kbd:按键名称]]",
    cssSelectors: ['span[data-wechat-node="kbd"]', ".wechat-kbd"],
  },
  milkdownPlugins: kbdMilkdownPlugins,
  wechatRenderer: kbdWechatRenderer,
  defaultCss: `
.milkdown .editor .wechat-kbd,
.milkdown .editor span[data-wechat-node="kbd"] {
  display: inline-block;
  padding: 2px 6px;
  font-family: -apple-system, SFMono-Regular, Consolas, Menlo, monospace;
  font-size: 0.85em;
  line-height: 1.2;
  color: #374151;
  background-color: #f3f4f6;
  border: 1px solid #d1d5db;
  border-bottom-width: 2px;
  border-radius: 4px;
  margin: 0 2px;
  box-sizing: border-box;
}
`.trim(),
};
