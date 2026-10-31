/**
 * CommitFlex background service worker.
 *
 * Holds the extension token, talks to the CommitFlex API on behalf of the
 * popup, options page and content scripts, keeps the toolbar badge showing
 * how many posts are ready, and raises a "Drafts ready" notification when a
 * job started from GitHub finishes.
 */
import { apiRequest } from './shared/api'
import {
  BADGE_REFRESH_MINUTES,
  BUILT_IN_APP_ORIGINS,
  DEFAULT_APP_URL,
  JOB_ALARM_MINUTES,
  JOB_TRACK_TIMEOUT_MS,
  QUEUE_STALE_MS,
  VERSION,
  originPattern,
  toOrigin,
} from './shared/config'
import { pluralize } from './shared/format'
import type { BackgroundRequest, ResponseFor } from './shared/messages'
import {
  clearCached,
  getAuth,
  getCached,
  getSettings,
  getTrackedJobs,
  setAuth,
  setCached,
  setSettings,
  setTrackedJobs,
} from './shared/storage'
import type {
  ApiError,
  AuthState,
  DraftFromGithubResponse,
  ExtensionItem,
  JobResponse,
  Platform,
  PublicState,
  QueueResponse,
  Result,
  WhoAmI,
} from './shared/types'

const TOKEN_PATTERN = /^cfx_[A-Za-z0-9_-]{43}$/
const BADGE_ALARM = 'badge'
const JOBS_ALARM = 'jobs'
const BRIDGE_SCRIPT_ID = 'commitflex-bridge-custom'
const ACCENT = '#2B3FE0'
const WARNING = '#A15C00'

/* ---------------------------------------------------------------- helpers */

function fail(status: number, code: string, error: string): ApiError {
  return { ok: false, status, code, error }
}

async function resolveAppUrl(auth?: AuthState | null): Promise<string> {
  const current = auth === undefined ? await getAuth() : auth
  if (current?.appUrl) return current.appUrl
  const settings = await getSettings()
  return settings.appUrl ?? DEFAULT_APP_URL
}

async function publicState(): Promise<PublicState> {
  const [auth, settings] = await Promise.all([getAuth(), getSettings()])
  return {
    connected: !!auth && !auth.invalid,
    invalid: !!auth?.invalid,
    account: auth?.account ?? null,
    plan: auth?.plan ?? null,
    usage: auth?.usage ?? null,
    tokenPrefix: auth?.tokenPrefix ?? null,
    appUrl: auth?.appUrl ?? settings.appUrl ?? DEFAULT_APP_URL,
    settings,
    version: VERSION,
  }
}

/** Calls the token API with the stored token. A 401 marks the token invalid. */
async function authed<T>(
  path: string,
  init: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {},
): Promise<Result<T>> {
  const auth = await getAuth()
  if (!auth) return fail(401, 'not_connected', 'Connect the extension to your CommitFlex account first.')
  if (auth.invalid) {
    return fail(401, 'unauthorized', 'Your extension token was revoked or has expired. Connect the extension again.')
  }
  const result = await apiRequest<T>(auth.appUrl, auth.token, path, init)
  if (!result.ok && result.status === 401) {
    await setAuth({ ...auth, invalid: true })
    await clearCached()
    await updateBadge(null)
  }
  return result
}

/* ------------------------------------------------------------------ badge */

async function updateBadge(readyCount: number | null): Promise<void> {
  const auth = await getAuth()
  try {
    if (auth?.invalid) {
      await chrome.action.setBadgeBackgroundColor({ color: WARNING })
      await chrome.action.setBadgeText({ text: '!' })
      await chrome.action.setTitle({ title: 'CommitFlex: connect the extension again' })
      return
    }
    await chrome.action.setBadgeBackgroundColor({ color: ACCENT })
    if (typeof chrome.action.setBadgeTextColor === 'function') {
      await chrome.action.setBadgeTextColor({ color: '#FFFFFF' })
    }
    const count = readyCount ?? 0
    await chrome.action.setBadgeText({ text: count > 0 ? (count > 99 ? '99+' : String(count)) : '' })
    await chrome.action.setTitle({
      title: !auth
        ? 'CommitFlex: not connected'
        : count > 0
          ? `CommitFlex: ${pluralize(count, 'post')} ready to post`
          : 'CommitFlex',
    })
  } catch (err) {
    console.warn('[commitflex] badge update failed', err)
  }
}

function readyCountOf(data: QueueResponse): number {
  return data.counts?.ready ?? data.queue.filter((item) => item.status === 'ready').length
}

