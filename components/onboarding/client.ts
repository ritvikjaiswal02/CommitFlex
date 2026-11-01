/**
 * Client-side types and fetch helpers for onboarding and settings.
 * Client-safe: no server imports.
 */
import type { PlanId, PlanStatus } from '@/lib/billing/catalog'
import type { AutopilotSettings, LinkedInConnectionSummary } from '@/types/autopilot'
import type { OnboardingStep } from './questions'

/** user_profiles row as it arrives over JSON (dates are ISO strings). */
export interface ProfileView {
  userId: string
  role: string | null
  pitch: string | null
  audiences: string[]
  platforms: string[]
  tonePreset: string | null
  timezone: string
  country: string | null
  onboardingStep: OnboardingStep | string
  onboardedAt: string | null
  trialEndsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OnboardingState {
  profile: ProfileView
  autopilot: AutopilotSettings
  repos: { id: string; fullName: string }[]
  linkedin: LinkedInConnectionSummary | null
  linkedinAvailable: boolean
  plan: { id: PlanId; status: PlanStatus; trialEndsAt: string | null }
}

/** One row of GET /api/github/repos. `pushedAt` and `stars` arrive once the repos API adds them. */
export interface GithubRepoOption {
  githubRepoId: string
  name: string
  fullName: string
  url: string
  defaultBranch: string
  isPrivate: boolean
  description: string | null
  language: string | null
  updatedAt: string | null
  pushedAt?: string | null
  stars?: number
  /** GitHub login of the owner (user or organisation). */
  owner?: string
  ownerType?: 'user' | 'org'
  /** Owned by the signed-in user's own account. */
  personal?: boolean
  /** Admin access: CommitFlex can install the webhook with this user's token. */
  canAdmin?: boolean
  canPush?: boolean
}

export const NO_ADMIN_HINT = 'You need admin access to add the webhook. Ask an org owner.'

export interface RepoGroup {
  key: string
  label: string
  repos: GithubRepoOption[]
}

/** Personal repos first, then each owner (org or another user) alphabetically. Order inside a group is kept. */
export function groupReposByOwner(repos: GithubRepoOption[]): RepoGroup[] {
  const personal: GithubRepoOption[] = []
  const others = new Map<string, GithubRepoOption[]>()
  for (const repo of repos) {
    const owner = repo.owner ?? repo.fullName.split('/')[0] ?? ''
    // Responses from before grouping existed have no flag: treat as personal.
    if (repo.personal ?? true) {
      personal.push(repo)
      continue
    }
    const list = others.get(owner) ?? []
    list.push(repo)
    others.set(owner, list)
  }
  const groups: RepoGroup[] = []
  if (personal.length > 0) groups.push({ key: 'personal', label: 'Your repositories', repos: personal })
  for (const owner of Array.from(others.keys()).sort((a, b) => a.localeCompare(b))) {
    groups.push({ key: `owner:${owner}`, label: owner, repos: others.get(owner)! })
  }
  return groups
}

/** A repo CommitFlex can fully connect (webhook included). Older API responses have no flag: allow. */
export function canConnect(repo: GithubRepoOption): boolean {
  return repo.canAdmin !== false
}

export interface CompleteResponse {
  ok: true
  jobId: string | null
  trialEndsAt: string | null
  redirectTo: string
  repoFullName?: string
  jobError?: string
  voiceWarning?: string
  downgraded?: ('cadence' | 'approvalMode')[]
}

/** Reads `{ error }` from a failed response, falling back to a sentence that says what to do. */
export async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: unknown }
    if (typeof body?.error === 'string' && body.error.trim().length > 0) return body.error
  } catch {
    // not JSON
  }
  return fallback
}

export async function patchJson(url: string, body: unknown, method: 'PATCH' | 'PUT' | 'POST' = 'PATCH'): Promise<Response> {
  return fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** The browser's IANA time zone, or UTC when unavailable. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** localStorage that never throws (private windows, blocked storage). */
export const safeStorage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      // ignore
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key)
    } catch {
      // ignore
    }
  },
}
