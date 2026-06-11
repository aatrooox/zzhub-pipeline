import { describe, test, expect } from "bun:test";
import { AnalyticsSchema } from "./analytics";

describe("AnalyticsSchema", () => {
  test("parses minimal analytics", () => {
    const input = {
      run_id: "run_001",
      title: "Test Article",
      publish_date: "2026-06-11",
      recorded_at: "2026-06-11T10:00:00Z",
    };

    const result = AnalyticsSchema.parse(input);
    expect(result.run_id).toBe("run_001");
    expect(result.reads).toBe(0);
    expect(result.likes).toBe(0);
  });

  test("parses full analytics", () => {
    const input = {
      run_id: "run_002",
      topic_id: "topic_001",
      title: "AI Tools",
      publish_date: "2026-06-11",
      reads: 1500,
      likes: 45,
      favorites: 23,
      shares: 12,
      comments: 8,
      notes: "Good performance",
      recorded_at: "2026-06-11T10:00:00Z",
    };

    const result = AnalyticsSchema.parse(input);
    expect(result.reads).toBe(1500);
    expect(result.topic_id).toBe("topic_001");
  });

  test("defaults metrics to 0", () => {
    const input = {
      run_id: "run_003",
      title: "Test",
      publish_date: "2026-06-11",
      recorded_at: "2026-06-11T10:00:00Z",
    };

    const result = AnalyticsSchema.parse(input);
    expect(result.reads).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.favorites).toBe(0);
    expect(result.shares).toBe(0);
    expect(result.comments).toBe(0);
  });
});
