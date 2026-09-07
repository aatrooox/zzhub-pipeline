import { z } from "zod";
import presets from "../cover-theme-presets.json";

/** 颜色使用可直接交给颜色选择器的十六进制值。 */
export const CoverColorSchema = z.string().regex(/^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|transparent)$/i, "请使用十六进制颜色");
export const CoverFormatSchema = z.enum(["poster-3-4", "wechat-cover-split"]);
export type CoverFormat = z.infer<typeof CoverFormatSchema>;

const FontSchema = z.object({
  fontFamily: z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} _-]+$/u, "请填写内置或本机字体名称").describe("内置字体：AlimamaShuHeiTi、LXGWNeoZhiSongPlus、LXGWWenKai；也可填写本机字体名称或 system-ui").default("AlimamaShuHeiTi"),
  fontSize: z.number().int().min(8).max(200).default(112),
  minFontSize: z.number().int().min(8).max(200).default(64),
  fontWeight: z.number().int().min(100).max(900).default(700),
  lineHeight: z.number().min(1).max(2.5).default(1.2),
  letterSpacing: z.number().min(-5).max(20).default(0),
}).strict();

const TypographySchema = z.object({
  title: FontSchema.prefault({}),
  subtitle: FontSchema.extend({ fontSize: z.number().int().min(8).max(200).default(56), minFontSize: z.number().int().min(8).max(200).default(40), fontWeight: z.number().int().min(100).max(900).default(400), lineHeight: z.number().min(1).max(2.5).default(1.4), fontFamily: FontSchema.shape.fontFamily.removeDefault().default("LXGWNeoZhiSongPlus") }).prefault({}),
  footer: FontSchema.extend({ fontSize: z.number().int().min(8).max(200).default(26), minFontSize: z.number().int().min(8).max(200).default(26), fontWeight: z.number().int().min(100).max(900).default(400), lineHeight: z.number().min(1).max(2.5).default(1.4), fontFamily: FontSchema.shape.fontFamily.removeDefault().default("LXGWNeoZhiSongPlus") }).prefault({}),
}).strict();
const ColorsSchema = z.object({
  text: CoverColorSchema.default("#1A1A1A"),
  accent: CoverColorSchema.default("#22A854"),
  muted: CoverColorSchema.default("#51665B"),
}).strict();
const StopSchema = z.object({ color: CoverColorSchema, offset: z.number().min(0).max(100) }).strict();
const PositionSchema = z.object({ x: z.number().min(0).max(100).default(50), y: z.number().min(0).max(100).default(50) }).strict();
const FillSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("solid"), color: CoverColorSchema }),
  z.object({ type: z.literal("linear"), angle: z.number().min(0).max(360).default(135), stops: z.array(StopSchema).min(2).max(12) }),
  z.object({ type: z.literal("radial"), position: PositionSchema.prefault({}), stops: z.array(StopSchema).min(2).max(12) }),
]);
export const CoverImageSchema = z.object({
  src: z.string().trim().min(1).max(8192),
  fit: z.enum(["cover", "contain", "fill"]).default("cover"),
  position: PositionSchema.prefault({}),
  opacity: z.number().min(0).max(1).default(1),
}).strict();
const BackgroundSchema = z.object({
  fill: FillSchema.prefault({ type: "solid", color: "#E6F5EF" }),
  image: CoverImageSchema.nullable().default(null),
  overlay: z.object({ color: CoverColorSchema, opacity: z.number().min(0).max(1) }).strict().nullable().default(null),
}).strict();
const DecorationSchema = z.object({
  pattern: z.enum(["none", "lines", "grid", "dots", "rings", "burst"]).default("none"),
  color: CoverColorSchema.default("#22A854"),
  opacity: z.number().min(0).max(1).default(0.12),
  size: z.number().min(8).max(400).default(64),
  image: CoverImageSchema.extend({ fit: z.enum(["cover", "contain", "fill"]).default("contain") }).nullable().default(null),
}).strict();
const InsetsSchema = z.object({
  top: z.number().min(0).max(1200).default(90),
  right: z.number().min(0).max(1200).default(84),
  bottom: z.number().min(0).max(1200).default(64),
  left: z.number().min(0).max(1200).default(84),
}).strict();
const LayoutSchema = z.object({
  textAlign: z.enum(["left", "center", "right"]).default("left"),
  verticalAlign: z.enum(["top", "center", "bottom"]).default("center"),
  safeArea: InsetsSchema.prefault({}),
}).strict();

/** 覆盖项不能带入默认值，否则会意外改掉主题原有颜色或字体。 */
function overrideSchema<S extends z.ZodRawShape>(schema: z.ZodObject<S>) {
  const shape = {} as { [K in keyof S]: z.ZodOptional<z.ZodType<z.output<S[K]>>> };
  for (const [key, value] of Object.entries(schema.shape)) {
    let field: z.core.$ZodType = value;
    while (field instanceof z.ZodDefault || field instanceof z.ZodPrefault) field = field.unwrap();
    (shape as Record<string, z.ZodType>)[key] = z.optional(field);
  }
  return z.object(shape).strict();
}

