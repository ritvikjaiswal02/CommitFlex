export type Platform = 'linkedin' | 'twitter'

export type QueueStatus =
  | 'pending_review'
  | 'approved'
  | 'scheduled'
  | 'ready'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'

export type ItemStatus = QueueStatus | 'draft'

/** Mirrors ExtensionItem in app/api/extension/_lib/items.ts. */
export interface ExtensionItem {
  draftId: string
  queueItemId: string | null
  platform: Platform
  status: ItemStatus
  text: string
  repoFullName: string
  scheduledFor: string | null
  createdAt: string
  intentUrl: string
  appUrl: string
}

export interface Account {
  id: string
  name: string | null
  email: string | null
  image: string | null
}

export interface PlanInfo {
  id: 'free' | 'pro' | 'team'
  name: string
  status: 'free' | 'trialing' | 'active' | 'past_due' | 'cancelling'
  trialEndsAt: string | null
}

export interface UsageInfo {
  generations: { used: number; max: number }
  queuedPosts?: { used: number; max: number }
}

export interface WhoAmI {
  user: Account
  plan: PlanInfo
  usage: UsageInfo
  appUrl: string
}

export interface QueueResponse {
  queue: ExtensionItem[]
  recent: ExtensionItem[]
  counts?: { ready: number; scheduled: number; pendingReview: number }
}

export interface DraftFromGithubResponse {
  jobId: string
  kind: 'pr' | 'release' | 'repo'
  repoFullName: string
  jobUrl: string
}

export type JobStatus =
  | 'queued'
  | 'fetching_commits'
  | 'summarizing'
  | 'extracting_narrative'
  | 'generating_posts'
  | 'completed'
  | 'partial_completed'
  | 'failed'
  | 'cancelled'

export interface JobResponse {
  status: JobStatus
  done: boolean
  errorMessage: string | null
  repoFullName: string
  jobUrl: string
  drafts: ExtensionItem[]
}

export interface AuthState {
  token: string
  tokenPrefix: string
  appUrl: string
  account: Account | null
  plan: PlanInfo | null
  usage: UsageInfo | null
  connectedAt: number
  verifiedAt: number
  /** Set when the API answered 401: the token was revoked or expired. */
  invalid?: boolean
}

export interface Settings {
  /** Custom CommitFlex origin; null uses the built-in default. */
  appUrl: string | null
  composerLinkedIn: boolean
  composerX: boolean
  githubButton: boolean
  notifications: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  appUrl: null,
  composerLinkedIn: true,
  composerX: true,
  githubButton: true,
  notifications: true,
}

/** What the popup, options page and content scripts read about the extension. */
export interface PublicState {
  connected: boolean
  invalid: boolean
  account: Account | null
  plan: PlanInfo | null
  usage: UsageInfo | null
  tokenPrefix: string | null
  /** The origin API calls go to: the connected account's origin, else settings, else the default. */
  appUrl: string
  settings: Settings
  version: string
}

export interface ApiError {
  ok: false
  status: number
  code: string
  error: string
  body?: Record<string, unknown>
}

export type Result<T> = { ok: true; data: T } | ApiError
