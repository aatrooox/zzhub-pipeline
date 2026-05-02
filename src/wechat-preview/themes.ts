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
      primaryColor: "#111111",
      dividerColor: "#dadce0",
      blockquoteBorderColor: "#3c4043",
      bodyLineHeight: "1.92",
      bodyLetterSpacing: "0.03em",
    },
  },
  ancientone: {
    name: "rose-ledger",
    account: "ancientone",
    editorVars: {
      ...BASE_EDITOR_VARS,
      "--primary": "330 50% 58%",
      "--ring": "330 50% 58%",
      "--accent": "330 35% 96%",
      "--accent-foreground": "334 28% 22%",
      "--muted": "336 38% 97%",
      "--border": "334 26% 88%",
    },
    exportTheme: {
      containerStyle: buildContainerStyle({
        background: "#fffafb",
        color: "#4a3a44",
        fontFamily:
          "'SweiCurveLeg', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        lineHeight: "1.94",
        letterSpacing: "0.035em",
      }),
      footerText: "公众号 · 古一软件",
      footerStyle: buildFooterStyle("#b08a9d"),
      fontFamily:
        "'SweiCurveLeg', 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      bodyColor: "#4a3a44",
      mutedColor: "#7a6271",
      primaryColor: "#b35d85",
      dividerColor: "#ead5df",
      blockquoteBorderColor: "#d6a8bc",
      bodyLineHeight: "1.94",
      bodyLetterSpacing: "0.035em",
    },
  },
};

export function getWechatPreviewTheme(account: string): WechatPreviewTheme {
  return THEMES[account] ?? THEMES.default;
}

export function getWechatPreviewStyleName(account: string): string {
  return getWechatPreviewTheme(account).name;
}
