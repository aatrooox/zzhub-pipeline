export type PosterBlock = {
  text: string;
  highlight: boolean;
};

export type TipItem = {
  title: string;
  description: string;
};

export type PosterConfig = {
  blocks: PosterBlock[];
  highlightWords: string[];
  highlightColor: string;
  tips: TipItem[];
};

type PosterInput = {
  text: string;
  line1: string;
  line2: string;
  line3: string;
  hl1: boolean;
  hl2: boolean;
  hl3: boolean;
  highlightWords: string;
  highlightColor: string;
  tips: TipItem[];
};

function buildBlocksFromText(text: string, lineHighlights: boolean[]): PosterBlock[] {
  return text
    .split(/\r?\n/)
    .map(part => part.trim())
    .filter(Boolean)
    .map((part, index) => ({
      text: part,
      highlight: lineHighlights[index] ?? false,
    }));
}

export function buildPosterConfig(input: PosterInput): PosterConfig {
  const lineHighlights = [input.hl1, input.hl2, input.hl3];
  const blocks =
    input.text.trim().length > 0
      ? buildBlocksFromText(input.text, lineHighlights)
      : [input.line1, input.line2, input.line3]
          .map((part, index) => ({
            text: part.trim(),
            highlight: lineHighlights[index] ?? false,
          }))
          .filter(block => block.text.length > 0);

  const fallbackBlocks =
    blocks.length > 0
      ? blocks
      : [
          {
            text: "",
            highlight: false,
          },
        ];

  return {
    blocks: fallbackBlocks,
    highlightWords: input.highlightWords
      .split(",")
      .map(word => word.trim())
      .filter(Boolean),
    highlightColor: input.highlightColor,
    tips: input.tips,
  };
}

export function serializePosterConfig(config: PosterConfig): string {
  return JSON.stringify(config)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("</script", "<\\/script");
}
