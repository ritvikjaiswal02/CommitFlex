import { z } from 'zod'

export const CreateJobSchema = z.object({
  repoId: z.string().uuid(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
}).refine(d => d.windowEnd > d.windowStart, {
  message: 'windowEnd must be after windowStart',
})

export const JobIdSchema = z.object({
  jobId: z.string().uuid(),
})

export type CreateJobInput = z.infer<typeof CreateJobSchema>
