import juice from "juice/client";
import type { WechatExportTheme } from "./themes";

export type WechatElementKind =
  | "image"
  | "code-block"
  | "inline-code"
  | "heading"
  | "paragraph"
  | "emphasis"
  | "blockquote"
  | "link"
  | "list"
  | "table"
  | "divider"
  | "hard-break"
  | "article";

export interface WechatLinkReference {
  index: number;
  text: string;
  url: string;
}

export interface WechatRenderContext {
  document: Document;
  root: HTMLElement;
  theme: WechatExportTheme;
  references: WechatLinkReference[];
}

export interface WechatElementRenderer {
  kind: WechatElementKind;
  selector: string;
  /** Optional selector used after CSS has been inlined. Defaults to selector. */
  finalizeSelector?: string;
  prepare?: (element: HTMLElement, context: WechatRenderContext) => void;
  finalize?: (element: HTMLElement, context: WechatRenderContext) => void;
}

export type WechatRendererOverrides = Partial<Record<WechatElementKind, WechatElementRenderer>>;

export interface RenderWechatHtmlInput {
  semanticHtml: string;
  baseCss: string;
  customCss?: string;
  editorVars?: Record<string, string>;
  theme: WechatExportTheme;
  renderers?: WechatRendererOverrides;
}

const ALLOWED_TAGS = new Set([
  "section",
  "p",
  "blockquote",
  "ul",
  "ol",
  "li",
  "pre",
  "code",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "del",
  "a",
  "img",
  "br",
  "hr",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);

const DROP_WITH_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  "link",
  "meta",
  "svg",
  "math",
  "canvas",
  "template",
  "noscript",
  "video",
  "audio",
  "source",
]);

const ALLOWED_STYLE_PROPERTIES = new Set([
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "color",
  "text-align",
  "line-height",
  "letter-spacing",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "background",
  "background-color",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-top-color",
  "border-top-style",
  "border-top-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-bottom-color",
  "border-bottom-style",
  "border-bottom-width",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-bottom-right-radius",
  "border-bottom-left-radius",
  "border-collapse",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "width",
  "min-width",
  "max-width",
  "height",
  "max-height",
  "display",
  "vertical-align",
  "list-style",
  "list-style-type",
  "list-style-position",
  "white-space",
  "white-space-collapse",
  "text-wrap-mode",
  "text-wrap-style",
  "word-break",
  "word-wrap",
  "overflow-wrap",
  "overflow",
  "overflow-x",
  "overflow-y",
  "box-sizing",
  "table-layout",
  "text-size-adjust",
  "-webkit-text-size-adjust",
]);

const ALLOWED_DISPLAY_VALUES = new Set([
  "block",
  "inline",
  "inline-block",
  "list-item",
  "table",
  "table-row",
  "table-cell",
  "table-row-group",
  "table-header-group",
  "none",
]);

function setNodeKind(element: HTMLElement, kind: string): void {
  element.dataset.wechatNode = kind;
}

function replaceTag(element: HTMLElement, tagName: string): HTMLElement {
  const replacement = element.ownerDocument.createElement(tagName);
  for (const attribute of Array.from(element.attributes)) {
    replacement.setAttribute(attribute.name, attribute.value);
  }
  while (element.firstChild) {
    replacement.appendChild(element.firstChild);
  }
  element.replaceWith(replacement);
  return replacement;
}

function isExternalLink(href: string): boolean {
  return /^(?:https?:)?\/\//i.test(href);
}

function imageIsOnlyContent(parent: HTMLElement, image: HTMLElement): boolean {
  return Array.from(parent.childNodes).every((node) => {
    if (node === image) return true;
    return node.nodeType === 3 && !(node.nodeValue ?? "").trim();
  });
}

const imageRenderer: WechatElementRenderer = {
  kind: "image",
  selector: "img",
  finalizeSelector: "figure, figcaption",
  prepare(element, context) {
    setNodeKind(element, "image");
    const src = element.getAttribute("src");
    if (src) element.setAttribute("data-src", src);

    const parent = element.parentElement;
    if (!parent || parent.tagName.toLowerCase() !== "p" || !imageIsOnlyContent(parent, element)) {
      return;
    }

    const figure = context.document.createElement("figure");
    setNodeKind(figure, "image-block");
    parent.replaceWith(figure);
    figure.appendChild(element);

    const caption = element.getAttribute("title")?.trim();
    element.removeAttribute("title");
    if (caption) {
      const figcaption = context.document.createElement("figcaption");
      setNodeKind(figcaption, "image-caption");
      figcaption.textContent = caption;
      figure.appendChild(figcaption);
    }
  },
  finalize(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "figure") replaceTag(element, "section");
    if (tagName === "figcaption") replaceTag(element, "p");
  },
};

