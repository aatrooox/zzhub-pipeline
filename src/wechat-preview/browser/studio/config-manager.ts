import type { WechatExportTheme } from "../../themes";

export interface StandaloneStyleConfig {
  schemaVersion: number;
  engineVersion: number;
  id: string;
  name: string;
  version: string;
  description?: string;
  editorVars: Record<string, string>;
  exportTheme: Partial<WechatExportTheme> | Record<string, string | undefined>;
  syntaxPresets?: Record<string, string>;
  structure?: {
    numberedHeadings?: boolean;
    headingLabel?: string;
    quoteLabel?: string;
    calloutPresets?: Record<string, { icon?: string; title?: string }>;
  };
  css?: string;
}

export function parseStyleConfig(jsonString: string): { ok: true; config: StandaloneStyleConfig } | { ok: false; error: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== "object") {
      return { ok: false, error: "JSON 格式必须为对象" };
    }
    if (data.schemaVersion !== 1 || data.engineVersion !== 1) {
      data.schemaVersion = 1;
      data.engineVersion = 1;
    }
    data.editorVars = data.editorVars || {};
    data.exportTheme = data.exportTheme || {};
    data.syntaxPresets = data.syntaxPresets || {};
    data.structure = data.structure || {};
    data.css = typeof data.css === "string" ? data.css : "";
    return { ok: true, config: data as StandaloneStyleConfig };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function exportStyleConfigBlob(config: StandaloneStyleConfig): { url: string; filename: string } {
  const content = JSON.stringify(config, null, 2) + "\n";
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const filename = `${config.id || "wechat-style"}.json`;
  return { url, filename };
}
