export interface ColorPalette {
  id: string;
  name: string;
  category: string;
  description: string;
  colors: {
    brand: string;
    text: string;
    h2: string;
    h3: string;
    quote: string;
    divider: string;
  };
}

export const COLOR_PALETTES: ColorPalette[] = [
  {
    id: "forest-sage",
    name: "🌿 森林墨绿 (Kinfolk / 少数派)",
    category: "生活方式与编辑部",
    description: "《Kinfolk》生活美学：沉稳深松绿强调色，搭配松针深黑与浅灰绿分割线",
    colors: {
      brand: "#1f6f4a",
      text: "#1f2320",
      h2: "#154c33",
      h3: "#2e7d58",
      quote: "#3d8e64",
      divider: "#e1ebe5",
    },
  },
  {
    id: "oatmeal-earth",
    name: "☕ 燕麦大地 (理想国 / 暖调成衣)",
    category: "时尚与书籍出版",
    description: "Loro Piana 暖调成衣美学：深焦糖陶土棕、浓咖啡黑与温润燕麦米灰",
    colors: {
      brand: "#945938",
      text: "#2b2623",
      h2: "#1f1b18",
      h3: "#6b3f27",
      quote: "#b37954",
      divider: "#eae4dd",
    },
  },
  {
    id: "slate-indigo",
    name: "🏛️ 石板深蓝 (纽约客 / Substack)",
    category: "深度专栏与智识",
    description: "经典严肃刊物：午夜深藏青做标识，石板灰文字与干净蓝灰分割",
    colors: {
      brand: "#2563eb",
      text: "#1e293b",
      h2: "#0f172a",
      h3: "#334155",
      quote: "#3b82f6",
      divider: "#e2e8f0",
    },
  },
  {
    id: "burgundy-velvet",
    name: "🍷 勃艮第红 (Vogue / 先锋艺术)",
    category: "高级时尚与设计",
    description: "复古先锋美学：丝绒绛红做点睛，黑绒字色与淡玫瑰粉灰底线",
    colors: {
      brand: "#881337",
      text: "#231f20",
      h2: "#1a1617",
      h3: "#4c1d2e",
      quote: "#9f1239",
      divider: "#f2e5ea",
    },
  },
  {
    id: "matcha-bamboo",
    name: "🍵 极简煎茶 (无印良品 / 东方和风)",
    category: "极简器物与禅意",
    description: "日系器物美学：深橄榄煎茶色、竹炭色正文与和纸灰底线",
    colors: {
      brand: "#556b2f",
      text: "#262923",
      h2: "#1c211a",
      h3: "#435528",
      quote: "#708846",
      divider: "#e7eae1",
    },
  },
  {
    id: "titanium-cyan",
    name: "🌌 极客钛灰 (Linear / Arc 现代界面)",
    category: "现代数字与 App",
    description: "当代高端数字界面：极光冷青点缀、深空曜黑文字与钛金属浅灰",
    colors: {
      brand: "#0284c7",
      text: "#18181b",
      h2: "#09090b",
      h3: "#27272a",
      quote: "#0ea5e9",
      divider: "#e4e4e7",
    },
  },
  {
    id: "rose-ledger",
    name: "🌸 晚樱柔粉 (古一软件经典标配)",
    category: "人文与故事叙述",
    description: "经典温润配色：干枯玫瑰粉与深铅黑文字，温柔克制",
    colors: {
      brand: "#ca6093",
      text: "#292526",
      h2: "#1f1b1c",
      h3: "#5c5658",
      quote: "#ca6093",
      divider: "#dadce0",
    },
  },
];