const codeBlockRenderer: WechatElementRenderer = {
  kind: "code-block",
  selector: "pre",
  prepare(element, context) {
    setNodeKind(element, "code-block-body");
    const code = element.querySelector<HTMLElement>("code");
    if (code) setNodeKind(code, "code-block-code");

    const wrapper = context.document.createElement("section");
    setNodeKind(wrapper, "code-block");
    element.replaceWith(wrapper);

    const language = element.getAttribute("data-language")?.trim();
    if (language) {
      const label = context.document.createElement("p");
      setNodeKind(label, "code-language");
      label.textContent = language;
      wrapper.appendChild(label);
    }
    wrapper.appendChild(element);
  },
};

const inlineCodeRenderer: WechatElementRenderer = {
  kind: "inline-code",
  selector: "code:not(pre code)",
  prepare(element) {
    setNodeKind(element, "inline-code");
  },
  finalize(element) {
    replaceTag(element, "span");
  },
};

const headingRenderer: WechatElementRenderer = {
  kind: "heading",
  selector: "h1, h2, h3, h4, h5, h6",
  prepare(element) {
    setNodeKind(element, `heading-${element.tagName.slice(1)}`);
  },
  finalize(element) {
    replaceTag(element, "section");
  },
};

const paragraphRenderer: WechatElementRenderer = {
  kind: "paragraph",
  selector: "p",
  prepare(element) {
    if (!element.dataset.wechatNode) setNodeKind(element, "paragraph");
  },
};

const emphasisRenderer: WechatElementRenderer = {
  kind: "emphasis",
  selector: "strong, b, em, i, s, del, u",
  prepare(element) {
    setNodeKind(element, element.tagName.toLowerCase());
  },
};

const blockquoteRenderer: WechatElementRenderer = {
  kind: "blockquote",
  selector: "blockquote",
  prepare(element) {
    setNodeKind(element, "blockquote");
  },
};

const linkRenderer: WechatElementRenderer = {
  kind: "link",
  selector: "a",
  prepare(element, context) {
    const href = element.getAttribute("href")?.trim() ?? "";
    if (!isExternalLink(href)) {
      setNodeKind(element, "internal-link");
      return;
    }

    const reference: WechatLinkReference = {
      index: context.references.length + 1,
      text: element.textContent?.trim() || href,
      url: href,
    };
    context.references.push(reference);
    setNodeKind(element, "external-link");

    const marker = context.document.createElement("span");
    setNodeKind(marker, "link-marker");
    marker.textContent = `[${reference.index}]`;
    element.after(marker);
  },
  finalize(element) {
    if (element.dataset.wechatNode === "external-link") replaceTag(element, "span");
  },
};

const listRenderer: WechatElementRenderer = {
  kind: "list",
  selector: "ul, ol, li",
  prepare(element, context) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === "ul") setNodeKind(element, "bullet-list");
    if (tagName === "ol") setNodeKind(element, "ordered-list");
    if (tagName !== "li") return;

    const isTask = element.getAttribute("data-item-type") === "task";
    setNodeKind(element, isTask ? "task-list-item" : "list-item");
    if (!isTask) return;

    const marker = context.document.createElement("span");
    setNodeKind(marker, "task-marker");
    marker.textContent = element.getAttribute("data-checked") === "true" ? "☑" : "☐";
    const content = element.querySelector<HTMLElement>(":scope > p") ?? element;
    content.prepend(marker);
  },
};

const tableRenderer: WechatElementRenderer = {
  kind: "table",
  selector: "table, thead, tbody, tr, th, td",
  prepare(element) {
    setNodeKind(element, element.tagName.toLowerCase());
  },
};

const dividerRenderer: WechatElementRenderer = {
  kind: "divider",
  selector: "hr",
  prepare(element) {
    setNodeKind(element, "divider");
  },
};

