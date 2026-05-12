import { z } from 'zod'

export const UpdateDraftSchema = z.object({
  content: z.string().min(1).max(5000),
})

export const ReplaceDraftSchema = z.object({
  platform: z.enum(['linkedin', 'twitter']),
  content: z.string().min(1).max(5000),
})

const Dial = z.number().int().min(0).max(100)

export const GenerateVariantsSchema = z.object({
  technical: Dial.default(50),
  engagement: Dial.default(50),
  creativity: Dial.default(50),
  count: z.number().int().min(2).max(5).default(3),
})

export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>
export type ReplaceDraftInput = z.infer<typeof ReplaceDraftSchema>
export type GenerateVariantsInput = z.infer<typeof GenerateVariantsSchema>
