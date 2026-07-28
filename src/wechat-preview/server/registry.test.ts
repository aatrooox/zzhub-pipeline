import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  clearPreviewEntries,
  createPreviewEntry,
  getPreviewEntry,
  listPreviewEntries,
} from "./registry";

const prevDir = process.env.ZZHUB_WECHAT_PREVIEW_DIR;

describe("preview registry", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    if (prevDir === undefined) delete process.env.ZZHUB_WECHAT_PREVIEW_DIR;
    else process.env.ZZHUB_WECHAT_PREVIEW_DIR = prevDir;
  });

  test("creates, lists, gets, and clears entries", () => {
    dir = mkdtempSync(join(tmpdir(), "zzhub-preview-reg-"));
    process.env.ZZHUB_WECHAT_PREVIEW_DIR = dir;

    const created = createPreviewEntry({
      title: "Hello",
      account: "default",
      status: "success",
      duration_ms: 42,
      html: "<section>hi</section>",
    });
    expect(created.id).toBeTruthy();
    expect(created.html).toBe("<section>hi</section>");

    const listed = listPreviewEntries();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.title).toBe("Hello");

    const loaded = getPreviewEntry(created.id);
    expect(loaded?.html).toBe("<section>hi</section>");
    expect(loaded?.status).toBe("success");

    const failed = createPreviewEntry({
      title: "Bad",
      account: "default",
      status: "failed",
      duration_ms: 10,
      error: "boom",
      error_kind: "timeout",
    });
    expect(listPreviewEntries()).toHaveLength(2);
    expect(getPreviewEntry(failed.id)?.error_kind).toBe("timeout");

    const cleared = clearPreviewEntries();
    expect(cleared).toBe(2);
    expect(listPreviewEntries()).toHaveLength(0);
  });
});
