import type { PostPlatform } from './posts'

export type JobTrigger =
  | 'manual'
  | 'push'
  | 'pr_merged'
  | 'release_published'
  | 'weekly_digest'
  | 'cadence'
  | 'extension'
  | 'onboarding'

export type QueueStatus =
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'

export type PublishMethod = 'linkedin_api' | 'x_intent' | 'extension' | 'manual'
export type AutopilotCadence = 'ship_moments' | 'weekly' | 'twice_weekly' | 'three_weekly' | 'weekdays'
export type AutopilotTrigger = 'pr_merged' | 'release_published' | 'weekly_digest' | 'push_window'
export type ApprovalMode = 'review' | 'auto'

export const JOB_TRIGGERS: readonly JobTrigger[] = [
  'manual', 'push', 'pr_merged', 'release_published', 'weekly_digest', 'cadence', 'extension', 'onboarding',
] as const
export const QUEUE_STATUSES: readonly QueueStatus[] = [
  'pending_review', 'approved', 'scheduled', 'ready', 'publishing', 'published', 'failed', 'skipped',
] as const
/** Statuses that count against the `queuedPosts` limit. */
export const ACTIVE_QUEUE_STATUSES: readonly QueueStatus[] = ['pending_review', 'approved', 'scheduled', 'ready'] as const
export const AUTOPILOT_CADENCES: readonly AutopilotCadence[] = [
  'ship_moments', 'weekly', 'twice_weekly', 'three_weekly', 'weekdays',
] as const
export const AUTOPILOT_TRIGGERS: readonly AutopilotTrigger[] = [
  'pr_merged', 'release_published', 'weekly_digest', 'push_window',
] as const

export interface AutopilotSettings {
  enabled: boolean
  cadence: AutopilotCadence
  postDays: number[]
  postTime: string
  triggers: AutopilotTrigger[]
  platforms: PostPlatform[]
  approvalMode: ApprovalMode
  reviewerEmails: string[]
  defaultVoiceProfileId: string | null
  pausedUntil: string | null
  /** Read from user_profiles; read-only here. */
  timezone: string
}

/** All dates are ISO strings so the view can cross the server/client boundary. */
export interface QueueItemView {
  id: string
  draftId: string
  jobId: string
  repoId: string | null
  repoFullName: string
  platform: PostPlatform
  status: QueueStatus
  content: string
  hashtags: string[]
  scheduledFor: string | null
  approvedAt: string | null
  publishedAt: string | null
  publishMethod: PublishMethod | null
  externalUrl: string | null
  lastError: string | null
  trigger: JobTrigger
  /** PR title, release tag or 'Weekly digest'. */
  sourceTitle: string | null
  createdAt: string
  updatedAt: string
}

export interface QueueStats {
  pendingReview: number
  scheduled: number
  ready: number
  failed: number
  publishedThisMonth: number
  nextScheduledAt: string | null
}

export interface ShipEventView {
  id: string
  repoFullName: string
  kind: 'pr_merged' | 'release_published' | 'push'
  title: string
  url: string | null
  jobId: string | null
  skippedReason: string | null
  createdAt: string
}

export interface LinkedInConnectionSummary {
  status: 'active' | 'expired' | 'revoked'
  displayName: string | null
  avatarUrl: string | null
  expiresAt: string | null
  connectedAt: string
}

export interface DraftWithRepo {
  id: string
  jobId: string
  platform: PostPlatform
  status: string
  content: string
  hashtags: string[]
  repoFullName: string
  queueStatus: QueueStatus | null
  createdAt: string
}

export interface PublishResult {
  method: PublishMethod
  url: string | null
  intentUrl: string | null
}
