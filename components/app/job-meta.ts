import type { BadgeVariant } from '@/components/ui/badge'

/** Client-safe labels for generation runs ("jobs" internally, "runs" in the UI). */

export const JOB_STAGES = [
  { key: 'fetching_commits', label: 'Reading commits', detail: 'Pulling commit messages, pull request titles and release notes from GitHub.' },
  { key: 'summarizing', label: 'Summarizing the work', detail: 'Grouping the changes by what they do and dropping the noise.' },
  { key: 'extracting_narrative', label: 'Finding the story', detail: 'Picking the angle worth telling and who it matters to.' },
  { key: 'generating_posts', label: 'Writing the posts', detail: 'Drafting LinkedIn and X versions in your voice.' },
] as const

export type JobStageKey = (typeof JOB_STAGES)[number]['key']

const STAGE_INDEX: Record<string, number> = {
  queued: 0,
  fetching_commits: 1,
  summarizing: 2,
  // Onboarding: summarised, waiting for the answers before writing.
  prefetched: 2,
  extracting_narrative: 3,
  generating_posts: 4,
  completed: 5,
  partial_completed: 5,
}

/** 0 = queued, 1–4 = the stage in progress, 5 = done, -1 = failed or cancelled. */
export function stageIndex(status: string): number {
  return STAGE_INDEX[status] ?? -1
}

export function isJobRunning(status: string): boolean {
  const i = stageIndex(status)
  return i >= 0 && i < 5
}

export const JOB_STATUS_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  queued: { label: 'Starting', variant: 'accent' },
  fetching_commits: { label: 'Writing', variant: 'accent' },
  summarizing: { label: 'Writing', variant: 'accent' },
  prefetched: { label: 'Waiting for setup', variant: 'accent' },
  extracting_narrative: { label: 'Writing', variant: 'accent' },
  generating_posts: { label: 'Writing', variant: 'accent' },
  completed: { label: 'Done', variant: 'success' },
  partial_completed: { label: 'Partly done', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export function jobBadge(status: string): { label: string; variant: BadgeVariant } {
  return JOB_STATUS_BADGE[status] ?? { label: status.replace(/_/g, ' '), variant: 'neutral' }
}

/** "PR #42", "Release v1.2.0" or a date window, for run titles. */
export function describeJobSource(job: {
  sourceType?: string | null
  sourceRef?: string | null
  windowStart: string | Date
  windowEnd: string | Date
}, formatDay: (d: string | Date) => string): string {
  if (job.sourceType === 'pr' && job.sourceRef) {
    const num = /(\d+)\/?$/.exec(job.sourceRef)?.[1] ?? /#(\d+)$/.exec(job.sourceRef)?.[1]
    return num ? `Pull request #${num}` : 'Pull request'
  }
  if (job.sourceType === 'release' && job.sourceRef) return `Release ${job.sourceRef}`
  return `${formatDay(job.windowStart)} to ${formatDay(job.windowEnd)}`
}