const hardBreakRenderer: WechatElementRenderer = {
  kind: "hard-break",
  selector: "br",
  prepare(element) {
    setNodeKind(element, "hard-break");
  },
};

const articleRenderer: WechatElementRenderer = {
  kind: "article",
  selector: ".zzhub-wechat-article",
  prepare(_element, context) {
    if (context.references.length > 0) {
      const references = context.document.createElement("section");
      setNodeKind(references, "references");

      const title = context.document.createElement("p");
      setNodeKind(title, "references-title");
      title.textContent = "相关链接";
      references.appendChild(title);

      const list = context.document.createElement("ol");
      setNodeKind(list, "references-list");
      for (const reference of context.references) {
        const item = context.document.createElement("li");
        setNodeKind(item, "reference-item");
        item.textContent = `[${reference.index}] ${reference.text}: ${reference.url}`;
        list.appendChild(item);
      }
      references.appendChild(list);
      context.root.appendChild(references);
    }

    if (context.theme.footerText) {
      const footer = context.document.createElement("section");
      setNodeKind(footer, "footer");
      const text = context.document.createElement("p");
      setNodeKind(text, "footer-text");
      text.textContent = context.theme.footerText;
      footer.appendChild(text);
      context.root.appendChild(footer);
    }
  },
};

const DEFAULT_RENDERERS: WechatElementRenderer[] = [
  imageRenderer,
  codeBlockRenderer,
  inlineCodeRenderer,
  headingRenderer,
  paragraphRenderer,
  emphasisRenderer,
  blockquoteRenderer,
  linkRenderer,
  listRenderer,
  tableRenderer,
  dividerRenderer,
  hardBreakRenderer,
  articleRenderer,
];

export function createWechatRendererRegistry(
  overrides: WechatRendererOverrides = {},
): WechatElementRenderer[] {
  return DEFAULT_RENDERERS.map((renderer) => overrides[renderer.kind] ?? renderer);
}

function runRendererPhase(
  phase: "prepare" | "finalize",
  renderers: WechatElementRenderer[],
  context: WechatRenderContext,
): void {
  for (const renderer of renderers) {
    const handler = renderer[phase];
    if (!handler) continue;
    const selector = phase === "finalize"
      ? renderer.finalizeSelector ?? renderer.selector
      : renderer.selector;
    const elements: HTMLElement[] = [];
    if (context.root.matches(selector)) elements.push(context.root);
    elements.push(...Array.from(context.root.querySelectorAll<HTMLElement>(selector)));
    for (const element of elements) {
      if (element.isConnected || element === context.root) handler(element, context);
    }
  }
}

function themeVariableDeclarations(
  editorVars: Record<string, string>,
  theme: WechatExportTheme,
): string {
  const customVariables = Object.entries(editorVars)
    .filter(([name]) => /^--[a-z0-9-_]+$/i.test(name))
    .map(([name, value]) => `${name}: ${value};`)
    .join("\n");

  return [
    customVariables,
    `--wx-font-family: ${theme.fontFamily};`,
    `--wx-body-color: ${theme.bodyColor};`,
    `--wx-muted-color: ${theme.mutedColor};`,
    `--wx-brand-ink: ${theme.primaryColor};`,
    `--wx-brand-accent: ${editorVars["--brand"] ?? "#ca6093"};`,
    `--wx-divider-color: ${theme.dividerColor};`,
    `--wx-blockquote-border: ${theme.blockquoteBorderColor};`,
    `--wx-body-line-height: ${theme.bodyLineHeight};`,
    `--wx-body-letter-spacing: ${theme.bodyLetterSpacing};`,
    `--wx-soft-surface: ${editorVars["--bg-warm"] ?? "#faf8f9"};`,
  ].filter(Boolean).join("\n");
}

export function buildWechatThemeCss(
  editorVars: Record<string, string>,
  theme: WechatExportTheme,
): string {
  return `
.milkdown .editor {
  ${themeVariableDeclarations(editorVars, theme)}
  ${theme.containerStyle};
}
.milkdown .editor [data-wechat-node="footer"] {
  ${theme.footerStyle};
}
`;
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
}