async function refreshBadge(): Promise<void> {
  const auth = await getAuth()
  if (!auth || auth.invalid) {
    await updateBadge(null)
    return
  }
  const result = await authed<QueueResponse>('/api/extension/queue')
  if (result.ok) {
    await setCached('queue:all', result.data)
    await updateBadge(readyCountOf(result.data))
  }
}

/* ------------------------------------------------------------------ queue */

async function getQueue(
  platform: Platform | undefined,
  force: boolean,
): Promise<ResponseFor<{ type: 'queue:get' }>> {
  const key = `queue:${platform ?? 'all'}`
  const cached = await getCached<QueueResponse>(key)
  if (!force && cached && Date.now() - cached.at < QUEUE_STALE_MS) {
    return { ok: true, data: { ...cached.data, fetchedAt: cached.at } }
  }
  const query = platform ? `?platform=${platform}` : ''
  const result = await authed<QueueResponse>(`/api/extension/queue${query}`)
  if (result.ok) {
    await setCached(key, result.data)
    if (!platform) await updateBadge(readyCountOf(result.data))
    return { ok: true, data: { ...result.data, fetchedAt: Date.now() } }
  }
  // Offline or the server hiccuped: show the last known queue, marked stale.
  if (cached && result.status !== 401) {
    return { ok: true, data: { ...cached.data, fetchedAt: cached.at, stale: true } }
  }
  return result
}

/* ------------------------------------------------------------------- jobs */

async function trackJob(job: DraftFromGithubResponse): Promise<void> {
  const jobs = await getTrackedJobs()
  jobs[job.jobId] = { jobId: job.jobId, repoFullName: job.repoFullName, jobUrl: job.jobUrl, startedAt: Date.now() }
  await setTrackedJobs(jobs)
  await chrome.alarms.create(JOBS_ALARM, { periodInMinutes: JOB_ALARM_MINUTES, delayInMinutes: JOB_ALARM_MINUTES })
}

