/**
 * wx-draft-delete — Delete a draft from WeChat draft box.
 *
 * Usage:
 *   zzhub-pipeline wx-draft-delete [--account <account>] --media-id <media_id>
 */

import { optionalArg, parseArgs, requireArg } from "../args";
import { loadConfig } from "../config";
import { printHelp, printResult } from "../output";
import { deleteWxDraft } from "../providers/wechat";

export async function wxDraftDelete(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    printHelp(`
Usage: zzhub-pipeline wx-draft-delete [options]

Options:
  --account    WeChat account name (defaults to wx.defaultAccount from config)
  --media-id   Draft media_id to delete (required)

Examples:
  zzhub-pipeline wx-draft-delete --media-id MEDIA_ID
`.trim());
    return;
  }

  const config = loadConfig();
  const account = optionalArg(parsed, "account") || config.wx.defaultAccount;
  const mediaId = requireArg(parsed, "media-id", "draft media_id to delete");

  const result = await deleteWxDraft({ account, mediaId, config });
  printResult(result);
}