function sanitizeStyle(element: HTMLElement): void {
  const propertyNames: string[] = [];
  for (let index = 0; index < element.style.length; index += 1) {
    const name = element.style.item(index);
    if (name) propertyNames.push(name);
  }

  for (const property of propertyNames) {
    const value = element.style.getPropertyValue(property).trim();
    const unsafeValue = /(?:url\s*\(|expression\s*\(|javascript:|var\s*\()/i.test(value);
    const unsafeDisplay = property === "display" && !ALLOWED_DISPLAY_VALUES.has(value.toLowerCase());
    if (!ALLOWED_STYLE_PROPERTIES.has(property) || unsafeValue || unsafeDisplay) {
      element.style.removeProperty(property);
    }
  }

  if (!element.style.cssText.trim()) element.removeAttribute("style");
}

function allowedAttributesFor(element: HTMLElement): Set<string> {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "img") return new Set(["style", "src", "data-src", "alt", "width", "height"]);
  if (tagName === "a") return new Set(["style", "href", "title"]);
  if (tagName === "ol") return new Set(["style", "start"]);
  if (tagName === "th" || tagName === "td") return new Set(["style", "colspan", "rowspan", "align"]);
  return new Set(["style"]);
}

function sanitizeImageUrl(element: HTMLElement, attribute: "src" | "data-src"): void {
  const value = element.getAttribute(attribute)?.trim() ?? "";
  if (!value) {
    element.removeAttribute(attribute);
    return;
  }

  if (/^(?:javascript|vbscript):/i.test(value)) {
    element.removeAttribute(attribute);
    return;
  }

  if (/^data:/i.test(value) && !/^data:image\/(?:avif|gif|jpe?g|png|webp);base64,/i.test(value)) {
    element.removeAttribute(attribute);
  }
}

function sanitizeTree(root: HTMLElement): void {
  const elements = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].reverse();
  for (const element of elements) {
    const tagName = element.tagName.toLowerCase();
    if (DROP_WITH_CONTENT.has(tagName)) {
      if (element !== root) element.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(tagName)) {
      if (element !== root) element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const allowedAttributes = allowedAttributesFor(element);
    for (const attribute of Array.from(element.attributes)) {
      if (!allowedAttributes.has(attribute.name)) element.removeAttribute(attribute.name);
    }

    if (tagName === "a") {
      const href = element.getAttribute("href") ?? "";
      if (!/^(?:#|https?:\/\/|mailto:|tel:)/i.test(href)) element.removeAttribute("href");
    }
    if (tagName === "img") {
      sanitizeImageUrl(element, "src");
      sanitizeImageUrl(element, "data-src");
    }
    sanitizeStyle(element);
  }
}

export function renderWechatHtml(input: RenderWechatHtmlInput): string {
  const sourceDocument = parseHtml("");
  const compatibilityRoot = sourceDocument.createElement("section");
  compatibilityRoot.className = "milkdown";

  const root = sourceDocument.createElement("section");
  root.className = "editor zzhub-wechat-article";
  root.lang = "zh-CN";
  setNodeKind(root, "article");
  root.innerHTML = input.semanticHtml;
  compatibilityRoot.appendChild(root);
  sourceDocument.body.appendChild(compatibilityRoot);

  const references: WechatLinkReference[] = [];
  const renderers = createWechatRendererRegistry(input.renderers);
  runRendererPhase("prepare", renderers, {
    document: sourceDocument,
    root,
    theme: input.theme,
    references,
  });

  const css = [
    input.baseCss,
    buildWechatThemeCss(input.editorVars ?? {}, input.theme),
    input.customCss ?? "",
  ].filter(Boolean).join("\n");

  const inlinedHtml = juice.inlineContent(compatibilityRoot.outerHTML, css, {
    applyAttributesTableElements: false,
    applyHeightAttributes: false,
    applyStyleTags: false,
    applyWidthAttributes: false,
    inlinePseudoElements: false,
    preserveFontFaces: false,
    preserveImportant: false,
    preserveKeyFrames: false,
    preserveMediaQueries: false,
    preservePseudos: false,
    removeStyleTags: true,
    resolveCSSVariables: true,
  });

  const finalDocument = parseHtml(inlinedHtml);
  const finalRoot = finalDocument.querySelector<HTMLElement>(".zzhub-wechat-article");
  if (!finalRoot) throw new Error("Wechat article root missing after CSS inlining");

  runRendererPhase("finalize", renderers, {
    document: finalDocument,
    root: finalRoot,
    theme: input.theme,
    references,
  });
  sanitizeTree(finalRoot);
  return finalRoot.outerHTML;
}
