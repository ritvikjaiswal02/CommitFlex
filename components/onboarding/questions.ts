/**
 * Onboarding questions: the exact copy from PRODUCT_SPEC §4, plus the small
 * mapping tables the server and the settings screens share.
 *
 * Client-safe: no server imports. Types from `@/types/autopilot` are
 * type-only imports.
 */
import type { AutopilotCadence, ApprovalMode } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'

export type Role = 'founder' | 'engineer' | 'maintainer' | 'freelancer' | 'student' | 'devrel'
export type Audience = 'developers' | 'recruiters' | 'customers' | 'founders' | 'users'
export type TonePreset = 'plain_technical' | 'story_led' | 'confident_founder' | 'teacher' | 'casual'
export type PostTime = '09:00' | '12:30' | '18:00'
export type OnboardingStep = 'repos' | 'role' | 'audience' | 'platforms' | 'voice' | 'cadence' | 'done'

export const ROLE_VALUES = ['founder', 'engineer', 'maintainer', 'freelancer', 'student', 'devrel'] as const
export const AUDIENCE_VALUES = ['developers', 'recruiters', 'customers', 'founders', 'users'] as const
export const TONE_VALUES = ['plain_technical', 'story_led', 'confident_founder', 'teacher', 'casual'] as const
export const CADENCE_VALUES = ['ship_moments', 'weekly', 'twice_weekly', 'three_weekly', 'weekdays'] as const
export const POST_TIME_VALUES = ['09:00', '12:30', '18:00'] as const
export const PLATFORM_VALUES = ['linkedin', 'twitter'] as const
export const APPROVAL_VALUES = ['review', 'auto'] as const
export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  'repos',
  'role',
  'audience',
  'platforms',
  'voice',
  'cadence',
  'done',
] as const

export const PITCH_MAX = 160
export const VOICE_SAMPLE_MIN = 40
export const VOICE_SAMPLE_MAX = 5000
export const VOICE_SAMPLES_MAX = 10
export const MAX_AUDIENCES = 2

export const ROLE_OPTIONS: { value: Role; label: string; description: string }[] = [
  { value: 'founder', label: 'Indie hacker or founder', description: 'Building my own product' },
  { value: 'engineer', label: 'Engineer at a company', description: 'Shipping at work, growing my profile' },
  { value: 'maintainer', label: 'Open-source maintainer', description: 'Releasing for a community' },
  { value: 'freelancer', label: 'Freelancer or consultant', description: 'Showing clients what I build' },
  { value: 'student', label: 'Student or early-career', description: 'Building proof of work' },
  { value: 'devrel', label: 'Developer advocate', description: 'Explaining what my team ships' },
]

export const AUDIENCE_OPTIONS: { value: Audience; label: string }[] = [
  { value: 'developers', label: 'Other developers' },
  { value: 'recruiters', label: 'Recruiters and hiring managers' },
  { value: 'customers', label: 'Potential customers' },
  { value: 'founders', label: 'Founders and investors' },
  { value: 'users', label: "My project's users" },
]

/**
 * The live example card on the voice step rewrites one commit in each tone.
 * Static on purpose: no AI call on this screen.
 */
export const EXAMPLE_COMMIT = 'fix: retry GitHub webhook deliveries with backoff instead of dropping them'

export const TONE_OPTIONS: { value: TonePreset; label: string; description: string; example: string }[] = [
  {
    value: 'plain_technical',
    label: 'Plain and technical',
    description: 'Says what changed and why it matters. No hype.',
    example:
      'Webhook deliveries that failed used to be dropped. They now retry with exponential backoff, up to five attempts over 30 minutes.\n\nIf GitHub has a bad minute, nothing you shipped gets lost. Retries are idempotent, so a late delivery never creates a duplicate draft.',
  },
  {
    value: 'story_led',
    label: 'Story-led',
    description: 'Opens with the problem, ends with what you learned.',
    example:
      'Last week a user merged three pull requests and got zero drafts. GitHub had a short outage and our webhook handler gave up on the first failure.\n\nWe now retry with backoff. The lesson: anything that crosses a network boundary needs a second chance built in from day one.',
  },
  {
    value: 'confident_founder',
    label: 'Confident founder',
    description: "Momentum, outcomes, what's next.",
    example:
      'Shipped: webhook retries with backoff. Every merged pull request now reliably turns into a draft, even when GitHub has a hiccup.\n\nReliability is the feature people never notice until it is missing. Next up: a delivery log you can inspect yourself.',
  },
  {
    value: 'teacher',
    label: 'Teacher',
    description: 'Explains one idea clearly enough to learn from.',
    example:
      'Quick lesson from this week: when you receive webhooks, assume some will fail.\n\nThe fix is a retry with exponential backoff: wait 1 minute, then 2, then 4. Pair it with an idempotency key so a retry that arrives twice is handled once. That is all it takes to stop losing events.',
  },
  {
    value: 'casual',
    label: 'Casual',
    description: 'Short, friendly, like a message to a friend.',
    example:
      'Small fix, big relief: failed GitHub webhooks now retry instead of vanishing. No more merged PRs slipping through the cracks.',
  },
]

export const CADENCE_OPTIONS: { value: AutopilotCadence; label: string; description?: string }[] = [
  {
    value: 'ship_moments',
    label: 'When I ship something notable',
    description: 'Merged pull requests and releases only.',
  },
  { value: 'weekly', label: 'Once a week', description: 'Tuesday' },
  { value: 'twice_weekly', label: 'Twice a week', description: 'Tuesday and Thursday' },
  { value: 'three_weekly', label: 'Three times a week', description: 'Monday, Wednesday, Friday' },
  { value: 'weekdays', label: 'Every weekday' },
]

