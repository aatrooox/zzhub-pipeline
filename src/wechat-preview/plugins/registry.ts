import type { MilkdownPlugin } from "@milkdown/kit/ctx";
import type { WechatElementRenderer } from "../wechat-renderer";
import type { WechatMarkdownPlugin, WechatPluginDoc } from "./types";
import { builtinHighlightPlugin } from "./builtin-highlight";
import { builtinCalloutPlugin } from "./builtin-callout";
import { builtinKbdPlugin } from "./builtin-kbd";
import { builtinBadgePlugin } from "./builtin-badge";

const BUILTIN_PLUGINS: WechatMarkdownPlugin[] = [
  builtinHighlightPlugin,
  builtinCalloutPlugin,
  builtinKbdPlugin,
  builtinBadgePlugin,
];

const customPlugins: WechatMarkdownPlugin[] = [];

export function registerPlugin(plugin: WechatMarkdownPlugin): void {
  // Avoid duplicate plugin IDs
  const existingIndex = customPlugins.findIndex((p) => p.doc.id === plugin.doc.id);
  if (existingIndex >= 0) {
    customPlugins[existingIndex] = plugin;
  } else {
    customPlugins.push(plugin);
  }
}

export function getAllPlugins(): WechatMarkdownPlugin[] {
  return [...BUILTIN_PLUGINS, ...customPlugins];
}

export function getPluginDocs(): WechatPluginDoc[] {
  return getAllPlugins().map((p) => p.doc);
}

export function getCombinedMilkdownPlugins(): MilkdownPlugin[] {
  const plugins: MilkdownPlugin[] = [];
  for (const plugin of getAllPlugins()) {
    plugins.push(...plugin.milkdownPlugins);
  }
  return plugins;
}

export function getCombinedWechatRenderers(): WechatElementRenderer[] {
  const renderers: WechatElementRenderer[] = [];
  for (const plugin of getAllPlugins()) {
    if (plugin.wechatRenderer) {
      renderers.push(plugin.wechatRenderer);
    }
  }
  return renderers;
}

export function getCombinedDefaultCss(): string {
  const cssBlocks: string[] = [];
  for (const plugin of getAllPlugins()) {
    if (plugin.defaultCss) {
      cssBlocks.push(plugin.defaultCss);
    }
  }
  return cssBlocks.join("\n\n");
}
