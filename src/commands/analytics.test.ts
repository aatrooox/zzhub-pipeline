import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { recordAnalytics, listAnalytics } from "./analytics";

describe("analytics commands", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "zzhub-test-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  describe("recordAnalytics", () => {
    test("records analytics from state file", async () => {
      const statePath = join(workspace, "state.json");
      await writeFile(statePath, JSON.stringify({
        run_id: "run_001",
        metadata: {
          title: "Test Article",
          date: "2026-06-11",
        },
        route: {
          primary: "wechat-article",
        },
        publish: {
          results: {
            wechat: {
              status: "success",
              published_at: "2026-06-11T10:00:00Z",
            },
          },
        },
      }));

      const result = await recordAnalytics({
        statePath,
        reads: 1500,
        likes: 45,
        favorites: 23,
        shares: 12,
        comments: 8,
        notes: "Good performance",
      });

      expect(result.run_id).toBe("run_001");
      expect(result.reads).toBe(1500);
      expect(result.likes).toBe(45);
      expect(result.favorites).toBe(23);
      expect(result.shares).toBe(12);
      expect(result.comments).toBe(8);
      expect(result.notes).toBe("Good performance");
      expect(result.title).toBe("Test Article");
      expect(result.publish_date).toBe("2026-06-11");
    });

    test("defaults missing metrics to 0", async () => {
      const statePath = join(workspace, "state.json");
      await writeFile(statePath, JSON.stringify({
        run_id: "run_002",
        metadata: { title: "Minimal", date: "2026-06-11" },
        route: { primary: "wechat-article" },
        publish: { results: { wechat: { status: "success", published_at: "2026-06-11T10:00:00Z" } } },
      }));

      const result = await recordAnalytics({ statePath });

      expect(result.run_id).toBe("run_002");
      expect(result.reads).toBe(0);
      expect(result.likes).toBe(0);
      expect(result.favorites).toBe(0);
      expect(result.shares).toBe(0);
      expect(result.comments).toBe(0);
    });

    test("re-recording replaces previous entry", async () => {
      const statePath = join(workspace, "state.json");
      await writeFile(statePath, JSON.stringify({
        run_id: "run_003",
        metadata: { title: "Update Me", date: "2026-06-11" },
        route: { primary: "wechat-article" },
        publish: { results: { wechat: { status: "success", published_at: "2026-06-11T10:00:00Z" } } },
      }));

      await recordAnalytics({ statePath, reads: 100 });
      const updated = await recordAnalytics({ statePath, reads: 200 });

      expect(updated.reads).toBe(200);

      const all = await listAnalytics(workspace, {});
      expect(all.filter(a => a.run_id === "run_003").length).toBe(1);
    });
  });

  describe("listAnalytics", () => {
    test("lists all analytics", async () => {
      const statePath1 = join(workspace, "state1.json");
      await writeFile(statePath1, JSON.stringify({
        run_id: "run_001",
        metadata: { title: "Article 1", date: "2026-06-11" },
        route: { primary: "wechat-article" },
        publish: { results: { wechat: { status: "success", published_at: "2026-06-11T10:00:00Z" } } },
      }));

      const statePath2 = join(workspace, "state2.json");
      await writeFile(statePath2, JSON.stringify({
        run_id: "run_002",
        metadata: { title: "Article 2", date: "2026-06-12" },
        route: { primary: "wechat-article" },
        publish: { results: { wechat: { status: "success", published_at: "2026-06-12T10:00:00Z" } } },
      }));

      await recordAnalytics({ statePath: statePath1, reads: 1000 });
      await recordAnalytics({ statePath: statePath2, reads: 2000 });

      const analytics = await listAnalytics(workspace, {});
      expect(analytics.length).toBe(2);
    });

    test("filters by days", async () => {
      const statePath = join(workspace, "state.json");
      await writeFile(statePath, JSON.stringify({
        run_id: "run_001",
        metadata: { title: "Article", date: "2026-06-11" },
        route: { primary: "wechat-article" },
        publish: { results: { wechat: { status: "success", published_at: "2026-06-11T10:00:00Z" } } },
      }));

      await recordAnalytics({ statePath, reads: 1000 });

      const analytics = await listAnalytics(workspace, { days: 30 });
      expect(analytics.length).toBe(1);
    });

    test("limits results", async () => {
      for (let i = 0; i < 5; i++) {
        const statePath = join(workspace, `state${i}.json`);
        await writeFile(statePath, JSON.stringify({
          run_id: `run_${String(i).padStart(3, "0")}`,
          metadata: { title: `Article ${i}`, date: "2026-06-11" },
          route: { primary: "wechat-article" },
          publish: { results: { wechat: { status: "success", published_at: "2026-06-11T10:00:00Z" } } },
        }));
        await recordAnalytics({ statePath, reads: 100 * (i + 1) });
      }

      const analytics = await listAnalytics(workspace, { limit: 3 });
      expect(analytics.length).toBe(3);
    });
  });
});
