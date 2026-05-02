#!/usr/bin/env bun
/**
 * Build script — compiles zzhub-pipeline into a standalone binary + assets.
 *
 * Usage: bun run scripts/build.ts [--out-dir dist]
 *
 * Produces:
 *   dist/zzp                          — compiled binary
 *   dist/assets/imgx/assets/          — imgx templates, fonts, icons
 *   dist/assets/wechat-preview/       — wechat-preview templates + browser-dist
 *   dist/node_modules/@chenglou/      — pretext module (loaded by Chrome)
 */

import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// ── Parse args ──────────────────────────────────────────────────

const args = process.argv.slice(2);
let outDir = join(PACKAGE_ROOT, "dist");

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out-dir" && args[i + 1]) {
    outDir = resolve(args[++i]);
  }
}

const BINARY_NAME = "zzp";
const BINARY_PATH = join(outDir, BINARY_NAME);
const ASSETS_DIR = join(outDir, "assets");

// ── Helper ──────────────────────────────────────────────────────

function copyDir(src: string, dest: string, label: string) {
  if (!existsSync(src)) {
    console.warn(`  SKIP ${label}: source not found (${src})`);
    return;
  }
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`  COPY ${label}`);
}

// ── Clean ───────────────────────────────────────────────────────

console.log(`\nBuild output: ${outDir}\n`);

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });

// ── Step 1: Pre-build wechat-preview Vite bundle ────────────────

console.log("Step 1: Build wechat-preview Vite bundle...");
const viteManifestPath = join(
  PACKAGE_ROOT,
  "src/wechat-preview/assets/browser-dist/.vite/manifest.json",
);

if (!existsSync(viteManifestPath)) {
  const result = Bun.spawnSync({
    cmd: ["bun", "x", "vite", "build", "--config", "vite.wechat-preview.config.ts"],
    cwd: PACKAGE_ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (result.exitCode !== 0) {
    console.error("Failed to build wechat-preview Vite bundle");
    process.exit(1);
  }
} else {
  console.log("  Vite bundle already built, skipping.");
}

// ── Step 2: Compile binary ──────────────────────────────────────

console.log("\nStep 2: Compile binary...");
const buildResult = Bun.spawnSync({
  cmd: [
    "bun", "build",
    "--compile",
    "--minify",
    join(PACKAGE_ROOT, "src/cli.ts"),
    "--outfile", BINARY_PATH,
  ],
  cwd: PACKAGE_ROOT,
  stdout: "inherit",
  stderr: "inherit",
});

if (buildResult.exitCode !== 0) {
  console.error("Binary compilation failed");
  process.exit(1);
}
console.log(`  Binary: ${BINARY_PATH}`);

// ── Step 3: Copy static assets ──────────────────────────────────

console.log("\nStep 3: Copy static assets...");

// imgx assets (templates, fonts, icons, styles)
const imgxAssetsSrc = join(PACKAGE_ROOT, "src/imgx/assets");
const imgxAssetsDest = join(ASSETS_DIR, "imgx/assets");
copyDir(imgxAssetsSrc, imgxAssetsDest, "imgx/assets");

// wechat-preview templates
const wpTemplatesSrc = join(PACKAGE_ROOT, "src/wechat-preview/assets/templates");
const wpTemplatesDest = join(ASSETS_DIR, "wechat-preview/assets/templates");
copyDir(wpTemplatesSrc, wpTemplatesDest, "wechat-preview/templates");

// wechat-preview browser-dist (pre-built Vite bundle)
const wpDistSrc = join(PACKAGE_ROOT, "src/wechat-preview/assets/browser-dist");
const wpDistDest = join(ASSETS_DIR, "wechat-preview/assets/browser-dist");
copyDir(wpDistSrc, wpDistDest, "wechat-preview/browser-dist");

// @chenglou/pretext (loaded by Chrome as ES module via file:// URL)
const pretextSrc = join(PACKAGE_ROOT, "node_modules/@chenglou/pretext/dist/layout.js");
const pretextDest = join(outDir, "node_modules/@chenglou/pretext/dist/layout.js");
if (existsSync(pretextSrc)) {
  mkdirSync(join(outDir, "node_modules/@chenglou/pretext/dist"), { recursive: true });
  cpSync(pretextSrc, pretextDest);
  console.log("  COPY @chenglou/pretext");
} else {
  console.warn("  SKIP @chenglou/pretext: not found (run npm install first)");
}

// ── Done ────────────────────────────────────────────────────────

console.log("\nDone!");
console.log(`\nTo use: ${BINARY_PATH}`);
console.log(`Assets: ${ASSETS_DIR}/`);
console.log(`\nNote: the binary expects assets/ and node_modules/ next to it.`);
console.log(`      Move the entire dist/ directory to deploy.`);
