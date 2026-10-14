export interface StylePack {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  swatch: string[]; // 预览色块：主色、文字、强调
  theme: {
    fontSize: string;
    lineHeight: string;
    letterSpacing: string;
    paragraphSpacing: string;
    brandColor: string;
    textColor: string;
    h2Color: string;
    h3Color: string;
    quoteColor: string;
    dividerColor: string;
    h2Preset: string;
    h3Preset: string;
    numberedHeadings: boolean;
  };
}

export const STYLE_PACKS: StylePack[] = [
  {
    id: "rouge",
    name: "典雅胭脂",
    subtitle: "人文 · 专栏",
    description: "经典温润的胭脂粉主色与柔和灰调，视觉层次细腻典雅，适合生活方式与深度专栏。",
    swatch: ["#ca6093", "#292526", "#e8c9d7"],
    theme: {
      fontSize: "16",
      lineHeight: "1.84",
      letterSpacing: "0.012",
      paragraphSpacing: "1.18",
      brandColor: "#ca6093",
      textColor: "#292526",
      h2Color: "#1f1b1c",
      h3Color: "#5c5658",
      quoteColor: "#e8c9d7",
      dividerColor: "#e2dcdf",
      h2Preset: "pillar",
      h3Preset: "left-bar",
      numberedHeadings: false,
    },
  },
  {
    id: "paper",
    name: "极简纸墨",
    subtitle: "随笔 · 深度阅读",
    description: "纯粹的纸墨黑白基底，无多余装饰，让读者的注意力百分之百沉浸于文字本身。",
    swatch: ["#18181b", "#27272a", "#e4e4e7"],
    theme: {
      fontSize: "16",
      lineHeight: "1.88",
      letterSpacing: "0.015",
      paragraphSpacing: "1.25",
      brandColor: "#18181b",
      textColor: "#27272a",
      h2Color: "#09090b",
      h3Color: "#52525b",
      quoteColor: "#a1a1aa",
      dividerColor: "#e4e4e7",
      h2Preset: "plain",
      h3Preset: "dot-prefix",
      numberedHeadings: false,
    },
  },
  {
    id: "slate",
    name: "冷灰高雅",
    subtitle: "科技 · 商业研报",
    description: "冷调石板灰蓝搭配深邃沉稳字色，尽显克制与理性，适合行业研究、分析与数码资讯。",
    swatch: ["#2563eb", "#1e293b", "#cbd5e1"],
    theme: {
      fontSize: "16",
      lineHeight: "1.82",
      letterSpacing: "0.01",
      paragraphSpacing: "1.2",
      brandColor: "#2563eb",
      textColor: "#1e293b",
      h2Color: "#0f172a",
      h3Color: "#475569",
      quoteColor: "#93c5fd",
      dividerColor: "#cbd5e1",
      h2Preset: "bottom-line",
      h3Preset: "left-bar",
      numberedHeadings: true,
    },
  },
  {
    id: "mint",
    name: "薄荷清晨",
    subtitle: "清新 · 工具指南",
    description: "高辨识度的翠绿搭配反差色底标题，清晰爽朗，适合效率工具技巧与知识教程。",
    swatch: ["#059669", "#1f2937", "#a7f3d0"],
    theme: {
      fontSize: "16",
      lineHeight: "1.84",
      letterSpacing: "0.012",
      paragraphSpacing: "1.18",
      brandColor: "#059669",
      textColor: "#1f2937",
      h2Color: "#111827",
      h3Color: "#374151",
      quoteColor: "#6ee7b7",
      dividerColor: "#d1fae5",
      h2Preset: "contrast-green",
      h3Preset: "bottom-line",
      numberedHeadings: false,
    },
  },
  {
    id: "violet",
    name: "极光深紫",
    subtitle: "前沿 · 创意设计",
    description: "亮眼的极光紫与柔和渐变胶囊，科技感与潮流感兼具，专为 AI 前沿与前卫思想打造。",
    swatch: ["#7c3aed", "#1e1b4b", "#ddd6fe"],
    theme: {
      fontSize: "16",
      lineHeight: "1.82",
      letterSpacing: "0.012",
      paragraphSpacing: "1.2",
      brandColor: "#7c3aed",
      textColor: "#1e1b4b",
      h2Color: "#0f0d24",
      h3Color: "#4338ca",
      quoteColor: "#c4b5fd",
      dividerColor: "#e0e7ff",
      h2Preset: "gradient-pill",
      h3Preset: "tag-style",
      numberedHeadings: false,
    },
  },
  {
    id: "corporate",
    name: "商业经典",
    subtitle: "企业 · 权威快讯",
    description: "成熟稳健的宝石蓝主色，搭配左侧强调柱，权威严谨，适合机构官微与新闻快报。",
    swatch: ["#0284c7", "#1e293b", "#bae6fd"],
    theme: {
      fontSize: "16",
      lineHeight: "1.84",
      letterSpacing: "0.012",
      paragraphSpacing: "1.18",
      brandColor: "#0284c7",
      textColor: "#1e293b",
      h2Color: "#0f172a",
      h3Color: "#334155",
      quoteColor: "#7dd3fc",
      dividerColor: "#e2e8f0",
      h2Preset: "pillar",
      h3Preset: "left-bar",
      numberedHeadings: true,
    },
  },
  {
    id: "amber",
    name: "暖柿陶土",
    subtitle: "温暖 · 人文深度",
    description: "秋日暖柿与陶土红调，温润燕麦底色与咖啡深墨，温润包容，手机长文夜读极度舒适。",
    swatch: ["#c25e2e", "#2b2623", "#f5ece4"],
    theme: {
      fontSize: "16",
      lineHeight: "1.84",
      letterSpacing: "0.015",
      paragraphSpacing: "1.22",
      brandColor: "#c25e2e",
      textColor: "#2b2623",
      h2Color: "#1f1b18",
      h3Color: "#573d2d",
      quoteColor: "#d9825b",
      dividerColor: "#ece2d8",
      h2Preset: "pillar",
      h3Preset: "left-bar",
      numberedHeadings: false,
    },
  },
  {
    id: "iris",
    name: "鸢尾极光",
    subtitle: "科技 · 现代界面",
    description: "Linear 级现代靛蓝紫，搭配深邃冷夜文字与柔光色块，兼具理性逻辑与前沿审美。",
    swatch: ["#6366f1", "#1e1b4b", "#e0e7ff"],
    theme: {
      fontSize: "16",
      lineHeight: "1.82",
      letterSpacing: "0.012",
      paragraphSpacing: "1.2",
      brandColor: "#6366f1",
      textColor: "#1e1b4b",
      h2Color: "#0f0e26",
      h3Color: "#4338ca",
      quoteColor: "#a5b4fc",
      dividerColor: "#e0e7ff",
      h2Preset: "gradient-pill",
      h3Preset: "tag-style",
      numberedHeadings: false,
    },
  },
];
