import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { addTopic, listTopics } from "./topic";

describe("topic commands", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "zzhub-test-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  describe("addTopic", () => {
    test("creates a new topic with defaults", async () => {
      const result = await addTopic(workspace, {
        title: "Test Topic",
      });

      expect(result.topic_id).toMatch(/^topic_/);
      expect(result.title).toBe("Test Topic");
      expect(result.status).toBe("backlog");
      expect(result.priority).toBe("medium");
    });

    test("creates topic with all fields", async () => {
      const result = await addTopic(workspace, {
        title: "AI Tools",
        description: "About AI",
        priority: "high",
        tags: ["AI", "tools"],
        notes: "Some notes",
      });

      expect(result.priority).toBe("high");
      expect(result.tags).toEqual(["AI", "tools"]);
      expect(result.notes).toBe("Some notes");
    });
  });

  describe("listTopics", () => {
    test("lists all topics", async () => {
      await addTopic(workspace, { title: "Topic 1" });
      await addTopic(workspace, { title: "Topic 2" });

      const topics = await listTopics(workspace, {});
      expect(topics.length).toBe(2);
    });

    test("filters by status", async () => {
      await addTopic(workspace, { title: "Topic 1", status: "backlog" });
      await addTopic(workspace, { title: "Topic 2", status: "scheduled" });

      const topics = await listTopics(workspace, { status: "backlog" });
      expect(topics.length).toBe(1);
      expect(topics[0].title).toBe("Topic 1");
    });

    test("filters by priority", async () => {
      await addTopic(workspace, { title: "Topic 1", priority: "high" });
      await addTopic(workspace, { title: "Topic 2", priority: "low" });

      const topics = await listTopics(workspace, { priority: "high" });
      expect(topics.length).toBe(1);
    });

    test("limits results", async () => {
      await addTopic(workspace, { title: "Topic 1" });
      await addTopic(workspace, { title: "Topic 2" });
      await addTopic(workspace, { title: "Topic 3" });

      const topics = await listTopics(workspace, { limit: 2 });
      expect(topics.length).toBe(2);
    });
  });
});
