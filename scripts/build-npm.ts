#!/usr/bin/env bun
/**
 * npm 构建脚本 — 编译 TS → JS，复制静态资产（不含字体），用于 npm publish。
 *
 * 产物结构:
 *   dist/cli.js                          # 编译后的 CLI（单文件 bundle）
 *   dist/assets/imgx/assets/             # templates + icons + browser（无字体）
 *   dist/assets/wechat-preview/assets/   # templates + browser-dist（无字体）
 *   dist/node_modules/@chenglou/pretext/ # Chrome file:// 加载
 *
 * 用法: bun run scripts/build-npm.ts
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "dist");

// ── Helper ──────────────────────────────────────────────────────

function copyDir(src: string, dest: string, label: string): void {
  if (!existsSync(src)) {
    console.warn(`  SKIP ${label}: not found`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`  COPY ${label}`);
}

// ── Step 0: Clean ───────────────────────────────────────────────

console.log(`\nBuild npm package → ${OUT}\n`);

if (existsSync(OUT)) {
  rmSync(OUT, { recursive: true, force: true });
}
mkdirSync(OUT, { recursive: true });

// ── Step 1: Ensure wechat-preview Vite bundle ───────────────────

console.log("Step 1: Vite bundle check...");
const manifestPath = join(
  ROOT,
  "src/wechat-preview/assets/browser-dist/.vite/manifest.json",
);

if (!existsSync(manifestPath)) {
  console.log("  Building wechat-preview Vite bundle...");
  const result = Bun.spawnSync({
    cmd: ["bun", "x", "vite", "build", "--config", "vite.wechat-preview.config.ts"],
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    console.error("Vite build failed");
    process.exit(1);
  }
} else {
  console.log("  Already built, skipping.");
}

// ── Step 2: Bundle TS → JS ──────────────────────────────────────

console.log("\nStep 2: Bundle TS → JS...");
const buildResult = Bun.spawnSync({
  cmd: [
    "bun", "build",
    join(ROOT, "src/cli.ts"),
    "--outfile", join(OUT, "cli.js"),
    "--target", "bun",
    "--minify",
    "--external", "@napi-rs/canvas",
    "--external", "cos-nodejs-sdk-v5",
  ],
  cwd: ROOT,
  stdout: "inherit",
  stderr: "inherit",
});

if (buildResult.exitCode !== 0) {
  console.error("Bundle failed");
  process.exit(1);
}
console.log("  → dist/cli.js");

// ── Step 3: Copy static assets (no fonts) ───────────────────────

console.log("\nStep 3: Copy static assets...");

const copies: Array<[string, string, string]> = [
  ["src/imgx/assets/templates",              "dist/assets/imgx/assets/templates",  "imgx/templates"],
  ["src/imgx/assets/icons",                  "dist/assets/imgx/assets/icons",      "imgx/icons"],
  ["src/imgx/assets/browser",                "dist/assets/imgx/assets/browser",    "imgx/browser"],
  ["src/wechat-preview/assets/templates",    "dist/assets/wechat-preview/assets/templates",    "wp/templates"],
  ["src/wechat-preview/assets/browser-dist", "dist/assets/wechat-preview/assets/browser-dist", "wp/browser-dist"],
];

for (const [src, dest, label] of copies) {
  copyDir(join(ROOT, src), join(ROOT, dest), label);
}

// ── Step 4: Copy @chenglou/pretext for Chrome file:// ───────────

console.log("\nStep 4: Copy @chenglou/pretext...");
const pretextSrc = join(ROOT, "node_modules/@chenglou/pretext/dist");
const pretextDest = join(OUT, "node_modules/@chenglou/pretext/dist");
copyDir(pretextSrc, pretextDest, "@chenglou/pretext/dist");

// ── Done ────────────────────────────────────────────────────────

console.log("\nDone!");
console.log(`  Package root: ${OUT}`);
console.log(`  CLI entry:    ${join(OUT, "cli.js")}`);
console.log(`  Assets:       ${join(OUT, "assets")}`);
console.log(`\n  Run 'npm pack --dry-run' to verify package contents.`);
console.log(`  Run 'npm publish' to publish.`);
