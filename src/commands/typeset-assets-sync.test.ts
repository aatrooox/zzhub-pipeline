import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { createTypesetAssetsSyncCommand } from "./typeset-assets-sync";
import type { uploadFileToCos } from "../providers/cos";
import { readArticleTheme } from "../article-theme";

let root: string;
let previousConfig: string | undefined;
let previousDataDir: string | undefined;
let output: ReturnType<typeof spyOn>;
const image = PNG.sync.write(new PNG({ width: 2, height: 2 }));
const template = { id: "jinx", name: "Jinx", images: [{ src: "/uploads/jinx.png", templateAssetKey: "background", x: 12 }] };
const verifyUrl = async () => {};
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "zzp-typeset-sync-"));
  previousConfig = process.env.ZZHUB_PIPELINE_CONFIG;
  previousDataDir = process.env.TYPESET_DATA_DIR;
  delete process.env.TYPESET_DATA_DIR;
  process.env.ZZHUB_PIPELINE_CONFIG = join(root, "config.json");
  await mkdir(join(root, "templates")); await mkdir(join(root, "uploads"));
  await writeFile(join(root, "uploads/jinx.png"), image);
  await writeFile(join(root, "templates/jinx.json"), JSON.stringify(template));
  await writeFile(join(root, "default-template.json"), JSON.stringify({ slots: { article_cover: "jinx" } }));
  await writeFile(join(root, "custom.css"), "p { color: red; }");
  await writeFile(process.env.ZZHUB_PIPELINE_CONFIG, JSON.stringify({
    plugins: { imageRenderer: { module: "@akairos/typeset-studio/adapter", options: { dataDir: root } } },
    cos: { pat: "secret-cos-token", publicBaseUrl: "https://cdn.example" },
    wx: { baseUrl: "https://relay.example", accounts: { default: { appId: "private-app-id", appSecret: "private-secret", pat: "private-pat", customCss: "custom.css" } } },
  }));
  output = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => {
  output.mockRestore();
  if (previousConfig === undefined) delete process.env.ZZHUB_PIPELINE_CONFIG; else process.env.ZZHUB_PIPELINE_CONFIG = previousConfig;
  if (previousDataDir === undefined) delete process.env.TYPESET_DATA_DIR; else process.env.TYPESET_DATA_DIR = previousDataDir;
  await rm(root, { recursive: true, force: true });
});
const result = (path: string) => readFile(path, "utf8").then(JSON.parse);

/** 上传替身保留真实图片输入，验证按内容去重而不是按文件名。 */
function uploader(callback?: () => Promise<void>) {
  return async (input: Parameters<typeof uploadFileToCos>[0]) => {
    expect((await readFile(input.localPath)).equals(image)).toBe(true);
    await callback?.();
    return { localPath: input.localPath, key: "typeset-studio/assets/jinx.png", url: "https://cdn.example/jinx.png" };
  };
}

test("dry-run reads only referenced images and never uploads, verifies URLs, or writes", async () => {
  await writeFile(join(root, "uploads/unused.png"), image);
  const command = createTypesetAssetsSyncCommand({ upload: async () => { throw new Error("unexpected upload"); }, verifyUrl: async () => { throw new Error("unexpected verification"); } });
  await command(["--dry-run", "--output", join(root, "runtime")]);
  expect(JSON.stringify(output.mock.calls)).toContain("jinx.png");
  expect(JSON.stringify(output.mock.calls)).not.toContain("unused.png");
  expect(await readdir(root)).not.toContain("runtime");
  expect(await result(join(root, "templates/jinx.json"))).toEqual(template);
});

test("deduplicates shared images, rewrites only sources, and exports styles without credentials", async () => {
  await writeFile(join(root, "templates/shared.json"), JSON.stringify({ ...template, id: "shared" }));
  const style = { schemaVersion: 1, engineVersion: 1, id: "style", name: "Style", version: "1.0.0", css: "p { color: #123456; }", exportTheme: { bodyFontSize: "18px" } };
  await writeFile(join(root, "style.json"), JSON.stringify(style));
  const configPath = join(root, "config.json");
  const config = await result(configPath);
  config.wx.accounts.default.articleTheme = "style.json";
  await writeFile(configPath, JSON.stringify(config));
  let uploads = 0;
  const command = createTypesetAssetsSyncCommand({ upload: uploader(async () => { uploads++; }), verifyUrl });
  const destination = join(root, "runtime");
  await command(["--output", destination]);
  expect(uploads).toBe(1);
  expect((await result(join(root, "templates/jinx.json"))).images[0]).toEqual({ ...template.images[0], src: "https://cdn.example/jinx.png" });
  const patch = await result(join(destination, "pipeline.patch.json"));
  expect(patch.wx.accounts.default).toMatchObject({ customCss: null, articleTheme: "/data/pipeline-runtime/markdown/article-themes/default/manifest.json" });
  expect((await readArticleTheme(join(destination, "markdown/article-themes/default/manifest.json"))).css).toBe(style.css);
  for (const secret of ["secret-cos-token", "private-secret", "private-app-id", "private-pat"]) expect(JSON.stringify(patch)).not.toContain(secret);
  expect((await result(join(destination, "manifest.json"))).typesetTemplates).toBe(2);
  expect((await readFile(join(root, "uploads/jinx.png"))).equals(image)).toBe(true);
  await command(["--output", destination]);
  expect(uploads).toBe(1);
});

