import { describe, test, expect } from "bun:test";
import { TopicSchema } from "./topic";

describe("TopicSchema", () => {
  test("parses minimal topic", () => {
    const input = {
      topic_id: "topic_001",
      title: "Test Topic",
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };

    const result = TopicSchema.parse(input);
    expect(result.topic_id).toBe("topic_001");
    expect(result.status).toBe("backlog");
    expect(result.priority).toBe("medium");
  });

  test("parses full topic", () => {
    const input = {
      topic_id: "topic_002",
      title: "AI Tools",
      description: "About AI tools",
      priority: "high",
      tags: ["AI", "tools"],
      notes: "Some notes",
      status: "scheduled",
      ai_score: 85,
      ai_reason: "Good topic",
      scheduled_date: "2026-06-15",
      target_account: "default",
      run_id: "run_001",
      retro_performance: "good",
      retro_lessons: "Learned something",
      retro_metrics_snapshot: { reads: 1500 },
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };

    const result = TopicSchema.parse(input);
    expect(result.priority).toBe("high");
    expect(result.tags).toEqual(["AI", "tools"]);
    expect(result.ai_score).toBe(85);
  });

  test("rejects invalid priority", () => {
    const input = {
      topic_id: "topic_003",
      title: "Test",
      priority: "urgent",
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };

    expect(() => TopicSchema.parse(input)).toThrow();
  });

  test("rejects invalid ai_score", () => {
    const input = {
      topic_id: "topic_004",
      title: "Test",
      ai_score: 150,
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };

    expect(() => TopicSchema.parse(input)).toThrow();
  });
});
