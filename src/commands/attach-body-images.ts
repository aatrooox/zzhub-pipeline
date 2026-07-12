import { readFile } from "fs/promises";

import { parseArgs, optionalArg, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import {
  readResolvedState,
  reenterPublish,
  reenterRender,
  writeState,
  type BodyInputReceived,
} from "../state";
import { getTaskByStatePath } from "../task-manager";
import { reconcileStateArtifacts } from "../workflow-materials";

function parseReceivedImages(raw: unknown): BodyInputReceived[] {
  if (Array.isArray(raw)) {
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }
      const input = item as Record<string, unknown>;
      const marker = typeof input.marker === "string" ? input.marker.trim() : "";
      const path = typeof input.path === "string" ? input.path.trim() : "";
      return marker && path ? [{ marker, path }] : [];
    });
  }

  if (raw && typeof raw === "object") {
    const input = raw as Record<string, unknown>;
    if (Array.isArray(input.images)) {
      return parseReceivedImages(input.images);
    }
    return Object.entries(input).flatMap(([marker, path]) => {
      const normalizedMarker = marker.trim();
      const normalizedPath = typeof path === "string" ? path.trim() : "";
      return normalizedMarker && normalizedPath
        ? [{ marker: normalizedMarker, path: normalizedPath }]
        : [];
    });
  }

  return [];
}

export async function attachBodyImages(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline attach-body-images [options]

Options:
  --state        Path to state JSON (required)
  --images-file  JSON file mapping marker -> path or [{ marker, path }] (required)
  --scope        article | newspic-longform (optional)
  --layout       Layout hint such as staggered/editorial (optional)
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const imagesFile = requireArg(parsed, "images-file", "JSON file with marker/path data");
  const scope = optionalArg(parsed, "scope");
  const layout = optionalArg(parsed, "layout");

  const resolved = await readResolvedState(requestedStatePath);
  const statePath = resolved.path;
  const state = resolved.state;
  const prepareWasDone = state.phase.prepare.status === "done";
  const raw = JSON.parse(await readFile(imagesFile, "utf-8")) as unknown;
  const incoming = parseReceivedImages(raw);
  const merged = new Map(state.images.body_inputs.received.map((item) => [item.marker, item.path]));
  for (const item of incoming) {
    merged.set(item.marker, item.path);
  }

  state.images.body_inputs.received = [...merged.entries()].map(([marker, path]) => ({ marker, path }));
  if (scope === "article" || scope === "newspic-longform") {
    state.images.body_inputs.scope = scope;
  }
  if (layout) {
    state.images.body_inputs.layout = layout;
  }

  await reconcileStateArtifacts(state);
  if (prepareWasDone && state.images.body_inputs.scope === "newspic-longform") {
    reenterRender(state);
  } else if (
    prepareWasDone &&
    state.images.body_inputs.scope === "article" &&
    (state.phase.current === "publish" ||
      state.phase.current === "done" ||
      state.phase.publish.status === "done")
  ) {
    reenterPublish(state);
  }
  await writeState(statePath, state);

  const task = await getTaskByStatePath(statePath);
  printResult(
    {
      summary: task.summary,
      blockers: task.blockers,
      next_action: task.next_action,
    },
    renderTaskShape,
  );
}
