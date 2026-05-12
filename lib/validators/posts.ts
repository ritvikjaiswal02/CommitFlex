import { z } from 'zod'

export const UpdateDraftSchema = z.object({
  content: z.string().min(1).max(5000),
})

export const ReplaceDraftSchema = z.object({
  platform: z.enum(['linkedin', 'twitter']),
  content: z.string().min(1).max(5000),
})

export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>
export type ReplaceDraftInput = z.infer<typeof ReplaceDraftSchema>
