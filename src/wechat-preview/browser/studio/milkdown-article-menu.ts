import type { BlockEditFeatureConfig } from "@milkdown/crepe/feature/block-edit";
import type { ToolbarFeatureConfig } from "@milkdown/crepe/feature/toolbar";
import type { TopBarFeatureConfig } from "@milkdown/crepe/feature/top-bar";
import type { Ctx } from "@milkdown/kit/ctx";
import { editorViewCtx, parserCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Parser } from "@milkdown/transformer";
import { Slice } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";

export function getEditorView(ctx: Ctx): EditorView | undefined {
  try {
    const view = ctx.get(editorViewCtx);
    if (view && (view as any).state) return view;
  } catch {
    // fallback
  }
  try {
    const view = (ctx as any).get("editorView");
    if (view && (view as any).state) return view;
  } catch {
    // ignore
  }
  return undefined;
}

export function getParser(ctx: Ctx): Parser | undefined {
  try {
    const parser = ctx.get(parserCtx);
    if (typeof parser === "function") return parser;
  } catch {
    // fallback
  }
  try {
    const parser = (ctx as any).get("parser");
    if (typeof parser === "function") return parser;
  } catch {
    // ignore
  }
  return undefined;
}

const articleIcon =
  '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>';

export const inlineItems = [
  {
    key: "highlight",
    label: "高亮",
    mark: "highlight",
    text: "重点内容",
    attrs: {},
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="m14 3 7 7-9 9H5v-7z" fill="#fef08a" stroke="#d97706" stroke-width="2"/><path d="M3 21h12" stroke="#d97706" stroke-width="2" stroke-linecap="round"/><path d="m11 6 7 7" stroke="#d97706" stroke-width="2"/><title>高亮</title></svg>',
  },
  {
    key: "kbd",
    label: "快捷键",
    mark: "kbd",
    text: "Cmd",
    attrs: {},
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" fill="#f1f5f9" stroke="#475569" stroke-width="1.8"/><path d="M7 9h2m2 0h2m2 0h2M7 13h2m2 0h2m2 0h2M8 16h8" stroke="#64748b" stroke-width="1.5" stroke-linecap="round"/><title>快捷键</title></svg>',
  },
  ...[
    ["brand", "重点徽章", "重点", "#ca6093", "#fce7f3"],
    ["success", "成功徽章", "完成", "#16a34a", "#dcfce7"],
    ["warning", "提醒徽章", "待确认", "#ea580c", "#ffedd5"],
    ["danger", "风险徽章", "风险", "#dc2626", "#fee2e2"],
    ["info", "信息徽章", "说明", "#0284c7", "#e0f2fe"],
  ].map(([type, label, text, color, bg]) => ({
    key: `badge-${type}`,
    label: label!,
    mark: "badge",
    text: text!,
    attrs: { type },
    icon: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M3 4h9l9 9-8 8-10-10z" fill="${bg}" stroke="${color}" stroke-width="2"/><circle cx="8" cy="8" r="1.5" fill="${color}"/><title>${label}</title></svg>`,
  })),
];

export type InlineItem = (typeof inlineItems)[number];
export const inlineMarks = ["highlight", "kbd", "badge"];

