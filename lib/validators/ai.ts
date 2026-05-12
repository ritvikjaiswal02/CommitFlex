import { z } from 'zod'

export const CommitSummarySchema = z.object({
  sha: z.string(),
  summary: z.string().min(1),
  tags: z.array(z.string()),
  significance: z.number().min(1).max(10).default(5),
})

export const NarrativeSchema = z.object({
  theme: z.string().min(1),
  story: z.string().min(1),
  keyPoints: z.array(z.string()),
  technicalDepth: z.number().min(1).max(10).default(5),
})

export const GeneratedPostSchema = z.object({
  platform: z.enum(['linkedin', 'twitter']),
  content: z.string().min(1),
  hashtags: z.array(z.string()).default([]),
  callToAction: z.string().optional(),
})

export type CommitSummaryInput = z.infer<typeof CommitSummarySchema>
export type NarrativeInput = z.infer<typeof NarrativeSchema>
export type GeneratedPostInput = z.infer<typeof GeneratedPostSchema>
