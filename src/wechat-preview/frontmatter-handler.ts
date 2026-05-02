export interface FrontmatterData {
  frontmatter: string;
  content: string;
}

export interface FrontmatterFields {
  title?: string;
  date?: string;
  lastmod?: string;
  tags?: string[];
  [key: string]: unknown;
}

export function extractFrontmatter(markdown: string): FrontmatterData {
  const frontmatterRegex = /^(?:\uFEFF)?(?:---|[*]{3})\r?\n([\s\S]*?)\r?\n(?:---|[*]{3})\r?\n/;
  const match = markdown.match(frontmatterRegex);

  if (match) {
    return {
      frontmatter: match[1] as string,
      content: markdown.slice(match[0].length),
    };
  }

  return {
    frontmatter: "",
    content: markdown,
  };
}

export function parseYAML(yamlString: string): FrontmatterFields {
  const result: FrontmatterFields = {};

  if (!yamlString.trim()) {
    return result;
  }

  const lines = yamlString.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = (match[1] ?? "").trim();
    let value = (match[2] ?? "").trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value.startsWith("[") && value.endsWith("]")) {
      result[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }

    result[key] = value;
  }

  return result;
}
