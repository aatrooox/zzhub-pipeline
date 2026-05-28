/**
 * wx-drafts — List or get WeChat draft box drafts.
 *
 * Usage:
 *   zzhub-pipeline wx-drafts [--account <account>] [--limit 20] [--offset 0]
 *   zzhub-pipeline wx-drafts [--account <account>] --media-id <media_id>
 */

import { optionalArg, parseArgs } from "../args";
import { loadConfig } from "../config";
import { printHelp, printResult } from "../output";
import { getWxDraft, getWxDraftList } from "../providers/wechat";

export async function wxDrafts(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp(`
Usage: zzhub-pipeline wx-drafts [options]

Options:
  --account    WeChat account name (defaults to wx.defaultAccount from config)
  --media-id   Draft media_id to fetch a single draft (optional)
  --limit      Number of drafts to list, default 20, max 20 (optional)
  --offset     Pagination offset, default 0 (optional)

Examples:
  zzhub-pipeline wx-drafts --limit 10
  zzhub-pipeline wx-drafts --media-id MEDIA_ID
`.trim());
    return;
  }

  const config = loadConfig();
  const account = optionalArg(parsed, "account") || config.wx.defaultAccount;
  const mediaId = optionalArg(parsed, "media-id") ?? null;
  const limit = optionalArg(parsed, "limit") ? Number.parseInt(optionalArg(parsed, "limit")!, 10) : undefined;
  const offset = optionalArg(parsed, "offset") ? Number.parseInt(optionalArg(parsed, "offset")!, 10) : undefined;

  if (mediaId) {
    const result = await getWxDraft({ account, mediaId, config });
    printResult(result);
  } else {
    const result = await getWxDraftList({ account, limit, offset, config });
    printResult(result);
  }
}
