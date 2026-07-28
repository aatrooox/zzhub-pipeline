/**
 * Zod schemas for PipelineConfig.
 *
 * Replaces hand-written interfaces + normalize functions + default values.
 */

import { z } from "zod";

// ── Helpers ───────────────────────────────────────────────────────

const trimmedNonEmptyString = (fallback: string) =>
  z.preprocess(
    (val) => (typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined),
    z.string().default(fallback),
  );

const nullableTrimmedString = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return val;
  },
  z.string().nullable().default(null),
);

function withObjectDefault<T extends z.ZodObject<any>>(schema: T) {
  // All fields in the schema have defaults, so parse({}) always succeeds.
  return schema.optional().default(() => schema.parse({}) as any);
}

// ── Sub-schemas ───────────────────────────────────────────────────

const WechatExportThemeOverridesSchema = z.object({
  containerStyle: z.string().optional(),
  footerText: z.string().optional(),
  footerStyle: z.string().optional(),
  fontFamily: z.string().optional(),
  bodyColor: z.string().optional(),
  mutedColor: z.string().optional(),
  h2Color: z.string().optional(),
  h3Color: z.string().optional(),
  primaryColor: z.string().optional(),
  dividerColor: z.string().optional(),
  blockquoteBorderColor: z.string().optional(),
  bodyLineHeight: z.string().optional(),
  bodyLetterSpacing: z.string().optional(),
});

const WechatThemeOverridesSchema = withObjectDefault(
  z.object({
    editorVars: z.record(z.string(), z.string()).default({}),
    exportTheme: withObjectDefault(WechatExportThemeOverridesSchema),
  }),
);

const WxAccountConfigSchema = z.object({
  pat: z.string().default(""),
  appId: z.string().default(""),
  appSecret: z.string().default(""),
  customCss: z.string().nullable().default(null),
  theme: WechatThemeOverridesSchema,
});

const WxConfigSchema = withObjectDefault(
  z.object({
    baseUrl: trimmedNonEmptyString(""),
    timeout: z.preprocess(
      (val) => {
        if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
        return undefined;
      },
      z.number().default(30000),
    ),
    defaultAccount: trimmedNonEmptyString("default"),
    accounts: z
      .record(z.string(), WxAccountConfigSchema)
      .default({ default: { pat: "", appId: "", appSecret: "", customCss: null, theme: { editorVars: {}, exportTheme: {} } } }),
  }),
);

const PipelinePathConfigSchema = withObjectDefault(
  z.object({
    workspaceRoot: nullableTrimmedString,
    postsDirName: trimmedNonEmptyString("posts"),
    postsPathPattern: trimmedNonEmptyString("{date}-{slug}"),
    blogRoot: nullableTrimmedString,
    zotepadExportHtml: nullableTrimmedString,
  }),
);

const PipelineServiceConfigSchema = withObjectDefault(
  z.object({
    zotepadBaseUrl: trimmedNonEmptyString("http://127.0.0.1:54577"),
    zotepadToken: z.string().default(""),
  }),
);

const PipelineCommandConfigSchema = withObjectDefault(
  z.object({
    blogPublish: z
      .array(z.string())
      .default(["pnpm", "publish:post"])
      .pipe(z.array(z.string()).min(1)),
  }),
);

const CosConfigSchema = withObjectDefault(
  z.object({
    pat: z.string().default(""),
    baseUrl: nullableTrimmedString,
    publicBaseUrl: trimmedNonEmptyString(""),
  }),
);

const PluginsConfigSchema = withObjectDefault(
  z.object({
    imageRenderer: z.string().nullable().default(null),
    markdownRenderer: z.string().nullable().default(null),
  }),
);

const ImgxConfigSchema = withObjectDefault(
  z.object({
    icon: z.string().nullable().default(null),
  }),
);

// ── Top-level schema ──────────────────────────────────────────────

export const PipelineConfigSchema = z.object({
  paths: PipelinePathConfigSchema,
  services: PipelineServiceConfigSchema,
  commands: PipelineCommandConfigSchema,
  wx: WxConfigSchema,
  cos: CosConfigSchema,
  plugins: PluginsConfigSchema,
  imgx: ImgxConfigSchema,
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;

// ── Sub-type exports ──────────────────────────────────────────────

export type WxAccountConfig = z.infer<typeof WxAccountConfigSchema>;
export type WxConfig = z.infer<typeof WxConfigSchema>;
export type PipelinePathConfig = z.infer<typeof PipelinePathConfigSchema>;
export type PipelineServiceConfig = z.infer<typeof PipelineServiceConfigSchema>;
export type PipelineCommandConfig = z.infer<typeof PipelineCommandConfigSchema>;
export type CosConfig = z.infer<typeof CosConfigSchema>;
export type PluginsConfig = z.infer<typeof PluginsConfigSchema>;
export type ImgxConfig = z.infer<typeof ImgxConfigSchema>;
export type WechatExportThemeOverrides = z.infer<typeof WechatExportThemeOverridesSchema>;
export type WechatThemeOverrides = z.infer<typeof WechatThemeOverridesSchema>;

// ── Schema instances for reuse ────────────────────────────────────

export { WxAccountConfigSchema, WxConfigSchema, PipelinePathConfigSchema };
