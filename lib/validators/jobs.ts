import { z } from 'zod'

/* Three ways to kick off a generation:
   1. window  → classic "last N days of commits"
   2. pr      → all commits attached to a specific PR
   3. release → commits between the previous tag and a target tag */

const WindowSource = z.object({
  source: z.literal('window').optional().default('window'),
  repoId: z.string().uuid(),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
}).refine(d => d.windowEnd > d.windowStart, {
  message: 'windowEnd must be after windowStart',
})

const PrSource = z.object({
  source: z.literal('pr'),
  repoId: z.string().uuid(),
  prUrl: z.string().min(5, 'Paste a PR URL or owner/repo#123'),
})

const ReleaseSource = z.object({
  source: z.literal('release'),
  repoId: z.string().uuid(),
  releaseTag: z.string().min(1, 'Tag name is required'),
})

// Discriminated union — accepts any of the three shapes above.
export const CreateJobSchema = z.union([WindowSource, PrSource, ReleaseSource])

export const JobIdSchema = z.object({
  jobId: z.string().uuid(),
})

export type CreateJobInput = z.infer<typeof CreateJobSchema>
