/**
 * review — Update content_review state after orchestrator quality check.
 *
 * The actual quality review is done by the orchestrator (LLM judgment).
 * This command only persists the review decision to the state file.
 *
 * Usage:
 *   zzhub-pipeline review --state /path/to/state.json --status passed
 *   zzhub-pipeline review --state /path/to/state.json --status needs_revision --feedback "AI味过重，建议..."
 *
 * Statuses:
 *   passed          — Content passed quality check, proceed to next step
 *   needs_revision  — Content has issues, will be sent back to Writer
 *
 * Output: Updated content_review state as JSON.
 */

import { parseArgs, requireArg, optionalArg } from "../args";
import { printResult, renderReview } from "../output";
import { writeState, type ContentReviewStatus } from "../state";
import { loadTaskState } from "../task-manager";

const VALID_STATUSES: ContentReviewStatus[] = [
  "passed",
  "needs_revision",
];

export async function review(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline review [options]

Options:
  --state      Path to state JSON (required)
  --status     passed | needs_revision (required)
  --feedback   Revision feedback for Writer (required when status=needs_revision)

Statuses:
  passed          Content passed quality check
  needs_revision  Content has issues, send back to Writer with feedback
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const status = requireArg(parsed, "status", "review status") as ContentReviewStatus;
  const feedback = optionalArg(parsed, "feedback") ?? null;

  if (!VALID_STATUSES.includes(status)) {
    throw new Error(
      `Invalid review status: ${status}. Valid statuses: ${VALID_STATUSES.join(", ")}`,
    );
  }

  if (status === "needs_revision" && !feedback) {
    throw new Error(
      "Feedback is required when status is needs_revision (--feedback \"...\")",
    );
  }

  const resolved = await loadTaskState(requestedStatePath);
  const statePath = resolved.path;
  const state = resolved.state;

  state.content_review = {
    status,
    feedback: status === "needs_revision" ? feedback : null,
  };

  await writeState(statePath, state);

  const output = {
    state_path: statePath,
    content_review: state.content_review,
  };

  printResult(output, renderReview);
}
