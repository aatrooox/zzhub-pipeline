import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { imageSize } from "image-size";
import { parseArgs, optionalArg, flagArg } from "../args";
import { loadConfig, resolveConfigRelativePath } from "../config";
import { printHelp, printResult } from "../output";
import { uploadFileToCos } from "../providers/cos";
import { parseStudioTemplate, prepareMarkdownRuntime, readRuntimeSource, runtimeFileNames, sha256, templateImages, validateStudioDefaults, writeRuntimePackage } from "../runtime-package";

type Upload = typeof uploadFileToCos;
type SyncRecord = { url: string; key: string; hash: string };

/** GET 校验公开图片；失败时不能把模板引用换成不可用地址。 */
export async function verifyAssetUrl(value: string): Promise<void> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("素材地址必须是无凭据的 HTTPS URL");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error(`素材读取失败：HTTP ${response.status}`);
  const final = new URL(response.url);
  if (final.protocol !== "https:") { await response.body.cancel(); throw new Error("素材重定向必须使用 HTTPS"); }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value: bytes } = await reader.read();
      if (done) break;
      length += bytes.length;
      if (length > 20 * 1024 * 1024) throw new Error("模板素材不能超过 20 MiB");
      chunks.push(bytes);
    }
    const dimensions = imageSize(Buffer.concat(chunks));
    if (!dimensions.width || !dimensions.height) throw new Error("素材地址没有返回有效图片");
  } finally { await reader.cancel().catch(() => {}); }
}

/** 临时文件后重命名，上传记录和模板不会出现半写入 JSON。 */
async function atomicJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}

function contains(parent: string, child: string) {
  const path = relative(parent, child);
  return path === "" || (!isAbsolute(path) && path !== ".." && !path.startsWith("../"));
}

/** 仅覆盖本命令以前生成且文件清单一致的输出目录。 */
async function checkOutput(output: string, dataDir: string, inputs: string[]) {
  if (contains(output, dataDir) || contains(join(dataDir, "templates"), output) || contains(join(dataDir, "uploads"), output) || inputs.some(path => contains(output, path))) {
    throw new Error("输出目录不能覆盖 Studio 数据或配置来源");
  }
  const entry = await lstat(output).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (!entry) return;
  if (!entry.isDirectory()) throw new Error("输出必须是普通目录，不能是符号链接");
  const manifest = JSON.parse(await readFile(join(output, "manifest.json"), "utf8"));
  if (manifest.schemaVersion !== 1 || !manifest.files) throw new Error("输出目录不是有效的运行时配置包");
  const names = await runtimeFileNames(output);
  if (JSON.stringify(names) !== JSON.stringify(["manifest.json", ...Object.keys(manifest.files)].sort())) throw new Error("输出目录含额外文件，拒绝覆盖");
}

