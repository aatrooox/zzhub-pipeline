import { describe, expect, test } from "bun:test";
import {
  normalizeReferenceUrl,
  resolveLinkReference,
  type WechatLinkReference,
} from "./wechat-renderer";

describe("normalizeReferenceUrl", () => {
  test("treats trailing slash and hash as the same target", () => {
    expect(normalizeReferenceUrl("https://Example.com/path/?q=1#frag")).toBe(
      normalizeReferenceUrl("https://example.com/path?q=1"),
    );
  });
});

describe("resolveLinkReference", () => {
  test("dedupes the same URL even when anchor text differs", () => {
    const references: WechatLinkReference[] = [];

    const first = resolveLinkReference(
      "https://github.com/hugohe3/ppt-master",
      "ppt-master",
      references,
    );
    const second = resolveLinkReference(
      "https://github.com/hugohe3/ppt-master/",
      "开源仓库",
      references,
    );
    const third = resolveLinkReference(
      "https://example.com/other",
      "其它",
      references,
    );

    expect(first.index).toBe(1);
    expect(second.index).toBe(1);
    expect(second).toBe(first);
    expect(third.index).toBe(2);
    expect(references).toHaveLength(2);
    expect(references[0]?.text).toBe("ppt-master");
    expect(references[1]?.text).toBe("其它");
  });
});
