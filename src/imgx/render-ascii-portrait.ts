#!/usr/bin/env bun
import { getArg, getIntArg, parseArgs, requireArg } from "./cli";
import { ensureParentDir, findChrome, printSaved, resolveInputPath } from "./runtime";
import { renderAsciiPortraitPng } from "./ascii-portrait";

export function runRenderAsciiPortraitCli(argv: string[]): void {
  const parsed = parseArgs(argv);
  const outPath = requireArg(parsed, "out");
  const avatarPath = resolveInputPath(requireArg(parsed, "avatar"));
  const template = getArg(parsed, "template", "ascii-portrait-3-4");
  const defaultChars =
    template === "ascii-portrait-tile"
      ? "@#X$%WM*+=-"
      : "@#X$%WM*+=-";
  const title = getArg(parsed, "title");
  const footer = getArg(parsed, "footer", "公众号 · 早早集市");
  const iconPath = resolveInputPath(getArg(parsed, "icon"));
  const bg = getArg(parsed, "bg", template === "ascii-portrait-tile" ? "#f5f0eb" : "auto");
  const chars = getArg(parsed, "chars", defaultChars);
  const columns = getIntArg(parsed, "columns", 0);
  const fontSize = getIntArg(parsed, "font-size", 0);
  const lineHeight = getIntArg(parsed, "line-height", 0);
  const width = getIntArg(parsed, "width", 900);
  const height = getIntArg(parsed, "height", 1200);

  const chromePath = findChrome();
  if (chromePath === null) {
    throw new Error("Chrome/Chromium not found");
  }

  ensureParentDir(outPath);
  renderAsciiPortraitPng({
    chromePath,
    outPath,
    avatarPath,
    bg,
    chars,
    columns,
    fontSize,
    lineHeight,
    width,
    height,
    templateName: template === "ascii-portrait-tile" ? "ascii-portrait-tile" : "ascii-portrait-3-4",
    title: title.length > 0 ? title : undefined,
    footer: footer.length > 0 ? footer : undefined,
    iconPath: iconPath.length > 0 ? iconPath : undefined,
  });
  printSaved(outPath);
}

if (import.meta.main) {
  runRenderAsciiPortraitCli(process.argv.slice(2));
}
