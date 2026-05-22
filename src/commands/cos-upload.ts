import { optionalArg, parseArgs, requireArg } from "../args";
import { loadConfig } from "../config";
import { printHelp, printResult } from "../output";
import { uploadFileToCos, type CosUploadResult } from "../providers/cos";

type CosUploader = (input: {
  localPath: string;
  folder: string;
  baseUrl: string;
  cosPat: string;
  publicBaseUrl: string;
}) => Promise<CosUploadResult>;

export function createCosUploadCommand(uploader: CosUploader = uploadFileToCos) {
  return async function cosUploadCommand(args: string[]): Promise<void> {
    const parsed = parseArgs(args);

    if (parsed.help) {
      printHelp(`
Usage: zzhub-pipeline cos-upload --file <path> [options]

Options:
  --file             Local image file path
  --folder           COS folder name, e.g. notes/note-id
  --alt              Markdown image alt text
  --base-url         Hub base URL for COS STS, defaults to wx.baseUrl
  --pat              COS PAT, defaults to cos.pat
  --public-base-url  Public CDN base URL
`.trim());
      return;
    }

    const config = loadConfig();
    const localPath = requireArg(parsed, "file", "local image file path");
    const folder = optionalArg(parsed, "folder") || "uploads";
    const baseUrl = optionalArg(parsed, "base-url") || config.cos.baseUrl || config.wx.baseUrl;
    const cosPat = optionalArg(parsed, "pat") || config.cos.pat;
    const publicBaseUrl = optionalArg(parsed, "public-base-url") || config.cos.publicBaseUrl;
    const alt = optionalArg(parsed, "alt") || "";

    if (!cosPat) {
      throw new Error("No COS PAT configured. Set cos.pat in config or pass --pat.");
    }

    const result = await uploader({
      localPath,
      folder,
      baseUrl,
      cosPat,
      publicBaseUrl,
    });

    printResult({
      local_path: result.localPath,
      key: result.key,
      url: result.url,
      markdown: `![${alt}](${result.url})`,
    });
  };
}

export const cosUpload = createCosUploadCommand();
