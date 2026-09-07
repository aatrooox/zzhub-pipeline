import type { PipelineConfig } from "./config";
import { resolveConfigRelativePath } from "./config";
import { getVisualParams } from "./routes";
import { resolveInputPath, ICONS_DIR } from "./imgx/runtime";
import { join } from "node:path";

/** 先判断 URL，再解析本机路径，避免把 http 地址当成相对文件名。 */
export function resolveBrandLogo(src: string, fromConfig = true): string {
  src = src.trim();
  if (!src || /^https?:\/\//i.test(src)) return src;
  return fromConfig ? resolveConfigRelativePath(src)! : resolveInputPath(src);
}

/** 账号配置优先于全局配置，再兼容旧 imgx.icon 和账号默认值。 */
export function resolveRenderBranding(config: PipelineConfig, account: string): { logo: string; footerText: string } {
  const branding = config.render.branding;
  const selected = branding.accounts[account];
  const visual = getVisualParams(account);
  const logo = selected?.logo ?? branding.logo ?? config.imgx.icon;
  return {
    logo: logo === null ? resolveInputPath(visual?.fallback_icon ?? join(ICONS_DIR, "logo.png")) : resolveBrandLogo(logo),
    footerText: selected?.footerText ?? branding.footerText ?? visual?.footer ?? config.wx.accounts[account]?.name ?? "",
  };
}
