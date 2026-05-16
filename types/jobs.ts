export type GenerationJobStatus =
  | 'queued' | 'fetching_commits' | 'summarizing'
  | 'extracting_narrative' | 'generating_posts'
  | 'completed' | 'partial_completed' | 'failed' | 'cancelled'

export type PipelineEventType =
  | 'stage_started' | 'stage_completed' | 'stage_retrying'
  | 'retry_triggered' | 'validation_failed' | 'job_cancelled'
  | 'completed' | 'failed'

export type JobSourceType = 'window' | 'pr' | 'release'

export interface GenerationJob {
  id: string
  userId: string
  repoId: string
  status: GenerationJobStatus
  commitCount: number
  filteredCount: number
  sourceType: JobSourceType
  sourceRef?: string | null
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