/** 两种尺寸复用主题，只覆盖有差异的参数。 */
const FormatOverridesSchema = z.object({
  typography: z.object({ title: overrideSchema(FontSchema).optional(), subtitle: overrideSchema(FontSchema).optional(), footer: overrideSchema(FontSchema).optional() }).strict().optional(),
  colors: overrideSchema(ColorsSchema).optional(),
  background: overrideSchema(BackgroundSchema).optional(),
  decoration: overrideSchema(DecorationSchema).optional(),
  layout: overrideSchema(LayoutSchema).extend({ safeArea: overrideSchema(InsetsSchema).optional() }).optional(),
}).strict();

/** 横幅只提供字号默认值，字体和字重继续继承主题。 */
function bannerFont(fontSize: number, minFontSize: number) {
  return overrideSchema(FontSchema).extend({
    fontSize: FontSchema.shape.fontSize.removeDefault().default(fontSize),
    minFontSize: FontSchema.shape.minFontSize.removeDefault().default(minFontSize),
  }).prefault({});
}
const BannerOverridesSchema = FormatOverridesSchema.extend({
  typography: z.object({ title: bannerFont(88, 48), subtitle: bannerFont(40, 32), footer: bannerFont(24, 24) }).strict().prefault({}),
  layout: overrideSchema(LayoutSchema).extend({
    safeArea: InsetsSchema.extend({ top: InsetsSchema.shape.top.removeDefault().default(34), right: InsetsSchema.shape.right.removeDefault().default(48), bottom: InsetsSchema.shape.bottom.removeDefault().default(28), left: InsetsSchema.shape.left.removeDefault().default(48) }).prefault({}),
  }).prefault({}),
});

export const CoverStyleSchema = z.object({
  typography: TypographySchema.prefault({}),
  colors: ColorsSchema.prefault({}),
  background: BackgroundSchema.prefault({}),
  decoration: DecorationSchema.prefault({}),
  layout: LayoutSchema.prefault({}),
}).strict();
export const CoverThemeSchema = CoverStyleSchema.extend({
  name: z.string().trim().min(1),
  description: z.string().default(""),
  formats: z.object({
    "poster-3-4": FormatOverridesSchema.prefault({}),
    "wechat-cover-split": BannerOverridesSchema.prefault({}),
  }).strict().prefault({}),
}).strict();

const ThemesSchema = z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]*$/), CoverThemeSchema);

export const CoverConfigSchema = z.object({
  version: z.literal(1).default(1),
  defaultTheme: z.string().min(1).default("fresh-sage"),
  accountThemes: z.record(z.string(), z.string().min(1)).default({ ancientone: "soft-rose" }),
  themes: ThemesSchema.prefault(ThemesSchema.parse(presets)),
}).strict().superRefine((config, ctx) => {
  for (const [path, id] of [["defaultTheme", config.defaultTheme], ...Object.entries(config.accountThemes).map(([key, value]) => [`accountThemes.${key}`, value])]) {
    if (!Object.hasOwn(config.themes, id!)) ctx.addIssue({ code: "custom", path: path!.split("."), message: `主题不存在：${id}` });
  }
  for (const [id, theme] of Object.entries(config.themes)) {
    for (const format of CoverFormatSchema.options) {
      const { formats, name: _name, description: _description, ...style } = theme;
      const resolved = mergeCoverSettings(style, formats[format]) as z.infer<typeof CoverStyleSchema>;
      for (const [role, font] of Object.entries(resolved.typography)) {
        if (font.minFontSize > font.fontSize) ctx.addIssue({ code: "custom", path: ["themes", id, "formats", format, "typography", role], message: "最小字号不能大于字号" });
      }
      const area = resolved.layout.safeArea;
      const [width, height] = format === "poster-3-4" ? [900, 1200] : [940, 400];
      if (area.left + area.right >= width! || area.top + area.bottom + resolved.typography.footer.fontSize * resolved.typography.footer.lineHeight + 32 >= height!) {
        ctx.addIssue({ code: "custom", path: ["themes", id, "formats", format, "layout", "safeArea"], message: "安全区没有为文字和署名留下空间" });
      }
    }
  }
});

export type CoverConfig = z.infer<typeof CoverConfigSchema>;
export type CoverTheme = z.infer<typeof CoverThemeSchema>;
export type CoverImage = z.infer<typeof CoverImageSchema>;
export type ResolvedCoverTheme = z.infer<typeof CoverStyleSchema> & { id: string; format: CoverFormat };

/** 对象逐字段合并，数组整体替换，null 用于清除图片。 */
export function mergeCoverSettings(base: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return structuredClone(patch);
  const result: Record<string, unknown> = base && typeof base === "object" && !Array.isArray(base) ? structuredClone(base) as Record<string, unknown> : {};
  for (const [key, value] of Object.entries(patch)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error(`无效配置字段：${key}`);
    result[key] = mergeCoverSettings(result[key], value);
  }
  return result;
}

/** 只解析指定主题，不把账号配色覆盖到用户主题上。 */
export function resolveCoverTheme(config: CoverConfig, format: CoverFormat, account?: string | null, selected?: string | null): ResolvedCoverTheme {
  const id = selected ?? (account ? config.accountThemes[account] : undefined) ?? config.defaultTheme;
  if (!Object.hasOwn(config.themes, id)) throw new Error(`render.cover.themes.${id}: 主题不存在`);
  const { name: _name, description: _description, formats, ...base } = config.themes[id]!;
  return { ...CoverStyleSchema.parse(mergeCoverSettings(base, formats[format])), id, format };
}
