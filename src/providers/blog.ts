import { mkdir, readFile, writeFile } from "fs/promises";
import { join, resolve } from "path";
import { PipelineConfig, ResolvedWorkspacePaths } from "../config";
import { spawnSync } from "../spawn";
import { PublishResult, WorkflowState } from "../state";
import { stripFrontmatter } from "../text";
import { uploadFileToCos } from "./cos";

interface BlogPublishContext {
  state: WorkflowState;
  dryRun: boolean;
  config: PipelineConfig;
  workspacePaths: ResolvedWorkspacePaths;
}

// ![alt](path) — skips http(s):// URLs, captures [1]=alt [2]=rawPath
const LOCAL_IMAGE_RE = /!\[([^\]]*)\]\((?!https?:\/\/)([^)]+)\)/g;

export function extractLocalImagePaths(content: string, assetPath: string): Map<string, string> {
  const pathMap = new Map<string, string>();
  for (const match of content.matchAll(LOCAL_IMAGE_RE)) {
    const rawPath = match[2].trim();
    pathMap.set(rawPath, resolve(assetPath, rawPath));
  }
  return pathMap;
}

export function replaceLocalImagePaths(content: string, urlMap: Map<string, string>): string {
  return content.replace(LOCAL_IMAGE_RE, (original, alt: string, rawPath: string) => {
    const url = urlMap.get(rawPath.trim());
    return url ? `![${alt}](${url})` : original;
  });
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
  if (!cosPat) {
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
  const category = "posts";
  const blogRoot = workspacePaths.blogRoot;
  const blogPostPath = join(blogRoot, "content", category, `${state.metadata.slug}.md`);

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
  const author = state.route.content_profile || "default";
  lines.push(`author: ${author}`);
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
      status: "skipped",
      detail: "dry-run",
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

  await mkdir(join(blogRoot, "content", category), { recursive: true });
  await writeFile(blogPostPath, blogContent, "utf-8");
  const result = spawnSync(config.commands.blogPublish, { cwd: blogRoot });

  if (result.exitCode !== 0) {
    return {
      route: "blog",
      status: "failed",
      detail: `blog publish command failed: ${config.commands.blogPublish.join(" ")}`,
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

  return {
    route: "blog",
    status: "success",
    detail: null,
    published_at: new Date().toISOString(),
    content_version: state.artifacts.content_version,
    render_version: state.artifacts.render_version,
  };
}
