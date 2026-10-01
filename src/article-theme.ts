import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";

/** 模板只包含声明、CSS 与素材，不执行客户包中的脚本。 */
export const ArticleThemeSchema = z.object({
  schemaVersion: z.literal(1),
  engineVersion: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  name: z.string().min(1).max(80),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(500).default(""),
  stylesheet: z.string().default("article.css"),
  sample: z.string().default("example.md"),
  preview: z.string().default("preview.html"),
  license: z.string().default("LICENSE.txt"),
  assets: z.array(z.string()).max(100).default([]),
  editorVars: z.record(z.string(), z.string()).default({}),
  exportTheme: z.record(z.string(), z.string()).default({}),
  structure: z.object({
    numberedHeadings: z.boolean().default(false),
    headingLabel: z.string().max(30).default(""),
    quoteLabel: z.string().max(30).default(""),
    headerImage: z.string().nullable().default(null),
  }).default({ numberedHeadings: false, headingLabel: "", quoteLabel: "", headerImage: null }),
}).strict();

export type ArticleThemeManifest = z.infer<typeof ArticleThemeSchema>;
export interface ArticleThemePackage {
  manifest: ArticleThemeManifest;
  path: string;
  hash: string;
  css: string;
  files: Map<string, Uint8Array>;
}

/** 限制所有资源在包内，拒绝符号链接、目录越界及过大文件。 */
export async function readArticleTheme(inputPath: string): Promise<ArticleThemePackage> {
  const entry = resolve(inputPath);
  const entryStat = await lstat(entry);
  if (entryStat.isSymbolicLink()) throw new Error("模板入口不能是符号链接");
  const manifestPath = entryStat.isDirectory() ? join(entry, "manifest.json") : entry;
  const root = await realpath(dirname(manifestPath));
  const files = new Map<string, Uint8Array>();
  let total = 0;
  async function read(name: string): Promise<Uint8Array> {
    if (!name || isAbsolute(name) || name.split(/[\\/]/).includes("..") || name.includes("\\")) throw new Error("模板资源必须位于包内");
    const target = resolve(root, name);
    const rel = relative(root, target);
    if (!rel || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error("模板资源路径越界");
    let current = root;
    for (const part of rel.split(sep)) {
      current = join(current, part);
      if ((await lstat(current)).isSymbolicLink()) throw new Error("模板资源不能是符号链接");
    }
    const stat = await lstat(target);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error("模板单个资源不能超过 5 MiB");
    const bytes = await readFile(target);
    total += bytes.byteLength;
    if (total > 20 * 1024 * 1024) throw new Error("模板资源合计不能超过 20 MiB");
    files.set(name, bytes);
    return bytes;
  }
  const manifestName = basename(manifestPath);
  const manifest = ArticleThemeSchema.parse(JSON.parse(new TextDecoder().decode(await read(manifestName))));
  const paths = [manifest.stylesheet, manifest.sample, manifest.preview, manifest.license, ...manifest.assets];
  if (manifest.structure.headerImage) paths.push(manifest.structure.headerImage);
  for (const name of new Set(paths)) await read(name);
  const css = new TextDecoder().decode(files.get(manifest.stylesheet));
  // 模板无需 CSS 转义；拒绝用转义或注释隐藏的网络/文件资源。
  const unsafeCss = (value: string) => /\\|@import\b|url\s*\(|expression\s*\(/i.test(value.replace(/\/\*[\s\S]*?\*\//g, ""));
  if (Object.keys(manifest.editorVars).some(key => !/^--[a-zA-Z0-9_-]+$/.test(key))) throw new Error("模板变量名无效");
  for (const value of [...Object.values(manifest.editorVars), ...Object.values(manifest.exportTheme)]) {
    if (value.length > 8192 || unsafeCss(value)) throw new Error("模板变量不能包含外部资源或 CSS 转义");
  }
  if (manifest.structure.headerImage && !/\.(png|jpe?g|gif|webp)$/i.test(manifest.structure.headerImage)) throw new Error("模板页首素材仅支持 PNG、JPEG、GIF、WebP");
  if (css.length > 256_000 || unsafeCss(css)) throw new Error("模板 CSS 不支持外部资源、CSS 转义或可执行表达式");
  const digest = createHash("sha256").update(JSON.stringify(manifest)).update(css);
  for (const name of [...new Set([...manifest.assets, ...(manifest.structure.headerImage ? [manifest.structure.headerImage] : [])])].sort()) {
    digest.update(name).update(files.get(name)!);
  }
  return { manifest, path: join(root, manifestName), css, files, hash: digest.digest("hex") };
}

/** 内容寻址的只读副本，运行中修改原模板不会改变当前发布结果。 */
export async function snapshotArticleTheme(theme: ArticleThemePackage, destination: string): Promise<ArticleThemePackage> {
  await mkdir(destination, { recursive: true });
  const root = join(await realpath(destination), `${theme.manifest.id}-${theme.hash}`);
  try {
    const existing = await readArticleTheme(root);
    if (existing.hash !== theme.hash) throw new Error("已安装的模板被修改，请重新导入到新的目录");
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = await mkdtemp(join(dirname(root), ".import-"));
  try {
    for (const [name, bytes] of theme.files) {
      const target = join(temporary, name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }
    await writeFile(join(temporary, "manifest.json"), JSON.stringify(theme.manifest, null, 2));
    try { await rename(temporary, root); }
    catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes((error as NodeJS.ErrnoException).code || "")) throw error;
      if ((await readArticleTheme(root)).hash !== theme.hash) throw new Error("已安装的模板内容不一致");
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  const entry = join(root, "manifest.json");
  return { ...theme, path: entry };
}
