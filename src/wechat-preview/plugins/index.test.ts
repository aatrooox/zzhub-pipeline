import { describe, expect, test } from "bun:test";
import {
  getAllPlugins,
  getPluginDocs,
  getCombinedMilkdownPlugins,
  getCombinedDefaultCss,
  getCombinedWechatRenderers,
  registerPlugin,
} from "./registry";
import { remarkCallout } from "./builtin-callout";
import { remarkKbd } from "./builtin-kbd";
import { remarkBadge } from "./builtin-badge";


describe("wechat-preview plugins system", () => {
  test("loads all built-in plugins and documentation metadata", () => {
    const plugins = getAllPlugins();
    const ids = plugins.map((p) => p.doc.id);
    expect(ids).toContain("highlight");
    expect(ids).toContain("callout");
    expect(ids).toContain("kbd");
    expect(ids).toContain("badge");

    const docs = getPluginDocs();
    expect(docs.length).toBeGreaterThanOrEqual(4);
    for (const doc of docs) {
      expect(doc.id).toBeDefined();
      expect(doc.name).toBeDefined();
      expect(doc.category).toBeDefined();
      expect(doc.sampleMarkdown).toBeDefined();
      expect(doc.syntaxGuide).toBeDefined();
    }
  });

  test("getCombinedMilkdownPlugins returns executable plugin list", () => {
    const milkdownPlugins = getCombinedMilkdownPlugins();
    expect(Array.isArray(milkdownPlugins)).toBe(true);
    expect(milkdownPlugins.length).toBeGreaterThan(0);
  });

  test("getCombinedDefaultCss contains rules for all builtins", () => {
    const css = getCombinedDefaultCss();
    expect(css).toContain(".milkdown .editor mark");
    expect(css).toContain(".wechat-callout");
    expect(css).toContain(".wechat-kbd");
    expect(css).toContain(".wechat-badge");
  });

  test("remarkCallout parses GFM alerts into callout nodes", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: "[!NOTE]\n这是一个测试提示",
                },
              ],
            },
          ],
        },
      ],
    };

    const transform = remarkCallout();
    transform(tree);

    const callout = tree.children[0] as any;
    expect(callout.type).toBe("callout");
    expect(callout.calloutType).toBe("note");
    expect(callout.customTitle).toBe("");
    expect(callout.children[0].children[0].value).toBe("这是一个测试提示");
  });

  test("remarkCallout parses GFM alerts with inline custom title and emoji", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: "[!TIP] 实用技巧\n这是一个技巧说明",
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          children: [
            {
              type: "paragraph",
              children: [
                {
                  type: "text",
                  value: "[!WARNING] ⚠️ 重点防护\n这是一个警告说明",
                },
              ],
            },
          ],
        },
      ],
    };

    const transform = remarkCallout();
    transform(tree);

    const tipCallout = tree.children[0] as any;
    expect(tipCallout.type).toBe("callout");
    expect(tipCallout.calloutType).toBe("tip");
    expect(tipCallout.customTitle).toBe("实用技巧");
    expect(tipCallout.children[0].children[0].value).toBe("这是一个技巧说明");

    const warnCallout = tree.children[1] as any;
    expect(warnCallout.type).toBe("callout");
    expect(warnCallout.calloutType).toBe("warning");
    expect(warnCallout.customTitle).toBe("⚠️ 重点防护");
    expect(warnCallout.children[0].children[0].value).toBe("这是一个警告说明");
  });

  test("remarkKbd parses [[kbd:Key]] into kbd nodes", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "按下 [[kbd:Cmd]] + [[kbd:C]] 复制",
            },
          ],
        },
      ],
    };

    const transform = remarkKbd();
    transform(tree);

    const paragraph = tree.children[0] as any;
    expect(paragraph.children.length).toBe(5);
    expect(paragraph.children[0].value).toBe("按下 ");
    expect(paragraph.children[1].type).toBe("kbd");
    expect(paragraph.children[1].children[0].value).toBe("Cmd");
    expect(paragraph.children[2].value).toBe(" + ");
    expect(paragraph.children[3].type).toBe("kbd");
    expect(paragraph.children[3].children[0].value).toBe("C");
    expect(paragraph.children[4].value).toBe(" 复制");
  });

  test("remarkBadge parses [badge:type|text] into badge nodes", () => {
    const tree = {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "text",
              value: "状态：[badge:success|已上线]",
            },
          ],
        },
      ],
    };

    const transform = remarkBadge();
    transform(tree);

    const paragraph = tree.children[0] as any;
    expect(paragraph.children.length).toBe(2);
    expect(paragraph.children[0].value).toBe("状态：");
    expect(paragraph.children[1].type).toBe("badge");
    expect(paragraph.children[1].badgeType).toBe("success");
    expect(paragraph.children[1].children[0].value).toBe("已上线");
  });

  test("calloutWechatRenderer prepares icon and title", () => {
    const renderers = getCombinedWechatRenderers();
    const callout = renderers.find((r) => r.kind === "callout");
    expect(callout).toBeDefined();

    // Mock document and element
    const mockCreated: any[] = [];
    const mockDocument: any = {
      createElement: (tag: string) => {
        const el = {
          tagName: tag,
          className: "",
          attributes: {} as Record<string, string>,
          children: [] as any[],
          setAttribute: (name: string, val: string) => { el.attributes[name] = val; },
          appendChild: (c: any) => { el.children.push(c); },
          prepend: (c: any) => { el.children.unshift(c); },
        };
        mockCreated.push(el);
        return el;
      },
    };

    const element: any = {
      attributes: { "data-callout-type": "tip" },
      children: [],
      getAttribute: (name: string) => element.attributes[name],
      prepend: (c: any) => { element.children.unshift(c); },
    };

    const context: any = {
      document: mockDocument,
    };

    callout?.prepare?.(element, context);
    expect(element.children.length).toBe(1);
    const header = element.children[0];
    expect(header.attributes["data-wechat-node"]).toBe("callout-header");
    expect(header.children[0].textContent).toBe("✨");
    expect(header.children[1].textContent).toBe("建议");
  });

  test("calloutWechatRenderer handles custom title text and emoji", () => {
    const renderers = getCombinedWechatRenderers();
    const callout = renderers.find((r) => r.kind === "callout");

    const mockDocument: any = {
      createElement: (tag: string) => {
        const el = {
          tagName: tag,
          className: "",
          attributes: {} as Record<string, string>,
          children: [] as any[],
          setAttribute: (name: string, val: string) => { el.attributes[name] = val; },
          appendChild: (c: any) => { el.children.push(c); },
          prepend: (c: any) => { el.children.unshift(c); },
        };
        return el;
      },
    };

    // Case 1: Custom title text without emoji (retains default emoji)
    const el1: any = {
      attributes: { "data-callout-type": "note", "data-callout-title": "核心注意项" },
      children: [],
      getAttribute: (name: string) => el1.attributes[name],
      prepend: (c: any) => { el1.children.unshift(c); },
    };
    callout?.prepare?.(el1, { document: mockDocument } as any);
    const header1 = el1.children[0];
    expect(header1.children[0].textContent).toBe("💡");
    expect(header1.children[1].textContent).toBe("核心注意项");

    // Case 2: Custom title with leading emoji
    const el2: any = {
      attributes: { "data-callout-type": "tip", "data-callout-title": "🚀 快速上手" },
      children: [],
      getAttribute: (name: string) => el2.attributes[name],
      prepend: (c: any) => { el2.children.unshift(c); },
    };
    callout?.prepare?.(el2, { document: mockDocument } as any);
    const header2 = el2.children[0];
    expect(header2.children[0].textContent).toBe("🚀");
    expect(header2.children[1].textContent).toBe("快速上手");

    // Case 3: Structure level preset override
    const el3: any = {
      attributes: { "data-callout-type": "warning" },
      children: [],
      getAttribute: (name: string) => el3.attributes[name],
      prepend: (c: any) => { el3.children.unshift(c); },
    };
    callout?.prepare?.(el3, {
      document: mockDocument,
      structure: {
        calloutPresets: {
          warning: { title: "避坑指南", icon: "💣" },
        },
      },
    } as any);
    const header3 = el3.children[0];
    expect(header3.children[0].textContent).toBe("💣");
    expect(header3.children[1].textContent).toBe("避坑指南");
  });

  test("allows registering custom plugins", () => {
    registerPlugin({
      doc: {
        id: "test-plugin",
        name: "测试插件",
        category: "component",
        description: "自定义插件测试",
        sampleMarkdown: ":::test\n自定义组件\n:::",
        syntaxGuide: ":::test",
      },
      milkdownPlugins: [],
      defaultCss: ".test-plugin { color: red; }",
    });

    const docs = getPluginDocs();
    const found = docs.find((d) => d.id === "test-plugin");
    expect(found).toBeDefined();
    expect(found?.name).toBe("测试插件");
    expect(getCombinedDefaultCss()).toContain(".test-plugin { color: red; }");
  });
});
