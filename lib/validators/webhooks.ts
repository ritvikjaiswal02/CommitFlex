import { z } from 'zod'

/**
 * Subset of the GitHub push-event payload we care about. The real payload is
 * huge — we only validate the bits we read so we don't choke on shape changes.
 */
export const GithubPushPayloadSchema = z.object({
  ref: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  repository: z.object({
    id: z.number(),
    full_name: z.string(),
    default_branch: z.string().optional(),
  }),
  pusher: z.object({ name: z.string().optional(), email: z.string().optional().nullable() }).optional(),
  head_commit: z.object({
    id: z.string(),
    message: z.string().optional(),
    timestamp: z.string().optional(),
  }).nullable().optional(),
  commits: z.array(z.object({
    id: z.string(),
    message: z.string(),
    timestamp: z.string(),
  })).default([]),
})

export type GithubPushPayload = z.infer<typeof GithubPushPayloadSchema>