/** Posting days for each cadence (0 = Sunday). `ship_moments` treats every day as a slot. */
export const CADENCE_DAYS: Record<AutopilotCadence, number[]> = {
  ship_moments: [0, 1, 2, 3, 4, 5, 6],
  weekly: [2],
  twice_weekly: [2, 4],
  three_weekly: [1, 3, 5],
  weekdays: [1, 2, 3, 4, 5],
}

export const POST_TIME_OPTIONS: { value: PostTime; label: string }[] = [
  { value: '09:00', label: 'Morning 9:00' },
  { value: '12:30', label: 'Midday 12:30' },
  { value: '18:00', label: 'Evening 18:00' },
]

export const APPROVAL_OPTIONS: { value: ApprovalMode; label: string; description: string }[] = [
  {
    value: 'review',
    label: 'Email me each draft to approve',
    description: 'Nothing goes out until you press Approve, in the app, the email or the extension.',
  },
  {
    value: 'auto',
    label: 'Post automatically and tell me after',
    description: 'Drafts are scheduled straight away. You get a summary with a Skip link for each one.',
  },
]

export const PLATFORM_OPTIONS: { value: PostPlatform; label: string; description: string }[] = [
  {
    value: 'linkedin',
    label: 'LinkedIn',
    description: 'Publish directly after you approve. Connect your account now or later.',
  },
  {
    value: 'twitter',
    label: 'X',
    description: 'Opens pre-filled in X with one tap, or inserts straight into the composer with the Chrome extension.',
  },
]

/** How a tone preset maps onto the voice profile the generator reads. */
export const TONE_TO_VOICE: Record<TonePreset, { tone: string; technicalLevel: number }> = {
  plain_technical: { tone: 'analytical', technicalLevel: 8 },
  story_led: { tone: 'storytelling', technicalLevel: 6 },
  confident_founder: { tone: 'enthusiastic', technicalLevel: 5 },
  teacher: { tone: 'educational', technicalLevel: 6 },
  casual: { tone: 'casual', technicalLevel: 5 },
}

/** Short role phrases used in the AI author context. */
export const ROLE_PHRASES: Record<Role, string> = {
  founder: 'indie founder',
  engineer: 'software engineer',
  maintainer: 'open-source maintainer',
  freelancer: 'freelance developer',
  student: 'student developer',
  devrel: 'developer advocate',
}

/** Steps shown in the onboarding rail, in order, with their short labels. */
export const STEP_LABELS: Record<Exclude<OnboardingStep, 'done'>, string> = {
  repos: 'Repositories',
  role: 'About you',
  audience: 'Audience',
  platforms: 'Platforms',
  voice: 'Voice',
  cadence: 'Cadence',
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/* ─── Helpers ────────────────────────────────────────────────────────── */

export function isRole(v: unknown): v is Role {
  return typeof v === 'string' && (ROLE_VALUES as readonly string[]).includes(v)
}
export function isAudience(v: unknown): v is Audience {
  return typeof v === 'string' && (AUDIENCE_VALUES as readonly string[]).includes(v)
}
export function isTonePreset(v: unknown): v is TonePreset {
  return typeof v === 'string' && (TONE_VALUES as readonly string[]).includes(v)
}
export function isOnboardingStep(v: unknown): v is OnboardingStep {
  return typeof v === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(v)
}

/**
 * Splits the pasted voice samples into posts. Posts are separated by one or
 * more blank lines; whitespace-only chunks are dropped.
 */
export function splitVoiceSamples(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n[ \t]*\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

export interface VoiceSampleCheck {
  samples: string[]
  tooShort: number
  tooLong: number
  tooMany: boolean
  valid: boolean
}

/** Validates pasted samples the same way the server does. Empty input is valid (samples are optional). */
export function checkVoiceSamples(text: string): VoiceSampleCheck {
  const samples = splitVoiceSamples(text)
  const tooShort = samples.filter((s) => s.length < VOICE_SAMPLE_MIN).length
  const tooLong = samples.filter((s) => s.length > VOICE_SAMPLE_MAX).length
  const tooMany = samples.length > VOICE_SAMPLES_MAX
  return { samples, tooShort, tooLong, tooMany, valid: tooShort === 0 && tooLong === 0 && !tooMany }
}

/** "developers and recruiters" — the audience string stored on the voice profile. */
export function audienceSummary(audiences: readonly string[]): string {
  const words = audiences.filter(isAudience)
  if (words.length === 0) return 'developers'
  if (words.length === 1) return words[0]
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`
}

/** True when the string is an IANA time zone this runtime understands. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Time zones for pickers. Falls back to a short list on runtimes without `supportedValuesOf`. */
export function listTimeZones(): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  try {
    const zones = intl.supportedValuesOf?.('timeZone')
    if (zones && zones.length > 0) return zones.includes('UTC') ? zones : ['UTC', ...zones]
  } catch {
    // fall through
  }
  return [
    'UTC',
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'America/Sao_Paulo',
    'Europe/London',
    'Europe/Berlin',
    'Europe/Paris',
    'Africa/Lagos',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
  ]
}

/** Short zone name for labels, e.g. "IST" or "GMT+5:30". */
export function timeZoneAbbreviation(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(at)
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? tz
  } catch {
    return tz
  }
}
