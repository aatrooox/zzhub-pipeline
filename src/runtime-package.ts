import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readArticleTheme } from "./article-theme";
import { resolveConfigRelativePath, type PipelineConfig } from "./config";
import { PACKAGE_ROOT } from "./runtime-paths";

/** 固定容器路径与非敏感配置包契约。 */
export const RUNTIME_ROOT = "/data/pipeline-runtime";
export type StudioTemplate = Record<string, unknown> & {
  id: string;
  images?: Array<Record<string, unknown> & { src: string }>;
  coverTheme?: { background?: { image?: { src: string } | null }; decoration?: { image?: { src: string } | null } };
};

/** 只收集渲染器实际使用的图片字段，不改写其他字符串。 */
export function templateImages(template: StudioTemplate): Array<{ src: string }> {
  const images = [...(template.images || [])];
  for (const image of [template.coverTheme?.background?.image, template.coverTheme?.decoration?.image]) {
    if (image) images.push(image);
  }
  if (images.some(image => !image || typeof image.src !== "string" || !image.src.trim())) throw new Error(`模板 ${template.id} 的图片来源无效`);
  return images;
}

/** 模板标识和固定素材保持原契约，拒绝路径和重复标识。 */
export function parseStudioTemplate(text: string, file: string): StudioTemplate {
  const value = JSON.parse(text) as StudioTemplate;
  if (!value || !/^[a-zA-Z0-9_-]+$/.test(value.id) || file !== `${value.id}.json` || (value.images !== undefined && !Array.isArray(value.images))) {
    throw new Error(`无效的 Studio 模板：${file}`);
  }
  templateImages(value);
  const keys = new Set<string>();
  for (const image of value.images || []) {
    if (image.templateAssetKey === undefined) continue;
    const key = image.templateAssetKey;
    if (typeof key !== "string" || !/^[a-zA-Z0-9_-]+$/.test(key) || keys.has(key) || (image.repeatEveryPage && !image.isAbsolute)) {
      throw new Error(`模板 ${file} 的固定素材标识或重复设置无效`);
    }
    keys.add(key);
  }
  return value;
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** 读取普通文件，配置包不跟随符号链接。 */
export async function readRuntimeSource(path: string): Promise<Buffer> {
  if (!(await lstat(path)).isFile()) throw new Error(`配置来源必须是普通文件：${path}`);
  return readFile(path);
}

/** 校验默认槽位引用，模板被删除后不能悄悄回退。 */
export function validateStudioDefaults(text: string, templateIds: Set<string>): void {
  const defaults = JSON.parse(text);
  if (!defaults || typeof defaults !== "object" || Array.isArray(defaults)) throw new Error("Studio 默认槽位配置无效");
  const ids = [defaults.defaultTemplateId, ...Object.values(defaults.slots || {}), ...Object.values(defaults.accounts || {}).flatMap(value => Object.values(value as object))];
  for (const id of ids) if (id != null && (typeof id !== "string" || !templateIds.has(id))) throw new Error(`默认槽位引用不存在的模板：${id}`);
}

/** 准备账号主题文件，只导出样式白名单，不复制凭据或本机插件入口。 */
export async function prepareMarkdownRuntime(config: PipelineConfig, accountMap: Record<string, string> = {}): Promise<{ files: Map<string, Uint8Array>; accounts: Record<string, unknown> }> {
  const files = new Map<string, Uint8Array>();
  const accounts: Record<string, unknown> = {};
  for (const [localAccount, value] of Object.entries(config.wx.accounts)) {
    const account = accountMap[localAccount] || localAccount;
    if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(account) || [".", "..", "__proto__", "constructor", "prototype"].includes(account)) throw new Error(`无效的样式账号标识：${account}`);
    if (Object.hasOwn(accounts, account)) throw new Error(`账号映射重复：${account}`);
    const next: Record<string, unknown> = { theme: value.theme, customCss: null, articleTheme: null };
    const theme = value.articleTheme ? await readArticleTheme(resolveConfigRelativePath(value.articleTheme)!) : null;
    // 独立配置已内嵌 CSS，部署时不依赖被替代的账号样式文件。
    if (value.customCss && theme?.manifest.css === undefined) {
      const name = `markdown/custom-css-${account}.css`;
      files.set(name, await readRuntimeSource(resolveConfigRelativePath(value.customCss)!));
      next.customCss = `${RUNTIME_ROOT}/${name}`;
    }
    if (theme) {
      const prefix = `markdown/article-themes/${account}`;
      for (const [name, bytes] of theme.files) files.set(`${prefix}/${name}`, bytes);
      files.set(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(theme.manifest, null, 2)));
      next.articleTheme = `${RUNTIME_ROOT}/${prefix}/manifest.json`;
    }
    accounts[account] = next;
  }
  return { files, accounts };
}

/** 写入带文件哈希的独立配置包，调用者在全部成功后切换目录。 */
export async function writeRuntimePackage(destination: string, templates: Map<string, StudioTemplate>, defaults: string, markdown: Awaited<ReturnType<typeof prepareMarkdownRuntime>>) {
  const files = new Map(markdown.files);
  validateStudioDefaults(defaults, new Set([...templates.values()].map(template => template.id)));
  for (const [name, template] of templates) {
    for (const image of templateImages(template)) {
      const url = new URL(image.src);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error(`模板 ${name} 的图片必须是 HTTPS 地址`);
    }
    files.set(`typeset-studio/templates/${name}`, Buffer.from(JSON.stringify(template, null, 2) + "\n"));
  }
  files.set("typeset-studio/default-template.json", Buffer.from(defaults));
  // 防止渲染时重新播种内置模板，使部署目录与文件清单保持一致。
  files.set("typeset-studio/templates/.initialized", Buffer.from("1"));
  files.set("typeset-studio/templates/.canvas-presets-v1", Buffer.from("1"));
  const patch = {
    plugins: { imageRenderer: { module: "@akairos/typeset-studio/adapter", options: { dataDir: `${RUNTIME_ROOT}/typeset-studio` } }, markdownRenderer: null },
    wx: { accounts: markdown.accounts },
  };
  files.set("pipeline.patch.json", Buffer.from(JSON.stringify(patch, null, 2) + "\n"));
  const version = JSON.parse(await readFile(join(PACKAGE_ROOT, "package.json"), "utf8")).dependencies["@akairos/typeset-studio"] as string;
  const manifest = { schemaVersion: 1, id: `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`, generatedAt: new Date().toISOString(), studioVersion: version,
    typesetTemplates: templates.size, markdownAccounts: Object.keys(markdown.accounts).length, files: Object.fromEntries([...files].map(([name, bytes]) => [name, sha256(bytes)])) };
  for (const [name, bytes] of files) {
    const path = join(destination, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { mode: 0o600 });
  }
  await writeFile(join(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  return manifest;
}

/** 配置包只接受普通文件，供导出覆盖检查和定向测试使用。 */
export async function runtimeFileNames(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await visit(join(directory, entry.name), `${name}/`);
      else if (entry.isFile()) result.push(name);
      else throw new Error(`配置包不能包含符号链接或特殊文件：${name}`);
    }
  }
  await visit(root);
  return result.sort();
}