export function createTypesetAssetsSyncCommand(dependencies: { upload?: Upload; verifyUrl?: typeof verifyAssetUrl } = {}) {
  return async function typesetAssetsSync(args: string[]): Promise<void> {
    const parsed = parseArgs(args);
    if (parsed.help) {
      printHelp(`Usage: zzp typeset-assets-sync [options]
  --data-dir       Studio data directory (defaults to TYPESET_DATA_DIR or imageRenderer.options.dataDir)
  --output         Runtime package output directory (default: ./pipeline-runtime)
  --template       Upload assets of one template ID; package still exports all templates
  --account-map    JSON object mapping local account keys to Worker account keys
  --dry-run        Validate local inputs and report without uploads or writes`);
      return;
    }
    const config = loadConfig();
    const rawMap = optionalArg(parsed, "account-map");
    const accountMap = rawMap ? JSON.parse(rawMap) as Record<string, string> : {};
    if (!accountMap || typeof accountMap !== "object" || Array.isArray(accountMap) || Object.entries(accountMap).some(([key, value]) => !Object.hasOwn(config.wx.accounts, key) || typeof value !== "string" || !value)) {
      throw new Error("--account-map 必须是已有本机账号到 Worker 账号的 JSON 映射");
    }
    const entry = config.plugins.imageRenderer;
    const configured = typeof entry === "object" && entry ? entry.options.dataDir : undefined;
    const value = optionalArg(parsed, "data-dir") || process.env.TYPESET_DATA_DIR?.trim() || (typeof configured === "string" ? resolveConfigRelativePath(configured) : null);
    if (!value) throw new Error("请设置 --data-dir 或 plugins.imageRenderer.options.dataDir");
    const dataDir = await realpath(resolve(value));
    const outputValue = resolve(optionalArg(parsed, "output") || "pipeline-runtime");
    const output = join(await realpath(dirname(outputValue)), outputValue.split(/[\/]/).pop()!);
    const filter = optionalArg(parsed, "template")?.replace(/\.json$/, "");
    const files = (await readdir(join(dataDir, "templates"))).filter(name => name.endsWith(".json")).sort();
    if (!files.length || (filter && !files.includes(`${filter}.json`))) throw new Error("未找到要同步的 Studio 模板");
    const originals = new Map<string, string>();
    const templates = new Map<string, ReturnType<typeof parseStudioTemplate>>();
    const selected = files.filter(name => !filter || name === `${filter}.json`);
    const defaultsPath = join(dataDir, "default-template.json");
    const defaults = (await readRuntimeSource(defaultsPath)).toString();
    const deployedDefaults = JSON.parse(defaults);
    for (const [localAccount, account] of Object.entries(accountMap)) {
      const slots = localAccount === "default" ? deployedDefaults.slots : deployedDefaults.accounts?.[localAccount];
      if (slots) {
        deployedDefaults.accounts ||= {};
        deployedDefaults.accounts[account] = structuredClone(slots);
      }
    }
    const pending: Array<{ template: string; src: string; path: string | null; bytes: Buffer; extension: string }> = [];
    const remote = new Set<string>();
    for (const file of files) {
      const text = (await readRuntimeSource(join(dataDir, "templates", file))).toString();
      const template = parseStudioTemplate(text, file);
      originals.set(file, text); templates.set(file, template);
      for (const src of new Set(templateImages(template).map(image => image.src))) {
        if (/^https:\/\//i.test(src)) {
          const url = new URL(src);
          if (url.username || url.password) throw new Error(`模板 ${file} 的 URL 不能含凭据`);
          remote.add(src); continue;
        }
        if (/^[a-z]+:/i.test(src) && !src.startsWith("data:image/")) throw new Error(`模板 ${file} 的素材必须使用 HTTPS 或本地图片`);
        if (!selected.includes(file)) throw new Error(`未选中的模板 ${file} 仍含本地图片；请不带 --template 同步全部`);
        let bytes: Buffer, path: string | null = null, extension: string;
        if (src.startsWith("data:")) {
          const match = src.match(/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
          if (!match) throw new Error(`模板 ${file} 的 data URL 格式不受支持`);
          bytes = Buffer.from(match[2], "base64"); extension = `.${match[1] === "jpeg" ? "jpg" : match[1]}`;
        } else {
          path = /^\/?uploads\//.test(src) ? resolve(dataDir, src.replace(/^\//, "")) : resolve(dataDir, src);
          if (/^\/?uploads\//.test(src) && !contains(join(dataDir, "uploads"), path)) throw new Error("上传素材路径越界");
          bytes = await readRuntimeSource(path); extension = extname(path).toLowerCase();
        }
        if (!/^\.(png|jpe?g|gif|webp)$/.test(extension) || bytes.length > 20 * 1024 * 1024) throw new Error(`模板 ${file} 的素材格式或大小不受支持`);
        const dimensions = imageSize(bytes);
        if (!dimensions.width || !dimensions.height) throw new Error(`模板 ${file} 的素材不是有效图片`);
        pending.push({ template: file, src, path, bytes, extension });
      }
    }
    validateStudioDefaults(defaults, new Set([...templates.values()].map(template => template.id)));
    const markdown = await prepareMarkdownRuntime(config, accountMap);
    await checkOutput(output, dataDir, pending.flatMap(item => item.path ? [item.path] : []));
    const summary = { data_dir: dataDir, output_dir: output, templates: files, assets: pending.map(({ bytes, ...item }) => ({ ...item, bytes: bytes.length })) };
    if (flagArg(parsed, "dry-run")) { printResult({ ...summary, dry_run: true }); return; }
    if (pending.length && (!config.cos.pat || !config.cos.publicBaseUrl)) throw new Error("请配置 cos.pat 和 cos.publicBaseUrl");
    const verify = dependencies.verifyUrl || verifyAssetUrl;
    for (const url of remote) await verify(url);
    const recordPath = join(dataDir, "asset-sync", "uploads.json");
    const records: Record<string, SyncRecord> = JSON.parse(await readFile(recordPath, "utf8").catch(error => { if (error.code === "ENOENT") return "{}"; throw error; }));
    const target = sha256(`${config.cos.baseUrl || config.wx.baseUrl}\n${config.cos.publicBaseUrl}`);
    const temporary = await mkdtemp(join(tmpdir(), "zzp-template-assets-"));
    let stage = "";
    const synced: Array<{ template: string; hash: string; url: string; reused: boolean }> = [];
    try {
      const replacements = new Map<string, string>();
      const verified = new Set<string>();
      for (const item of pending) {
        const hash = sha256(item.bytes), key = `${target}:${hash}`;
        let result = records[key];
        const reused = Boolean(result);
        if (!result) {
          const localPath = join(temporary, `${hash}${item.extension}`);
          await writeFile(localPath, item.bytes);
          result = { ...(await (dependencies.upload || uploadFileToCos)({ localPath, folder: "typeset-studio/assets", baseUrl: config.cos.baseUrl || config.wx.baseUrl, cosPat: config.cos.pat, publicBaseUrl: config.cos.publicBaseUrl })), hash };
        }
        if (!verified.has(result.url)) { await verify(result.url); verified.add(result.url); }
        records[key] = { hash, key: result.key, url: result.url };
        await atomicJson(recordPath, records);
        replacements.set(item.src, result.url);
        synced.push({ template: item.template, hash, url: result.url, reused });
      }
      for (const template of templates.values()) for (const image of templateImages(template)) image.src = replacements.get(image.src) || image.src;
      stage = await mkdtemp(join(dirname(output), ".pipeline-runtime-"));
      const manifest = await writeRuntimePackage(stage, templates, JSON.stringify(deployedDefaults, null, 2) + "\n", markdown);
      // 长时间上传期间编辑器仍可保存；提交前检测冲突，不覆盖新内容。
      for (const [file, text] of originals) if ((await readFile(join(dataDir, "templates", file), "utf8")) !== text) throw new Error(`模板 ${file} 在同步期间已修改，请重跑`);
      if (await readFile(defaultsPath, "utf8") !== defaults) throw new Error("默认槽位在同步期间已修改，请重跑");
      for (const item of pending) if (item.path && sha256(await readRuntimeSource(item.path)) !== sha256(item.bytes)) throw new Error(`素材在同步期间已修改：${item.path}`);
      const backup = join(dataDir, "asset-sync", "backups", manifest.id);
      for (const file of selected) {
        const path = join(dataDir, "templates", file);
        if (!pending.some(item => item.template === file)) continue;
        await mkdir(backup, { recursive: true }); await copyFile(path, join(backup, file));
        if (await readFile(path, "utf8") !== originals.get(file)) throw new Error(`模板 ${file} 保存冲突，请重跑`);
        await atomicJson(path, templates.get(file));
      }
      await checkOutput(output, dataDir, []);
      const previous = `${output}.${crypto.randomUUID()}.previous`;
      const exists = await lstat(output).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (exists) await rename(output, previous);
      try { await rename(stage, output); stage = ""; }
      catch (error) { if (exists) await rename(previous, output); throw error; }
      if (exists) await rm(previous, { recursive: true });
      printResult({ ...summary, assets: synced, manifest, backup_dir: pending.length ? backup : null });
    } finally {
      await rm(temporary, { recursive: true, force: true });
      if (stage) await rm(stage, { recursive: true, force: true });
    }
  };
}

export const typesetAssetsSync = createTypesetAssetsSyncCommand();
