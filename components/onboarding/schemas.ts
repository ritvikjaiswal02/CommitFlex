/**
 * Request schemas for onboarding, the user profile and voice samples.
 * Shared by the API routes (server validation) and the forms (client hints).
 * Client-safe: zod only.
 */
import { z } from 'zod'
import {
  APPROVAL_VALUES,
  AUDIENCE_VALUES,
  CADENCE_VALUES,
  MAX_AUDIENCES,
  ONBOARDING_STEPS,
  PITCH_MAX,
  PLATFORM_VALUES,
  POST_TIME_VALUES,
  ROLE_VALUES,
  TONE_VALUES,
  VOICE_SAMPLES_MAX,
  VOICE_SAMPLE_MAX,
  VOICE_SAMPLE_MIN,
  isValidTimeZone,
} from './questions'

export const RoleSchema = z.enum(ROLE_VALUES)
export const AudienceSchema = z.enum(AUDIENCE_VALUES)
export const ToneSchema = z.enum(TONE_VALUES)
export const CadenceSchema = z.enum(CADENCE_VALUES)
export const PostTimeSchema = z.enum(POST_TIME_VALUES)
export const PlatformSchema = z.enum(PLATFORM_VALUES)
export const ApprovalModeSchema = z.enum(APPROVAL_VALUES)
export const OnboardingStepSchema = z.enum(ONBOARDING_STEPS as unknown as [string, ...string[]])

export const TimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((tz) => isValidTimeZone(tz), { message: 'Unknown time zone' })

export const PitchSchema = z.string().trim().max(PITCH_MAX, `Keep it under ${PITCH_MAX} characters`)

/** Unique values, preserving order. */
function uniq<T>(values: T[]): T[] {
  return Array.from(new Set(values))
}

export const AudiencesSchema = z
  .array(AudienceSchema)
  .max(MAX_AUDIENCES, `Pick up to ${MAX_AUDIENCES}`)
  .transform(uniq)

export const PlatformsSchema = z.array(PlatformSchema).min(1, 'Pick at least one platform').max(2).transform(uniq)

export const VoiceSampleSchema = z
  .string()
  .trim()
  .min(VOICE_SAMPLE_MIN, `Each post needs at least ${VOICE_SAMPLE_MIN} characters`)
  .max(VOICE_SAMPLE_MAX, `Each post can be at most ${VOICE_SAMPLE_MAX.toLocaleString('en-US')} characters`)

export const VoiceSamplesSchema = z
  .array(VoiceSampleSchema)
  .max(VOICE_SAMPLES_MAX, `Paste at most ${VOICE_SAMPLES_MAX} posts`)

/** PATCH /api/onboarding — every field optional, saved as the user goes. */
export const OnboardingPatchSchema = z
  .object({
    step: OnboardingStepSchema.optional(),
    role: RoleSchema.optional(),
    pitch: PitchSchema.optional(),
    audiences: AudiencesSchema.optional(),
    platforms: PlatformsSchema.optional(),
    tonePreset: ToneSchema.optional(),
    timezone: TimeZoneSchema.optional(),
    voiceSamples: VoiceSamplesSchema.optional(),
    cadence: CadenceSchema.optional(),
    postTime: PostTimeSchema.optional(),
    approvalMode: ApprovalModeSchema.optional(),
  })
  .strict()

export type OnboardingPatch = z.infer<typeof OnboardingPatchSchema>

/** POST /api/onboarding/complete */
export const OnboardingCompleteSchema = z.object({
  role: RoleSchema,
  pitch: PitchSchema.optional(),
  audiences: AudiencesSchema.pipe(z.array(AudienceSchema).min(1, 'Pick at least one audience')),
  platforms: PlatformsSchema,
  tonePreset: ToneSchema,
  voiceSamples: VoiceSamplesSchema.optional().default([]),
  cadence: CadenceSchema,
  postTime: PostTimeSchema,
  approvalMode: ApprovalModeSchema,
  timezone: TimeZoneSchema,
  /** Optional: the repo to write the first drafts from (the client knows which was pushed most recently). */
  firstRepoId: z.string().uuid().optional(),
  /** Where approval emails go, for people whose GitHub email is private. */
  notifyEmail: z.string().trim().toLowerCase().email('Enter an email address').max(255).optional(),
})

export type OnboardingComplete = z.infer<typeof OnboardingCompleteSchema>

/** POST /api/onboarding/prefetch */
export const OnboardingPrefetchSchema = z.object({
  repoId: z.string().uuid(),
})

/** PATCH /api/user/profile */
export const UserProfilePatchSchema = z
  .object({
    role: RoleSchema.nullable().optional(),
    pitch: PitchSchema.nullable().optional(),
    audiences: AudiencesSchema.optional(),
    platforms: PlatformsSchema.optional(),
    tonePreset: ToneSchema.nullable().optional(),
    timezone: TimeZoneSchema.optional(),
  })
  .strict()

export type UserProfilePatch = z.infer<typeof UserProfilePatchSchema>

/** POST /api/voice/analyze and POST /api/voice/profiles/:id/fingerprint */
export const VoiceAnalyzeSchema = z.object({
  samples: VoiceSamplesSchema.min(1, 'Paste at least one post'),
})
