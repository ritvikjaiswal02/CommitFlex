import { z } from 'zod'

export const AnalyzeVoiceSchema = z.object({
  samples: z
    .array(z.string().trim().min(50, 'Each sample must be at least 50 characters').max(5000))
    .min(3, 'Provide at least 3 samples')
    .max(10, 'No more than 10 samples'),
})

export type AnalyzeVoiceInput = z.infer<typeof AnalyzeVoiceSchema>
