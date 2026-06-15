export interface WechatExportTheme {
  containerStyle: string;
  footerText: string;
  footerStyle: string;
  fontFamily: string;
  bodyColor: string;
  mutedColor: string;
  primaryColor: string;
  dividerColor: string;
  blockquoteBorderColor: string;
  bodyLineHeight: string;
  bodyLetterSpacing: string;
}

export interface WechatPreviewTheme {
  name: string;
  account: string;
  editorVars: Record<string, string>;
  exportTheme: WechatExportTheme;
}

const BASE_EDITOR_VARS: Record<string, string> = {
  "--background": "0 0% 100%",
  "--foreground": "240 10% 3.9%",
  "--card": "0 0% 100%",
  "--card-foreground": "240 10% 3.9%",
  "--muted": "240 4.8% 95.9%",
  "--muted-foreground": "240 3.8% 46.1%",
  "--primary-foreground": "0 0% 100%",
  "--border": "240 5.9% 90%",
};

function buildContainerStyle(options: {
  background: string;
  color: string;
  fontFamily: string;
  lineHeight?: string;
  letterSpacing?: string;
}): string {
  return [
    "padding: 14px 11px",
    `background: ${options.background}`,
    "background-size: 20px 20px",
    "background-position: center center",
    `font-family: ${options.fontFamily}`,
    "font-size: 16px",
    `color: ${options.color}`,
    "word-wrap: break-word",
    `line-height: ${options.lineHeight ?? "1.92"}`,
    `letter-spacing: ${options.letterSpacing ?? "0.03em"}`,
  ].join("; ");
}

function buildFooterStyle(color: string): string {
  return [
    "margin-top: 32px",
    "text-align: center",
    "font-size: 12px",
    `color: ${color}`,
  ].join("; ");
}

const THEMES: Record<string, WechatPreviewTheme> = {
  default: {
    name: "sage-journal",
    account: "default",
    editorVars: {
      ...BASE_EDITOR_VARS,
      "--primary": "220 9% 10%",
      "--ring": "220 9% 10%",
      "--accent": "210 14% 96%",
      "--accent-foreground": "220 9% 10%",
      "--muted": "210 14% 96%",
      "--muted-foreground": "215 8% 42%",
      "--border": "220 10% 86%",
      "--brand": "#ca6093",
      "--brand-soft": "#d4789e",
      "--brand-bg": "rgba(202, 96, 147, 0.08)",
      "--brand-bg-deep": "rgba(202, 96, 147, 0.14)",
      "--text": "#202124",
      "--text-soft": "#5f6368",
      "--text-mid": "#3c4043",
      "--divider": "#dadce0",
      "--bg-page": "#ffffff",
      "--bg-warm": "#f8f9fa",
    },
    exportTheme: {
      containerStyle: buildContainerStyle({
        background: "#ffffff",
        color: "#202124",
        fontFamily:
          "'SweiCurveLeg', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        lineHeight: "1.92",
        letterSpacing: "0.03em",
      }),
      footerText: "公众号 · 早早集市",
      footerStyle: buildFooterStyle("#8a8f98"),
      fontFamily:
        "'SweiCurveLeg', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      bodyColor: "#202124",
      mutedColor: "#5f6368",
      primaryColor: "#ca6093",
      dividerColor: "#dadce0",
      blockquoteBorderColor: "#ca6093",
      bodyLineHeight: "1.92",
      bodyLetterSpacing: "0.03em",
    },
  },
  ancientone: {
    name: "rose-ledger",
    account: "ancientone",
    editorVars: {
      ...BASE_EDITOR_VARS,
      "--primary": "337 38% 58%",
      "--ring": "337 38% 58%",
      "--accent": "337 30% 96%",
      "--accent-foreground": "337 28% 22%",
      "--muted": "338 25% 97%",
      "--border": "337 20% 88%",
      "--brand": "#ca6093",
      "--brand-soft": "#d4789e",
      "--brand-bg": "rgba(202, 96, 147, 0.08)",
      "--brand-bg-deep": "rgba(202, 96, 147, 0.14)",
      "--text": "#2c2c2c",
      "--text-soft": "#8c8c8c",
      "--text-mid": "#5c5c5c",
      "--divider": "#d8d0d3",
      "--bg-page": "#fefefe",
      "--bg-warm": "#faf8f9",
    },
    exportTheme: {
      containerStyle: buildContainerStyle({
        background: "#fefefe",
        color: "#2c2c2c",
        fontFamily:
          "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', -apple-system, 'SF Pro Text', 'Noto Sans SC', sans-serif",
        lineHeight: "2.0",
        letterSpacing: "0.015em",
      }),
      footerText: "公众号 · 古一软件",
      footerStyle: buildFooterStyle("#8c8c8c"),
      fontFamily:
        "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', -apple-system, 'SF Pro Text', 'Noto Sans SC', sans-serif",
      bodyColor: "#2c2c2c",
      mutedColor: "#8c8c8c",
      primaryColor: "#ca6093",
      dividerColor: "#d8d0d3",
      blockquoteBorderColor: "#ca6093",
      bodyLineHeight: "2.0",
      bodyLetterSpacing: "0.015em",
    },
  },
};

function definedValues<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result as Partial<T>;
}

export function getWechatPreviewTheme(
  account: string,
  overrides?: {
    editorVars?: Record<string, string>;
    exportTheme?: Partial<WechatExportTheme>;
  },
): WechatPreviewTheme {
  const base = THEMES[account] ?? THEMES.default;
  if (!overrides) return base;

  const hasEditorVars = overrides.editorVars && Object.keys(overrides.editorVars).length > 0;
  const hasExportTheme = overrides.exportTheme && Object.keys(definedValues(overrides.exportTheme)).length > 0;

  return {
    ...base,
    editorVars: hasEditorVars ? { ...base.editorVars, ...overrides.editorVars } : base.editorVars,
    exportTheme: hasExportTheme ? { ...base.exportTheme, ...definedValues(overrides.exportTheme!) } : base.exportTheme,
  };
}

export function getWechatPreviewStyleName(account: string): string {
  return getWechatPreviewTheme(account).name;
}
