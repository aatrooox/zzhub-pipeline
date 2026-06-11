/**
 * Zod schema for Topic.
 *
 * Topics represent content ideas tracked through the pipeline,
 * from backlog through evaluation, scheduling, and publication.
 * Includes AI evaluation fields and retrospective data.
 */

import { z } from "zod";

export const TopicPrioritySchema = z.enum(["high", "medium", "low"]);
export const TopicStatusSchema = z.enum([
  "backlog",
  "evaluating",
  "scheduled",
  "in_progress",
  "published",
  "abandoned",
]);
export const RetroPerformanceSchema = z.enum([
  "excellent",
  "good",
  "average",
  "poor",
]);

export const TopicSchema = z.object({
  topic_id: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  priority: TopicPrioritySchema.default("medium"),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  status: TopicStatusSchema.default("backlog"),

  ai_score: z.number().int().min(0).max(100).nullable().default(null),
  ai_reason: z.string().nullable().default(null),

  scheduled_date: z.string().nullable().default(null),
  target_account: z.string().nullable().default(null),

  run_id: z.string().nullable().default(null),

  retro_performance: RetroPerformanceSchema.nullable().default(null),
  retro_lessons: z.string().nullable().default(null),
  retro_metrics_snapshot: z.any().nullable().default(null),

  created_at: z.string(),
  updated_at: z.string(),
});

export type Topic = z.infer<typeof TopicSchema>;
export type TopicPriority = z.infer<typeof TopicPrioritySchema>;
export type TopicStatus = z.infer<typeof TopicStatusSchema>;
export type RetroPerformance = z.infer<typeof RetroPerformanceSchema>;