test("uploads data URLs and preserves fixed layout fields", async () => {
  await writeFile(join(root, "templates/jinx.json"), JSON.stringify({ ...template, images: [{ ...template.images[0], src: `data:image/png;base64,${image.toString("base64")}` }] }));
  await createTypesetAssetsSyncCommand({ upload: uploader(), verifyUrl })(["--output", join(root, "runtime")]);
  expect((await result(join(root, "templates/jinx.json"))).images[0]).toMatchObject({ src: "https://cdn.example/jinx.png", templateAssetKey: "background", x: 12 });
});

test("upload and URL failures preserve templates and the existing output", async () => {
  const path = join(root, "templates/jinx.json");
  const original = await readFile(path, "utf8");
  await expect(createTypesetAssetsSyncCommand({ upload: async () => { throw new Error("upload failed"); }, verifyUrl })(["--output", join(root, "runtime")])).rejects.toThrow("upload failed");
  await expect(createTypesetAssetsSyncCommand({ upload: uploader(), verifyUrl: async () => { throw new Error("unavailable URL"); } })(["--output", join(root, "runtime")])).rejects.toThrow("unavailable URL");
  expect(await readFile(path, "utf8")).toBe(original);
  expect(await readdir(root)).not.toContain("runtime");
});

test("detects edits made while uploading and reuses successful uploads on retry", async () => {
  let uploads = 0;
  const path = join(root, "templates/jinx.json");
  const upload = uploader(async () => { uploads++; await writeFile(path, JSON.stringify({ ...template, name: "edited" })); });
  const command = createTypesetAssetsSyncCommand({ upload, verifyUrl });
  await expect(command(["--output", join(root, "runtime")])).rejects.toThrow("已修改");
  expect((await result(path)).name).toBe("edited");
  await command(["--output", join(root, "runtime")]);
  expect(uploads).toBe(1);
});

test("refuses output directories that could destroy sources or unrelated files", async () => {
  const command = createTypesetAssetsSyncCommand({ upload: uploader(), verifyUrl });
  await expect(command(["--output", root, "--dry-run"])).rejects.toThrow("覆盖");
  const unrelated = join(root, "unrelated"); await mkdir(unrelated); await writeFile(join(unrelated, "important"), "keep");
  await expect(command(["--output", unrelated])).rejects.toThrow();
  expect(await readFile(join(unrelated, "important"), "utf8")).toBe("keep");
});

test("rejects missing default templates and unselected local references before upload", async () => {
  await writeFile(join(root, "templates/second.json"), JSON.stringify({ ...template, id: "second" }));
  const command = createTypesetAssetsSyncCommand({ upload: uploader(), verifyUrl });
  await expect(command(["--template", "jinx", "--dry-run"])).rejects.toThrow("未选中");
  await writeFile(join(root, "default-template.json"), JSON.stringify({ slots: { article_cover: "missing" } }));
  await expect(command(["--dry-run"])).rejects.toThrow("不存在");
});

test("account mapping exports matching style and default slots without changing local account config", async () => {
  const destination = join(root, "runtime");
  await createTypesetAssetsSyncCommand({ upload: uploader(), verifyUrl })(["--output", destination, "--account-map", '{"default":"cloud_account"}']);
  const patch = await result(join(destination, "pipeline.patch.json"));
  expect(patch.wx.accounts.default).toBeUndefined();
  expect(patch.wx.accounts.cloud_account.customCss).toBe("/data/pipeline-runtime/markdown/custom-css-cloud_account.css");
  expect((await result(join(destination, "typeset-studio/default-template.json"))).accounts.cloud_account.article_cover).toBe("jinx");
  expect((await result(join(root, "config.json"))).wx.accounts.default.appId).toBe("private-app-id");
});
