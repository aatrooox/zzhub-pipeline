import {
  runRenderArticleCli,
  runRenderAsciiPortraitCli,
  runRenderCardCli,
  runRenderXLikePostsCli,
} from "../imgx";

type ImgxHandler = (args: string[]) => void;

const IMGX_COMMANDS: Record<string, ImgxHandler> = {
  "render-article": runRenderArticleCli,
  "render-ascii-portrait": runRenderAsciiPortraitCli,
  "render-card": runRenderCardCli,
  "render-x-like-posts": runRenderXLikePostsCli,
};

export async function imgxCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    printUsage();
    return;
  }

  const handler = IMGX_COMMANDS[subcommand];
  if (!handler) {
    throw new Error(`Unknown imgx subcommand: ${subcommand}`);
  }

  handler(args.slice(1));
}

function printUsage(): void {
  console.log(
    [
      "Usage: zzhub-pipeline imgx <subcommand> [options]",
      "",
      "Subcommands:",
      "  render-card            Render poster-3-4 / wechat-cover-split / tips-3-4",
      "  render-article         Render longform-3-4 article pages",
      "  render-ascii-portrait  Render ascii portrait posters",
      "  render-x-like-posts    Render X-like posts cards",
    ].join("\n"),
  );
}