async function onJobUpdate(jobId: string, job: JobResponse): Promise<void> {
  if (!job.done) return
  const jobs = await getTrackedJobs()
  const tracked = jobs[jobId]
  if (!tracked) return
  delete jobs[jobId]
  await setTrackedJobs(jobs)
  if (Object.keys(jobs).length === 0) await chrome.alarms.clear(JOBS_ALARM)

  const settings = await getSettings()
  if (!settings.notifications) return
  const repo = job.repoFullName || tracked.repoFullName
  const succeeded = job.status === 'completed' || job.status === 'partial_completed'
  if (job.status === 'cancelled') return
  try {
    await chrome.notifications.create(`job:${jobId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
      title: succeeded ? 'Drafts ready' : 'CommitFlex could not write these drafts',
      message: succeeded
        ? `${pluralize(job.drafts.length, 'post')} for ${repo} ${job.drafts.length === 1 ? 'is' : 'are'} ready to review.`
        : job.errorMessage || `Drafting from ${repo} failed. Open the job to see what happened.`,
      priority: 0,
    })
  } catch (err) {
    console.warn('[commitflex] notification failed', err)
  }
  await clearCached()
}

async function checkTrackedJobs(): Promise<void> {
  const jobs = await getTrackedJobs()
  const ids = Object.keys(jobs)
  if (ids.length === 0) {
    await chrome.alarms.clear(JOBS_ALARM)
    return
  }
  const dropped: string[] = []
  for (const jobId of ids) {
    if (Date.now() - jobs[jobId].startedAt > JOB_TRACK_TIMEOUT_MS) {
      dropped.push(jobId)
      continue
    }
    const result = await authed<JobResponse>(`/api/extension/jobs/${encodeURIComponent(jobId)}`)
    // onJobUpdate removes finished jobs itself.
    if (result.ok) await onJobUpdate(jobId, result.data)
    else if (result.status === 404 || result.status === 401) dropped.push(jobId)
  }
  const latest = await getTrackedJobs()
  for (const jobId of dropped) delete latest[jobId]
  await setTrackedJobs(latest)
  if (Object.keys(latest).length === 0) await chrome.alarms.clear(JOBS_ALARM)
}

/* ----------------------------------------------------------------- bridge */

/**
 * The bridge content script lets the CommitFlex /extension page hand the
 * extension a token. Built-in origins are declared in the manifest; a custom
 * origin from the settings page is registered here once its permission is granted.
 */
async function syncBridgeRegistration(): Promise<void> {
  if (!chrome.scripting?.registerContentScripts) return
  const settings = await getSettings()
  const origin = settings.appUrl ? toOrigin(settings.appUrl) : null
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [BRIDGE_SCRIPT_ID] })
    if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_SCRIPT_ID] })
    if (!origin || BUILT_IN_APP_ORIGINS.includes(origin)) return
    const granted = await chrome.permissions.contains({ origins: [originPattern(origin)] })
    if (!granted) return
    await chrome.scripting.registerContentScripts([
      {
        id: BRIDGE_SCRIPT_ID,
        matches: [originPattern(origin)],
        js: ['content/bridge.js'],
        runAt: 'document_idle',
        persistAcrossSessions: true,
      },
    ])
  } catch (err) {
    console.warn('[commitflex] bridge registration failed', err)
  }
}

/* --------------------------------------------------------------- handlers */

function isAllowedExternalUrl(url: string, appUrl: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.origin === new URL(appUrl).origin) return true
    if (parsed.protocol !== 'https:') return false
    return ['x.com', 'twitter.com', 'www.linkedin.com', 'linkedin.com', 'github.com'].includes(parsed.hostname)
  } catch {
    return false
  }
}

async function connect(token: string, appUrlInput: string): Promise<Result<PublicState>> {
  const trimmed = token.trim()
  if (!TOKEN_PATTERN.test(trimmed)) {
    return fail(400, 'invalid_token', 'That doesn\'t look like a CommitFlex token. Tokens start with cfx_ and are 47 characters long.')
  }
  const appUrl = toOrigin(appUrlInput)
  if (!appUrl) return fail(400, 'invalid_app_url', 'The CommitFlex address is not a valid URL.')

  const result = await apiRequest<WhoAmI>(appUrl, trimmed, '/api/extension/whoami')
  if (!result.ok) {
    if (result.status === 401) {
      return fail(401, 'invalid_token', 'CommitFlex rejected that token. It may have been revoked. Create a new one and try again.')
    }
    return result
  }
  const now = Date.now()
  await setAuth({
    token: trimmed,
    tokenPrefix: trimmed.slice(0, 12),
    appUrl,
    account: result.data.user,
    plan: result.data.plan,
    usage: result.data.usage,
    connectedAt: now,
    verifiedAt: now,
  })
  await clearCached()
  void refreshBadge()
  return { ok: true, data: await publicState() }
}

async function refreshAccount(): Promise<Result<PublicState>> {
  const result = await authed<WhoAmI>('/api/extension/whoami')
  if (!result.ok) return result
  const auth = await getAuth()
  if (auth) {
    await setAuth({
      ...auth,
      account: result.data.user,
      plan: result.data.plan,
      usage: result.data.usage,
      verifiedAt: Date.now(),
      invalid: false,
    })
  }
  return { ok: true, data: await publicState() }
}

async function handle(
  request: BackgroundRequest,
  sender: chrome.runtime.MessageSender,
): Promise<ResponseFor<BackgroundRequest>> {
  switch (request.type) {
    case 'state:get':
      return { ok: true, data: await publicState() }

    case 'auth:connect': {
      // Extension pages (popup, options) may connect to any address. A content
      // script may only connect for the origin it runs on: the bridge on CommitFlex.
      const fromExtensionPage = !!sender.url && sender.url.startsWith(chrome.runtime.getURL(''))
      if (!fromExtensionPage && sender.url) {
        const senderOrigin = toOrigin(sender.url)
        if (!senderOrigin || senderOrigin !== toOrigin(request.appUrl)) {
          return fail(403, 'forbidden', 'Connect from the CommitFlex extension page.')
        }
      }
      return connect(request.token, request.appUrl)
    }

    case 'auth:disconnect':
      await setAuth(null)
      await clearCached()
      await setTrackedJobs({})
      await chrome.alarms.clear(JOBS_ALARM)
      await updateBadge(null)
      return { ok: true, data: await publicState() }

    case 'auth:refresh':
      return refreshAccount()

    case 'queue:get':
      return getQueue(request.platform, !!request.force)

    case 'draft:posted': {
      const result = await authed<{ ok: true; item: ExtensionItem }>(
        `/api/extension/drafts/${encodeURIComponent(request.draftId)}/posted`,
        { method: 'POST', body: request.url ? { url: request.url } : {} },
      )
      if (!result.ok) return result
      await clearCached()
      void refreshBadge()
      return { ok: true, data: { item: result.data.item } }
    }

    case 'draft:approve': {
      const result = await authed<{ ok: true; item: ExtensionItem }>(
        `/api/extension/drafts/${encodeURIComponent(request.draftId)}/approve`,
        { method: 'POST', body: {} },
      )
      if (!result.ok) return result
      await clearCached()
      void refreshBadge()
      return { ok: true, data: { item: result.data.item } }
    }

    case 'draft:unposted': {
      const result = await authed<{ ok: true; item: ExtensionItem }>(
        `/api/extension/drafts/${encodeURIComponent(request.draftId)}/posted`,
        { method: 'DELETE' },
      )
      if (!result.ok) return result
      await clearCached()
      void refreshBadge()
      return { ok: true, data: { item: result.data.item } }
    }

    case 'repo:connect': {
      const result = await authed<{ ok: true; repo: { id: string; fullName: string; webhookConfigured: boolean }; warning?: string }>(
        '/api/extension/repos',
        { method: 'POST', body: { fullName: request.fullName } },
      )
      if (!result.ok) return result
      return { ok: true, data: { repo: result.data.repo, ...(result.data.warning ? { warning: result.data.warning } : {}) } }
    }

    case 'github:draft': {
      const result = await authed<DraftFromGithubResponse>('/api/extension/draft-from-github', {
        method: 'POST',
        body: { url: request.url },
      })
      if (result.ok) await trackJob(result.data)
      return result
    }

    case 'job:get': {
      const result = await authed<JobResponse>(`/api/extension/jobs/${encodeURIComponent(request.jobId)}`)
      if (result.ok) await onJobUpdate(request.jobId, result.data)
      return result
    }

    case 'open:app': {
      const path = request.path.startsWith('/') ? request.path : '/'
      await chrome.tabs.create({ url: `${await resolveAppUrl()}${path}` })
      return { ok: true, data: null }
    }

    case 'open:url': {
      if (!isAllowedExternalUrl(request.url, await resolveAppUrl())) {
        return fail(400, 'invalid_url', 'CommitFlex can only open its own pages, LinkedIn, X and GitHub.')
      }
      await chrome.tabs.create({ url: request.url })
      return { ok: true, data: null }
    }

    case 'open:options':
      await chrome.runtime.openOptionsPage()
      return { ok: true, data: null }

    case 'settings:update': {
      const patch = { ...request.patch }
      if ('appUrl' in patch) {
        const raw = patch.appUrl
        const origin = raw ? toOrigin(raw) : null
        if (raw && !origin) return fail(400, 'invalid_app_url', 'Enter a full address such as https://commitflex.app.')
        patch.appUrl = origin && origin !== DEFAULT_APP_URL ? origin : null
      }
      await setSettings(patch)
      if ('appUrl' in patch) await syncBridgeRegistration()
      return { ok: true, data: await publicState() }
    }
  }
}

/* ---------------------------------------------------------------- wiring */

chrome.runtime.onMessage.addListener((request: BackgroundRequest, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false
  handle(request, sender).then(sendResponse, (err: unknown) => {
    console.error('[commitflex] request failed', request.type, err)
    sendResponse(fail(500, 'extension_error', 'The extension hit an error. Try again.'))
  })
  return true
})

async function ensureAlarms(): Promise<void> {
  const badge = await chrome.alarms.get(BADGE_ALARM)
  if (!badge) await chrome.alarms.create(BADGE_ALARM, { periodInMinutes: BADGE_REFRESH_MINUTES, delayInMinutes: 1 })
  const jobs = await getTrackedJobs()
  if (Object.keys(jobs).length > 0 && !(await chrome.alarms.get(JOBS_ALARM))) {
    await chrome.alarms.create(JOBS_ALARM, { periodInMinutes: JOB_ALARM_MINUTES })
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BADGE_ALARM) void refreshBadge()
  if (alarm.name === JOBS_ALARM) void checkTrackedJobs()
})

chrome.notifications.onClicked.addListener((notificationId) => {
  if (!notificationId.startsWith('job:')) return
  const jobId = notificationId.slice(4)
  void (async () => {
    await chrome.tabs.create({ url: `${await resolveAppUrl()}/jobs/${encodeURIComponent(jobId)}` })
    await chrome.notifications.clear(notificationId)
  })()
})

chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await ensureAlarms()
    await syncBridgeRegistration()
    await refreshBadge()
    if (details.reason === 'install') {
      // Land on the connect page: it detects the extension and offers one-click connect.
      await chrome.tabs.create({ url: `${await resolveAppUrl()}/extension` })
    }
  })()
})

chrome.runtime.onStartup.addListener(() => {
  void (async () => {
    await ensureAlarms()
    await syncBridgeRegistration()
    await refreshBadge()
  })()
})

chrome.permissions.onAdded.addListener(() => void syncBridgeRegistration())
chrome.permissions.onRemoved.addListener(() => void syncBridgeRegistration())
