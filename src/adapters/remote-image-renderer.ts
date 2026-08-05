/**
 * Remote image renderer adapter.
 *
 * Instead of rasterizing with headless Chrome, this adapter builds the same
 * fully-resolved RasterTask (HTML + dimensions) that the local card/article
 * renderers produce, hands it to the RenderBroker, and waits briefly for a
 * connected browser client to paint the PNG. If no client completes the job
 * within `dispatchTimeoutMs`, it returns a `pending` result so the workflow
 * enters handoff and resumes when the client submits assets later.
 *
 * For the wechat-article cover (wechat-cover-split) this is a one-surface job.
 * longform-3-4 / poster multi-page are covered in a later phase; until then
 * this adapter throws for routes it does not yet support, falling back is the
 * caller's responsibility (config chooses backend explicitly).
 */

import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type {
  ImageRenderPlugin,
  ImageRenderInput,
  ImageRenderOutput,
  PipelinePluginDoctorCheck,
} from "../adapter-types";
import type { RenderAsset } from "../state";
import { buildCardRasterTask } from "../imgx/render-card";
import { getRenderBroker } from "../server/render-broker";
import type { RenderJobSurface } from "../server/render-broker-types";
import { loadConfig } from "../config";

function coverOutPath(outputDir: string): string {
  return join(outputDir, "cover.png");
}

function visualParams(input: ImageRenderInput) {
  const adapterVp = input.accountVisualParams;
  const stateVp = input.state.route.account_visual_params;
  if (adapterVp) {
    return {
      footer: adapterVp.footer ?? "",
      bg: adapterVp.bg ?? "",
      highlight: adapterVp.highlight ?? "",
      fallback_icon: adapterVp.fallbackIcon ?? "",
    };
  }
  return stateVp;
}

export const remoteImageRenderer: ImageRenderPlugin = {
  name: "remote-browser",
  version: "1.0.0",

  async doctor(): Promise<PipelinePluginDoctorCheck[]> {
    // The remote backend needs neither Chrome nor @napi-rs/canvas on the
    // server; a connected browser client does the painting. Report that.
    return [
      {
        name: "remote-render",
        ok: true,
        message:
          "Image rendering is delegated to a connected browser client (render.backend=remote).",
      },
    ];
  },

  async render(input: ImageRenderInput): Promise<ImageRenderOutput> {
    const { state, outputDir, title, route } = input;
    await mkdir(outputDir, { recursive: true });

    const vp = visualParams(input);
    const highlightWords = state.route.highlight_words ?? [];
    const broker = getRenderBroker();
    const surfaces: RenderJobSurface[] = [];

    if (route === "wechat-article") {
      const task = buildCardRasterTask({
        template: "wechat-cover-split",
        text: title,
        highlight: vp?.highlight,
        bg: vp?.bg,
        footer: vp?.footer,
        fallbackIcon: vp?.fallback_icon,
        highlightWords: highlightWords.join(","),
      });
      surfaces.push({
        id: "cover",
        kind: "cover",
        route: "wechat-article",
        task,
        outPath: coverOutPath(outputDir),
      });
    } else if (route === "blog") {
      return { assets: [], pageCount: 0, pages: [] };
    } else {
      throw new Error(
        `remote-image-renderer does not yet support route ${route} (only wechat-article in this phase)`,
      );
    }

    const job = broker.createJob({
      workspaceRoot: state.workspace_root,
      runId: state.run_id,
      statePath: state.state_path,
      surfaces,
    });

    // Wait briefly for a connected client. If none completes within the
    // configured timeout, defer: the workflow records render_job_id and the
    // broker persists the pending job for a later client to claim.
    const config = loadConfig();
    const timeoutMs = config.render.dispatchTimeoutMs;
    const completed = await broker.waitForCompletion(job.id, timeoutMs);

    if (completed) {
      const assets: RenderAsset[] = completed.assets;
      return {
        assets,
        pageCount: 1,
        pages: [{ page: 1, imageCount: assets.length, imageSources: [] }],
      };
    }

    return {
      assets: [],
      pageCount: 0,
      pages: [],
      pending: {
        job_id: job.id,
        reason: "waiting for a connected browser client to render the cover",
      },
    };
  },
};
