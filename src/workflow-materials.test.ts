import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  getPreferredBodyPath,
  collectNewspicRequiredMarkers,
  shouldUseNewspicLongform,
  discoverRenderAssets,
  reconcileStateArtifacts,
} from "./workflow-materials";
import { defaultState, type ImagePlanStatus } from "./state";

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("getPreferredBodyPath", () => {
  test("returns source_body_path when it exists on disk", async () => {
    const workspace = await makeTempDir("zzhub-materials-body-");
    const bodyPath = join(workspace, "source.md");
    await writeFile(bodyPath, "content", "utf-8");

    const state = defaultState();
    state.source_body_path = bodyPath;
    state.asset_path = join(workspace, "posts");

    const result = await getPreferredBodyPath(state);
    expect(result).toBe(bodyPath);
  });

  test("falls back to asset_path/post.md when source_body_path missing", async () => {
    const workspace = await makeTempDir("zzhub-materials-fallback-");
    const assetPath = join(workspace, "posts", "2026-04-10-test");
    await mkdir(assetPath, { recursive: true });
    await writeFile(join(assetPath, "post.md"), "post content", "utf-8");

    const state = defaultState();
    state.source_body_path = "/nonexistent/path.md";
    state.asset_path = assetPath;

    const result = await getPreferredBodyPath(state);
    expect(result).toBe(join(assetPath, "post.md"));
  });

  test("returns null when neither exists", async () => {
    const state = defaultState();
    state.source_body_path = "/nonexistent/source.md";
    state.asset_path = "/nonexistent/asset";

    const result = await getPreferredBodyPath(state);
    expect(result).toBeNull();
  });
});

describe("collectNewspicRequiredMarkers", () => {
  test("collects markers from body text", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = null;

    const markers = collectNewspicRequiredMarkers("Some text\n\n插图1\n\nMore text\n\n插图2", state);
    expect(markers).toContain("插图1");
    expect(markers).toContain("插图2");
  });

  test("merges body markers with page_spec markers", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = {
      pagination_mode: "multi",
      min_pages: 2,
      max_pages: 0,
      require_image_every_page: true,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [
        { page: 1, image_markers: ["插图3"], image_layout: null, target_fill_ratio: null, note: null },
      ],
    };

    const markers = collectNewspicRequiredMarkers("插图1\n\n插图2", state);
    expect(markers).toContain("插图1");
    expect(markers).toContain("插图2");
    expect(markers).toContain("插图3");
  });

  test("deduplicates markers", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = {
      pagination_mode: "multi",
      min_pages: 1,
      max_pages: 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [
        { page: 1, image_markers: ["插图1"], image_layout: null, target_fill_ratio: null, note: null },
      ],
    };

    const markers = collectNewspicRequiredMarkers("插图1", state);
    const uniqueCount = new Set(markers).size;
    expect(uniqueCount).toBe(markers.length);
  });

  test("returns empty array when no markers found", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = null;

    const markers = collectNewspicRequiredMarkers("Plain text without markers", state);
    expect(markers).toEqual([]);
  });
});

describe("shouldUseNewspicLongform", () => {
  test("returns true for multi mode", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = {
      pagination_mode: "multi",
      min_pages: 2,
      max_pages: 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [],
    };

    expect(shouldUseNewspicLongform(state)).toBe(true);
  });

  test("returns false for single mode even with long body", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = {
      pagination_mode: "single",
      min_pages: 1,
      max_pages: 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [],
    };

    expect(shouldUseNewspicLongform(state)).toBe(false);
  });

  test("returns false for default/auto mode with short body", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = null;

    expect(shouldUseNewspicLongform(state)).toBe(false);
  });

  test("returns false for auto mode with long body", () => {
    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = {
      pagination_mode: "auto",
      min_pages: 1,
      max_pages: 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [],
    };

    expect(shouldUseNewspicLongform(state)).toBe(false);
  });
});

