import { z } from 'zod'
import { AUTOPILOT_CADENCES, AUTOPILOT_TRIGGERS, QUEUE_STATUSES } from '@/types/autopilot'

const Platform = z.enum(['linkedin', 'twitter'])

export const PostTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)')

/** PUT /api/autopilot/settings. Every field optional; timezone is read-only. */
export const AutopilotSettingsPatchSchema = z
  .object({
    enabled: z.boolean(),
    cadence: z.enum(AUTOPILOT_CADENCES as unknown as [string, ...string[]]),
    postDays: z.array(z.number().int().min(0).max(6)).max(7),
    postTime: PostTimeSchema,
    triggers: z.array(z.enum(AUTOPILOT_TRIGGERS as unknown as [string, ...string[]])).max(4),
    platforms: z.array(Platform).min(1, 'Pick at least one platform').max(2),
    approvalMode: z.enum(['review', 'auto']),
    reviewerEmails: z.array(z.string().trim().toLowerCase().email('Enter a valid email')).max(20),
    defaultVoiceProfileId: z.string().uuid().nullable(),
    pausedUntil: z.coerce.date().nullable(),
  })
  .partial()
  .strict()

export type AutopilotSettingsPatchInput = z.infer<typeof AutopilotSettingsPatchSchema>

/** POST /api/drafts/:draftId/schedule. Omitting `at` means the next free slot. */
export const ScheduleDraftSchema = z.object({
  at: z.string().datetime({ offset: true }).optional(),
})

/** POST /api/drafts/:draftId/publish. */
export const PublishDraftSchema = z.object({
  method: z.enum(['linkedin_api', 'handoff']).optional(),
})

/** POST /api/drafts/:draftId/posted. */
/** Only https links are stored and rendered as hrefs (no javascript:, data:, http:). */
export function isHttpsUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^https:\/\//i.test(value.trim())
}

export const MarkPostedSchema = z.object({
  method: z.enum(['x_intent', 'manual']).default('manual'),
  url: z.string().url().max(2000).refine((v) => isHttpsUrl(v), 'Use an https link').optional(),
})

/** POST /api/autopilot/run. */
export const AutopilotRunSchema = z.object({
  repoId: z.string().uuid().optional(),
})

const QueueStatusEnum = z.enum(QUEUE_STATUSES as unknown as [string, ...string[]])

/** GET /api/autopilot/queue query string. `status` is a comma-separated list. */
export const QueueQuerySchema = z.object({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined))
    .pipe(z.array(QueueStatusEnum).optional()),
  platform: Platform.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
})

export const LimitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
