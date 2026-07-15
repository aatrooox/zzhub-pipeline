import { describe, expect, test } from "bun:test";
import { join } from "path";
import {
  escapeInlineJson,
  isExternalUrl,
  resolveMarkdownAsset,
  rewriteRelativeImagePaths,
  extractRenderResult,
  buildWechatPreviewShell,
} from "./index";

describe("escapeInlineJson", () => {
  test("escapes < and > for safe JSON embedding", () => {
    expect(escapeInlineJson("<script>")).toBe("\\u003Cscript\\u003E");
  });

  test("escapes & for safe JSON embedding", () => {
    expect(escapeInlineJson("a&b")).toBe("a\\u0026b");
  });

  test("handles empty string", () => {
    expect(escapeInlineJson("")).toBe("");
  });

  test("escapes multiple special characters", () => {
    expect(escapeInlineJson("<div>a&b</div>")).toBe("\\u003Cdiv\\u003Ea\\u0026b\\u003C/div\\u003E");
  });
});

describe("isExternalUrl", () => {
  test("recognizes http URLs", () => {
    expect(isExternalUrl("http://example.com/img.png")).toBe(true);
  });

  test("recognizes https URLs", () => {
    expect(isExternalUrl("https://example.com/img.png")).toBe(true);
  });

  test("recognizes data URIs", () => {
    expect(isExternalUrl("data:image/png;base64,abc")).toBe(true);
  });

  test("recognizes blob URIs", () => {
    expect(isExternalUrl("blob:http://example.com/123")).toBe(true);
  });

  test("recognizes file URIs", () => {
    expect(isExternalUrl("file:///tmp/img.png")).toBe(true);
  });

  test("recognizes protocol-relative URLs", () => {
    expect(isExternalUrl("//cdn.example.com/img.png")).toBe(true);
  });

  test("preserves unknown schemes for the final sanitizer", () => {
    expect(isExternalUrl("javascript:alert(1)")).toBe(true);
  });

  test("rejects relative paths", () => {
    expect(isExternalUrl("./img.png")).toBe(false);
    expect(isExternalUrl("../img.png")).toBe(false);
    expect(isExternalUrl("img.png")).toBe(false);
  });

  test("rejects absolute filesystem paths", () => {
    expect(isExternalUrl("/tmp/img.png")).toBe(false);
  });
});

describe("resolveMarkdownAsset", () => {
  test("passes through external URLs", () => {
    expect(resolveMarkdownAsset("https://example.com/img.png", "/base")).toBe("https://example.com/img.png");
  });

  test("passes through absolute paths", () => {
    expect(resolveMarkdownAsset("/tmp/img.png", "/base")).toBe("/tmp/img.png");
  });

  test("resolves relative paths against baseDir", () => {
    const result = resolveMarkdownAsset("./img.png", "/workspace/posts");
    expect(result).toBe(join("/workspace/posts", "img.png"));
  });

  test("resolves bare filename against baseDir", () => {
    const result = resolveMarkdownAsset("cover.jpg", "/workspace/assets");
    expect(result).toBe(join("/workspace/assets", "cover.jpg"));
  });

  test("handles empty path", () => {
    expect(resolveMarkdownAsset("", "/base")).toBe("");
  });

  test("trims whitespace", () => {
    expect(resolveMarkdownAsset("  https://example.com/img.png  ", "/base")).toBe("https://example.com/img.png");
  });
});

describe("rewriteRelativeImagePaths", () => {
  test("rewrites relative markdown image paths to absolute", () => {
    const input = "![alt](./img.png)";
    const result = rewriteRelativeImagePaths(input, "/workspace");
    expect(result).toContain(join("/workspace", "img.png"));
  });

  test("leaves external URLs unchanged", () => {
    const input = "![alt](https://example.com/img.png)";
    expect(rewriteRelativeImagePaths(input, "/workspace")).toBe(input);
  });

  test("rewrites <img> src attributes", () => {
    const input = '<img src="./cover.jpg" alt="test">';
    const result = rewriteRelativeImagePaths(input, "/workspace");
    expect(result).toContain(join("/workspace", "cover.jpg"));
  });

  test("handles angle-bracket image paths", () => {
    const input = "![alt](<./path with spaces/img.png>)";
    const result = rewriteRelativeImagePaths(input, "/workspace");
    expect(result).toContain(join("/workspace", "path with spaces/img.png"));
  });

  test("handles multiple images in one document", () => {
    const input = "![a](./1.png)\n![b](./2.png)";
    const result = rewriteRelativeImagePaths(input, "/base");
    expect(result).toContain(join("/base", "1.png"));
    expect(result).toContain(join("/base", "2.png"));
  });
});

describe("extractRenderResult", () => {
  test("extracts success result from script tag", () => {
    const dom = '<html><script id="zzhub-wechat-export-result" type="application/json">{"status":"success","html":"<p>test</p>"}</script></html>';
    const result = extractRenderResult(dom);
    expect(result.status).toBe("success");
    if ("html" in result) {
      expect(result.html).toBe("<p>test</p>");
    }
  });

  test("extracts error result", () => {
    const dom = '<script id="zzhub-wechat-export-result" type="application/json">{"status":"error","error":"something went wrong"}</script>';
    const result = extractRenderResult(dom);
    expect(result.status).toBe("error");
    if ("error" in result) {
      expect(result.error).toBe("something went wrong");
    }
  });

  test("throws when result script is missing", () => {
    expect(() => extractRenderResult("<html><div>no script</div></html>")).toThrow(
      "Wechat preview result script not found",
    );
  });

  test("throws when script content is empty", () => {
    const dom = '<script id="zzhub-wechat-export-result" type="application/json"></script>';
    expect(() => extractRenderResult(dom)).toThrow();
  });
});

describe("buildWechatPreviewShell", () => {
  test("embeds the final article fragment verbatim without a renderer bundle", () => {
    const article = '<section style="color: red;"><p>正文</p></section>';
    const shell = buildWechatPreviewShell(article, "标题 <安全>");

    expect(shell).toContain(`<main id="wechat-preview-content">${article}</main>`);
    expect(shell).toContain("标题 &lt;安全&gt;");
    expect(shell).not.toContain("editor-export.js");
    expect(shell).not.toContain("browser-dist");
  });
});
