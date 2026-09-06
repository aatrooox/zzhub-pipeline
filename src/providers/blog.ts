import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { PipelineConfig, ResolvedWorkspacePaths } from "../config";
import { spawnSync } from "../spawn";
import { reportProgress } from "../monitor/recorder";
import { PublishResult, WorkflowState } from "../state";
import { stripFrontmatter } from "../text";
import { uploadFileToCos } from "./cos";

interface BlogPublishContext {
  state: WorkflowState;
  dryRun: boolean;
  config: PipelineConfig;
  workspacePaths: ResolvedWorkspacePaths;
}

const LOCAL_IMAGE_RE = /!\[([^\]]*)\]\((?![a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g;

export function extractLocalImagePaths(content: string, assetPath: string): Map<string, string> {
  const pathMap = new Map<string, string>();
  for (const match of content.matchAll(LOCAL_IMAGE_RE)) {
    const rawPath = (match[2] ?? match[3] ?? "").trim();
    const assetRoot = resolve(assetPath);
    const absolutePath = resolve(assetRoot, rawPath);
    const relativePath = relative(assetRoot, absolutePath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${/\\/.test(relativePath) ? "\\" : "/"}`) ||
      isAbsolute(relativePath)
    ) {
      throw new Error(`Local blog image escapes asset directory: ${rawPath}`);
    }
    pathMap.set(rawPath, absolutePath);
  }
  return pathMap;
}

export function replaceLocalImagePaths(content: string, urlMap: Map<string, string>): string {
  return content.replace(LOCAL_IMAGE_RE, (original, alt: string, anglePath: string, barePath: string) => {
    const rawPath = (anglePath ?? barePath ?? "").trim();
    const url = urlMap.get(rawPath);
    return url ? `![${alt}](${url})` : original;
  });
}

export function resolveBlogPostPath(
  blogRoot: string,
  date: string,
  slug: string,
): { directory: string; path: string } {
  const dateMatch = date.match(/^(\d{4})-(\d{2})-\d{2}$/);
  if (!dateMatch) {
    throw new Error(`Invalid blog publish date: ${date}`);
  }
  if (!slug || /[\\/]/.test(slug) || slug === "." || slug === "..") {
    throw new Error(`Invalid blog publish slug: ${slug}`);
  }

  const contentRoot = resolve(blogRoot, "content", "nezus");
  const directory = resolve(contentRoot, dateMatch[1], dateMatch[2]);
  const path = resolve(directory, `${slug}.md`);
  const relativePath = relative(contentRoot, path);
  if (
    dirname(path) !== directory ||
    relativePath === ".." ||
    relativePath.startsWith(`..${/\\/.test(relativePath) ? "\\" : "/"}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(`Blog post path escapes content directory: ${date}/${slug}`);
  }
  return { directory, path };
}

async function uploadBlogImages(
  content: string,
  assetPath: string,
  slug: string,
  config: PipelineConfig,
  dryRun: boolean,
): Promise<{ content: string; uploadedCount: number }> {
  const pathMap = extractLocalImagePaths(content, assetPath);
  if (pathMap.size === 0) {
    return { content, uploadedCount: 0 };
  }

  const cosPat = config.cos.pat;
  if (!cosPat && !dryRun) {
    throw new Error("No COS PAT configured. Set cos.pat in config.");
  }

  const folder = `blog/${slug}`;
  const urlMap = new Map<string, string>();

  for (const [rawPath, absPath] of pathMap) {
    const filename = absPath.split("/").pop()!;
    if (dryRun) {
      console.error(`[dry-run] COS upload: ${absPath} -> ${folder}/${filename}`);
      urlMap.set(rawPath, `${config.cos.publicBaseUrl}/${folder}/${filename}`);
      continue;
    }

    const result = await uploadFileToCos({
      localPath: absPath,
      folder,
      baseUrl: config.cos.baseUrl || config.wx.baseUrl,
      cosPat,
      publicBaseUrl: config.cos.publicBaseUrl,
    });
    urlMap.set(rawPath, result.url);
  }

  return {
    content: replaceLocalImagePaths(content, urlMap),
    uploadedCount: pathMap.size,
  };
}

export async function publishBlogRoute({
  state,
  dryRun,
  config,
  workspacePaths,
}: BlogPublishContext): Promise<PublishResult> {
  const postPath = join(state.asset_path, "post.md");
  const postContent = await readFile(postPath, "utf-8");
  const blogRoot = workspacePaths.blogRoot;
  const { directory: blogPostDir, path: blogPostPath } = resolveBlogPostPath(
    blogRoot,
    state.metadata.date,
    state.metadata.slug,
  );

  const lines = ["---"];
  lines.push(`title: "${state.metadata.title.replace(/"/g, '\\"')}"`);
  lines.push(`date: ${state.metadata.date}`);
  if (state.metadata.description) {
    lines.push(`description: "${state.metadata.description.replace(/"/g, '\\"')}"`);
  }
  if (state.metadata.tags.length > 0) {
    lines.push("tags:");
    for (const tag of state.metadata.tags) {
      lines.push(`  - ${tag}`);
    }
  }
  lines.push("author: Kairos");
  lines.push("---");

  const bodyWithFrontmatter = `${lines.join("\n")}\n\n${stripFrontmatter(postContent)}`;

  const { content: blogContent, uploadedCount } = await uploadBlogImages(
    bodyWithFrontmatter,
    state.asset_path,
    state.metadata.slug,
    config,
    dryRun,
  );

  if (dryRun) {
    console.error(`[dry-run] Blog: ${uploadedCount} image(s) would be uploaded to COS`);
    console.error(`[dry-run] Blog: write to ${blogPostPath}`);
    console.error(`[dry-run] Blog: cd ${blogRoot} && ${config.commands.blogPublish.join(" ")}`);
    return {
      route: "blog",
      account: "default",
      status: "skipped",
      detail: "dry-run",
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

  await mkdir(blogPostDir, { recursive: true });
  await writeFile(blogPostPath, blogContent, "utf-8");
  reportProgress({ stage: "publish.script", message: "正在运行博客发布命令" });
  const result = spawnSync(config.commands.blogPublish, { cwd: blogRoot });
  reportProgress({ stage: "publish.script", message: result.exitCode === 0 ? "博客发布命令完成" : "博客发布命令失败", current: 1, total: 1, unit: "targets" });

  if (result.exitCode !== 0) {
    return {
      route: "blog",
      account: "default",
      status: "failed",
      detail: `blog publish command failed: ${config.commands.blogPublish[0]} (exit=${result.exitCode ?? "unknown"}, signal=${result.signal ?? "none"}${result.error ? `, cause=${result.error.message}` : ""})`,
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

  return {
    route: "blog",
    account: "default",
    status: "success",
    detail: null,
    published_at: new Date().toISOString(),
    content_version: state.artifacts.content_version,
    render_version: state.artifacts.render_version,
  };
}
