import { z } from "zod";

export const AnalyticsSchema = z.object({
  run_id: z.string(),
  topic_id: z.string().nullable().default(null),
  title: z.string(),
  publish_date: z.string(),

  reads: z.number().int().default(0),
  likes: z.number().int().default(0),
  favorites: z.number().int().default(0),
  shares: z.number().int().default(0),
  comments: z.number().int().default(0),

  notes: z.string().nullable().default(null),
  recorded_at: z.string(),
});

export type Analytics = z.infer<typeof AnalyticsSchema>;