export function applyInline(ctx: Ctx, item: InlineItem, slash = false) {
  const view = getEditorView(ctx);
  if (!view || !view.state) return;
  const { state } = view;
  const { selection } = state;
  if (
    !(selection instanceof TextSelection) ||
    !selection.$from.sameParent(selection.$to) ||
    selection.$from.parent.type.spec.code
  )
    return;
  const from = slash ? selection.$from.start() : selection.from;
  const to = selection.to;
  if (state.doc.rangeHasMark(from, to, state.schema.marks.inlineCode!)) return;

  const markType = state.schema.marks[item.mark];
  if (!markType) return;
  const tr = state.tr;

  // 检查是否已经具有完全一致的标记（包括类型属性）
  const targetType = "type" in item.attrs ? (item.attrs as { type?: string }).type : undefined;
  let alreadyHasExactMark = false;
  state.doc.nodesBetween(from, to, (node) => {
    for (const m of node.marks) {
      if (m.type === markType) {
        if (!targetType || m.attrs?.type === targetType) {
          alreadyHasExactMark = true;
        }
      }
    }
  });

  if (selection.empty || slash) {
    const mark = markType.create(item.attrs);
    tr.replaceWith(from, to, state.schema.text(item.text, [mark]));
    tr.setSelection(TextSelection.create(tr.doc, from + item.text.length));
  } else {
    // 若当前已处于该标记，则点击后取消（Toggle Off）
    if (alreadyHasExactMark) {
      tr.removeMark(from, to, markType);
    } else {
      // 切换徽章类型时，先清除已存在的旧徽章/行内标记
      if (item.mark === "badge") {
        const badgeMark = state.schema.marks.badge;
        if (badgeMark) tr.removeMark(from, to, badgeMark);
      } else if (item.mark === "kbd") {
        const kbdMark = state.schema.marks.kbd;
        if (kbdMark) tr.removeMark(from, to, kbdMark);
      } else if (item.mark === "highlight") {
        for (const name of inlineMarks) {
          const m = state.schema.marks[name];
          if (m) tr.removeMark(from, to, m);
        }
      }
      const mark = markType.create(item.attrs);
      tr.addMark(from, to, mark);
    }
  }
  tr.setStoredMarks([]);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function clearInline(ctx: Ctx) {
  const view = getEditorView(ctx);
  if (!view || !view.state) return;
  const { state } = view;
  const { from, to } = state.selection;
  const tr = state.tr;
  for (const name of inlineMarks) {
    const markType = state.schema.marks[name];
    if (markType) tr.removeMark(from, to, markType);
  }
  tr.setStoredMarks([]);
  view.dispatch(tr);
  view.focus();
}

export const articleInlineTopBar: NonNullable<TopBarFeatureConfig["buildTopBar"]> = (builder) => {
  builder.addGroup("article-inline", "行内组件").addItem("article-inline", {
    icon: "",
    active: () => false,
    selector: {
      activeLabel: () => "行内组件",
      options: [
        ...inlineItems.map((item) => ({
          label: item.label,
          onSelect: (ctx: Ctx) => applyInline(ctx, item),
        })),
        { label: "清除行内组件", onSelect: clearInline },
      ],
    },
  });
};

export const articleInlineToolbar: NonNullable<ToolbarFeatureConfig["buildToolbar"]> = (builder) => {
  const group = builder.addGroup("article-inline", "行内组件");
  for (const item of inlineItems) {
    const targetType = "type" in item.attrs ? (item.attrs as { type?: string }).type : undefined;
    group.addItem(item.key, {
      icon: item.icon,
      active: (ctx) => {
        const view = getEditorView(ctx);
        if (!view || !view.state) return false;
        const { state } = view;
        const markType = state.schema.marks[item.mark];
        if (!markType) return false;
        let hasActive = false;
        state.doc.nodesBetween(state.selection.from, state.selection.to, (node) => {
          for (const m of node.marks) {
            if (m.type === markType) {
              if (targetType) {
                if (m.attrs?.type === targetType) hasActive = true;
              } else {
                hasActive = true;
              }
            }
          }
        });
        return hasActive;
      },
      onRun: (ctx) => applyInline(ctx, item),
    });
  }
};

/**
 * 常用组件直接出现在 / 斜杠菜单中，插入后由 @akairos/milkdown-article-plugins 深度解析和保存。
 */
export const articleBlockMenu: NonNullable<BlockEditFeatureConfig["buildMenu"]> = (builder) => {
  const group = builder.addGroup("article", "文章专属组件");
  const blocks: [string, string, string][] = [
    ["intro", "导读卡片 (INTRO)", "> [!INTRO] 导读\n> 在此处填写文章核心观点或背景提炼。"],
    ["cta", "文末互动 (CTA)", "> [!CTA] 交流与讨论\n> 欢迎在评论区分享你的经验与思考。"],
    ["note", "提示卡片 (NOTE)", "> [!NOTE]\n> 请填写背景上下文或参考提示。"],
    ["tip", "建议卡片 (TIP)", "> [!TIP]\n> 请填写技巧建议或最佳实践。"],
    ["important", "重点卡片 (IMPORTANT)", "> [!IMPORTANT]\n> 请填写核心关键点。"],
    ["warning", "警告卡片 (WARNING)", "> [!WARNING]\n> 请填写需特别留意的风险事项。"],
    ["caution", "注意卡片 (CAUTION)", "> [!CAUTION]\n> 请填写潜在危险或破坏性操作提示。"],
  ];

  for (const [key, label, markdown] of blocks) {
    group.addItem(key, {
      label,
      icon: articleIcon,
      onRun: (ctx) => {
        const view = getEditorView(ctx);
        const parser = getParser(ctx);
        if (!view || !parser) return;
        const document = parser(markdown);
        if (!document) return;
        const { $from } = view.state.selection;
        view.dispatch(
          view.state.tr
            .replace($from.before(), $from.after(), new Slice(document.content, 0, 0))
            .scrollIntoView(),
        );
        view.focus();
      },
    });
  }

  for (const item of inlineItems) {
    group.addItem(item.key, {
      label: item.label,
      icon: item.icon,
      onRun: (ctx) => applyInline(ctx, item, true),
    });
  }
};
