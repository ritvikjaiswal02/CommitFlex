import type { JobTrigger } from './autopilot'

export type GenerationJobStatus =
  | 'queued' | 'fetching_commits' | 'summarizing'
  | 'extracting_narrative' | 'generating_posts'
  // Onboarding only: commits fetched and summarised, waiting for the answers.
  | 'prefetched'
  | 'completed' | 'partial_completed' | 'failed' | 'cancelled'

export const ACTIVE_JOB_STATUSES: readonly GenerationJobStatus[] = [
  'queued', 'fetching_commits', 'summarizing', 'prefetched', 'extracting_narrative', 'generating_posts',
] as const
export const TERMINAL_JOB_STATUSES: readonly GenerationJobStatus[] = [
  'completed', 'partial_completed', 'failed', 'cancelled',
] as const

export type PipelineEventType =
  | 'stage_started' | 'stage_completed' | 'stage_retrying'
  | 'retry_triggered' | 'validation_failed' | 'job_cancelled'
  | 'completed' | 'failed' | 'queued_drafts'

export type JobSourceType = 'window' | 'pr' | 'release'

export interface GenerationJob {
  id: string
  userId: string
  repoId: string
  status: GenerationJobStatus | string
  commitCount: number
  filteredCount: number
  sourceType: JobSourceType | string
  sourceRef?: string | null
  /** What started the job. Optional so older fixtures stay valid. */
  trigger?: JobTrigger | string
  voiceProfileId?: string | null
  /** When true, drafts are queued into autopilot slots on completion. */
  autoQueue?: boolean
  /** Onboarding prefetch waiting for the user's answers. */
  awaitingInput?: boolean
  windowStart: Date
  windowEnd: Date
  retryCount: number
  totalDurationMs?: number | null
  errorMessage?: string | null
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface VoiceSettings {
  tone: string
  technicalLevel: number
  audience: string
  extraContext?: string
}