describe("discoverRenderAssets", () => {
  test("finds cover.png for wechat-article route", async () => {
    const workspace = await makeTempDir("zzhub-discover-article-");
    const assetPath = join(workspace, "posts", "2026-04-10-test");
    const imageDir = join(assetPath, "images", "wechat");
    await mkdir(imageDir, { recursive: true });
    await writeFile(join(imageDir, "cover.png"), "fake-png", "utf-8");

    const state = defaultState();
    state.route.primary = "wechat-article";
    state.asset_path = assetPath;

    const assets = await discoverRenderAssets(state);
    expect(assets).toHaveLength(1);
    expect(assets[0].kind).toBe("cover");
    expect(assets[0].route).toBe("wechat-article");
  });

  test("finds cover and page files for wechat-newspic route", async () => {
    const workspace = await makeTempDir("zzhub-discover-newspic-");
    const assetPath = join(workspace, "posts", "2026-04-10-newspic");
    const imageDir = join(assetPath, "images", "newspic");
    await mkdir(imageDir, { recursive: true });
    await writeFile(join(imageDir, "cover.png"), "cover", "utf-8");
    await writeFile(join(imageDir, "article-3.png"), "page3", "utf-8");
    await writeFile(join(imageDir, "article-10.png"), "page10", "utf-8");
    await writeFile(join(imageDir, "article-1.png"), "page1", "utf-8");
    await writeFile(join(imageDir, "article-2.png"), "page2", "utf-8");

    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.asset_path = assetPath;

    const assets = await discoverRenderAssets(state);
    expect(assets.length).toBeGreaterThanOrEqual(3);

    const pages = assets.filter((a) => a.kind === "page");
    expect(pages.map((page) => page.index)).toEqual([1, 2, 3, 10]);
  });

  test("returns empty array when image directory does not exist", async () => {
    const state = defaultState();
    state.route.primary = "wechat-article";
    state.asset_path = "/nonexistent/path";

    const assets = await discoverRenderAssets(state);
    expect(assets).toEqual([]);
  });
});

describe("reconcileStateArtifacts", () => {
  test("keeps completed recorded assets instead of adding stale page files", async () => {
    const workspace = await makeTempDir("zzhub-reconcile-assets-");
    const assetPath = join(workspace, "posts", "2026-04-10-newspic");
    const imageDir = join(assetPath, "images", "newspic");
    const pageOne = join(imageDir, "article-1.png");
    const pageTwo = join(imageDir, "article-2.png");
    await mkdir(imageDir, { recursive: true });
    await writeFile(pageOne, "page1", "utf-8");
    await writeFile(pageTwo, "page2", "utf-8");
    await writeFile(join(imageDir, "article-10.png"), "stale", "utf-8");

    const state = defaultState();
    state.route.primary = "wechat-newspic";
    state.asset_path = assetPath;
    state.phase.prepare.status = "done";
    state.phase.render.status = "done";
    state.phase.current = "publish";
    state.images.plan.needed = true;
    state.images.plan.status = "rendered";
    state.intent.newspic_render = {
      pagination_mode: "multi",
      min_pages: 2,
      max_pages: 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [],
    };
    state.images.render_assets = [
      { kind: "page", route: "wechat-newspic", path: pageOne, index: 1 },
      { kind: "page", route: "wechat-newspic", path: pageTwo, index: 2 },
    ];

    await reconcileStateArtifacts(state);

    expect(state.images.render_assets.map((asset) => asset.path)).toEqual([
      pageOne,
      pageTwo,
    ]);
  });

  test("does not resurrect stale on-disk images when render is pending (after content reset)", async () => {
    const workspace = await makeTempDir("zzhub-reconcile-stale-");
    const assetPath = join(workspace, "posts", "2026-04-10-stale");
    const imageDir = join(assetPath, "images", "wechat");
    await mkdir(imageDir, { recursive: true });
    await writeFile(join(imageDir, "cover.png"), "old-cover", "utf-8");

    const state = defaultState();
    state.route.primary = "wechat-article";
    state.asset_path = assetPath;
    // prepare is done, but render was reset back to pending by a content reset.
    state.phase.prepare.status = "done";
    state.phase.render.status = "pending";
    state.phase.publish.status = "pending";
    state.phase.current = "prepare";
    state.images.plan.needed = true;
    state.images.plan.status = "planned";
    state.images.render_assets = [];

    await reconcileStateArtifacts(state);

    // The leftover cover.png must NOT be reported as rendered.
    expect(state.images.render_assets).toEqual([]);
    expect(state.images.plan.status).toBe("planned");
  });

  test("re-discovers render assets from disk when render phase is done but state lost them", async () => {
    const workspace = await makeTempDir("zzhub-reconcile-rediscover-");
    const assetPath = join(workspace, "posts", "2026-04-10-redis");
    const imageDir = join(assetPath, "images", "wechat");
    await mkdir(imageDir, { recursive: true });
    await writeFile(join(imageDir, "cover.png"), "cover", "utf-8");

    const state = defaultState();
    state.route.primary = "wechat-article";
    state.asset_path = assetPath;
    state.phase.prepare.status = "done";
    state.phase.render.status = "done";
    state.phase.publish.status = "pending";
    state.phase.current = "publish";
    state.images.plan.needed = true;
    state.images.plan.status = "planned" as ImagePlanStatus; // lost the "rendered" marker
    state.images.render_assets = []; // lost the recorded asset

    await reconcileStateArtifacts(state);

    expect(state.images.render_assets).toHaveLength(1);
    expect(state.images.render_assets[0]?.kind).toBe("cover");
    expect(state.images.plan.status).toBe("rendered");
  });
});
