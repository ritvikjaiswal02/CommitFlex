import { DEFAULT_SETTINGS, type AuthState, type Settings } from './types'

/**
 * chrome.storage.local layout:
 *   auth      AuthState | undefined   the token and the account it belongs to
 *   settings  Settings                user preferences
 *   jobs      Record<jobId, TrackedJob> jobs started from GitHub, for the "Drafts ready" notification
 * chrome.storage.session (memory only):
 *   queue:<platform|all>  cached queue responses for instant popup and panel renders
 */
export interface TrackedJob {
  jobId: string
  repoFullName: string
  jobUrl: string
  startedAt: number
}

export async function getAuth(): Promise<AuthState | null> {
  const { auth } = await chrome.storage.local.get('auth')
  return (auth as AuthState | undefined) ?? null
}

export async function setAuth(auth: AuthState | null): Promise<void> {
  if (auth) await chrome.storage.local.set({ auth })
  else await chrome.storage.local.remove('auth')
}

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings')
  return { ...DEFAULT_SETTINGS, ...((settings as Partial<Settings> | undefined) ?? {}) }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await chrome.storage.local.set({ settings: next })
  return next
}

/** Reads settings without the background (content scripts, options page). */
export function onSettingsChanged(listener: (settings: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      listener({ ...DEFAULT_SETTINGS, ...((changes.settings.newValue as Partial<Settings> | undefined) ?? {}) })
    }
  })
}

export async function getTrackedJobs(): Promise<Record<string, TrackedJob>> {
  const { jobs } = await chrome.storage.local.get('jobs')
  return (jobs as Record<string, TrackedJob> | undefined) ?? {}
}

export async function setTrackedJobs(jobs: Record<string, TrackedJob>): Promise<void> {
  await chrome.storage.local.set({ jobs })
}

export async function getCached<T>(key: string): Promise<{ at: number; data: T } | null> {
  try {
    const result = await chrome.storage.session.get(key)
    return (result[key] as { at: number; data: T } | undefined) ?? null
  } catch {
    return null
  }
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    await chrome.storage.session.set({ [key]: { at: Date.now(), data } })
  } catch {
    // storage.session is best-effort; the next request refetches.
  }
}

export async function clearCached(): Promise<void> {
  try {
    await chrome.storage.session.clear()
  } catch {
    // ignore
  }
}
