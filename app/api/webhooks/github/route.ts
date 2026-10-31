import { listReposByGithubRepoId } from '@/lib/db/queries/repos'
import { openSecret } from '@/lib/auth/encrypt'
import { isRepoWithinPlan } from '@/lib/autopilot/limits'
import { getActiveJob } from '@/lib/db/queries/jobs'
import { getAutopilotSettings, insertShipEvent, updateShipEvent } from '@/lib/db/queries/autopilot'
import { verifySignature } from '@/lib/github/webhook'
import {
  GithubPullRequestPayloadSchema,
  GithubPushPayloadSchema,
  GithubReleasePayloadSchema,
  GithubRepositoryRefSchema,
} from '@/lib/validators/webhooks'
import { evaluatePullRequest, evaluateRelease } from '@/lib/autopilot/ship-moments'
import { sendLimitReachedOnce } from '@/lib/autopilot/emails'
import { localDateKey } from '@/lib/autopilot/slots'
import { startGenerationJob, type StartJobInput, type StartJobResult } from '@/lib/pipeline/start'
import { PLANS, hasFeature, limitFor, type PlanErrorBody } from '@/lib/plans'
import { checkRateLimit } from '@/lib/rate-limit'
import type { RepoRow } from '@/lib/db/schema'
import type { AutopilotSettings, AutopilotTrigger } from '@/types/autopilot'

// 10 events per repo per minute. Independent of the user's rate limit so a
// burst from automation never blocks the human's own generations.
const WEBHOOK_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 }
const PUSH_WINDOW_DAYS = 7
const HANDLED_EVENTS = new Set(['push', 'pull_request', 'release'])
/** GitHub caps payloads at 25 MB, but nothing we handle comes close to 2 MB. */
const MAX_BODY_BYTES = 2_000_000

function tooLarge(): Response {
  return Response.json({ error: 'Payload too large', code: 'payload_too_large' }, { status: 413 })
}

function secretOf(repo: RepoRow): string | null {
  try {
    return openSecret(repo.webhookSecret)
  } catch (err) {
    console.error('[webhook] could not decrypt the webhook secret', repo.id, err)
    return null
  }
}

function ignored(reason: string, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: true, ignored: reason, ...extra })
}

/** Why autopilot should not act on this repo right now, or null when it should. */
function autopilotBlock(repo: RepoRow, settings: AutopilotSettings, trigger: AutopilotTrigger, now: Date): string | null {
  if (!repo.autopilotEnabled) return 'repo_autopilot_off'
  if (!settings.enabled) return 'autopilot_off'
  if (settings.pausedUntil && new Date(settings.pausedUntil).getTime() > now.getTime()) return 'autopilot_paused'
  if (!settings.triggers.includes(trigger)) return 'trigger_off'
  return null
}

async function notifyLimit(userId: string, planError: PlanErrorBody | undefined, skipped: string): Promise<void> {
  if (!planError || planError.code !== 'limit_reached') return
  const next = planError.requiredPlan
  await sendLimitReachedOnce({
    userId,
    used: planError.used,
    max: planError.max,
    planName: PLANS[planError.currentPlan].name,
    nextPlanName: PLANS[next].name,
    nextPlanMax: limitFor(next, 'generationsPerMonth'),
    skipped,
  })
}

/** Starts a ship-moment job and records the outcome on the ship event. */
async function startForShipEvent(input: {
  repo: RepoRow
  shipEventId: string
  description: string
  source: StartJobInput['source']
  trigger: StartJobInput['trigger']
  autoQueue: boolean
}): Promise<Response> {
  const result: StartJobResult = await startGenerationJob({
    userId: input.repo.userId,
    repoId: input.repo.id,
    source: input.source,
    trigger: input.trigger,
    autoQueue: input.autoQueue,
  })
  if (result.ok) {
    await updateShipEvent(input.shipEventId, { jobId: result.jobId })
    return Response.json({ ok: true, jobId: result.jobId }, { status: 202 })
  }
  await updateShipEvent(input.shipEventId, { metadata: { skipped: result.code } })
  if (result.code === 'limit_reached') {
    await notifyLimit(input.repo.userId, result.planError, input.description)
    return ignored('limit_reached')
  }
  if (result.code === 'no_github_token') {
    return Response.json({ error: result.error, code: result.code }, { status: 412 })
  }
  return ignored(result.code, result.jobId ? { jobId: result.jobId } : undefined)
}

export async function POST(req: Request) {
  const event = req.headers.get('x-github-event')
  const signature = req.headers.get('x-hub-signature-256')

  // GitHub sends a `ping` when the hook is created.
  if (event === 'ping') return Response.json({ ok: true, event: 'ping' })
  if (!event || !HANDLED_EVENTS.has(event)) return ignored(event ?? 'unknown')

  // Unauthenticated so far: refuse big bodies before reading or parsing them.
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return tooLarge()

  // Read the raw body once: it's needed for the HMAC and for parsing.
  const rawBody = await req.text()
  if (rawBody.length > MAX_BODY_BYTES) return tooLarge()
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Invalid JSON', code: 'invalid_request' }, { status: 400 })
  }

  // Find the repo first: its per-repo secret verifies the signature.
  const ref = GithubRepositoryRefSchema.safeParse(json)
  if (!ref.success) return Response.json({ error: 'Invalid payload', code: 'invalid_request' }, { status: 400 })

  // Several users may have connected the same repository (collaborators);
  // the one whose secret verifies the signature is the hook that fired.
  const candidates = await listReposByGithubRepoId(ref.data.repository.id)
  // Unknown or disconnected repo: 200 so GitHub doesn't keep retrying.
  if (candidates.length === 0) return ignored('repo_not_connected')
  const repo = candidates.find((r) => {
    const secret = secretOf(r)
    return !!secret && verifySignature(rawBody, signature, secret)
  })
  if (!repo) {
    return Response.json({ error: 'Invalid signature', code: 'unauthorized' }, { status: 401 })
  }

  // Rate limit only after authenticating, so strangers can't burn the budget.
  const rl = await checkRateLimit(`webhook:${repo.githubRepoId}`, WEBHOOK_RATE_LIMIT)
  if (!rl.allowed) return Response.json({ error: 'Rate limit exceeded', code: 'rate_limited' }, { status: 429 })

  const now = new Date()

  /* ── push ─────────────────────────────────────────────────────────── */
  if (event === 'push') {
    const parsed = GithubPushPayloadSchema.safeParse(json)
    if (!parsed.success) return Response.json({ error: 'Invalid payload', code: 'invalid_request' }, { status: 400 })
    const branch = parsed.data.ref.replace(/^refs\/heads\//, '')
    if (branch !== repo.defaultBranch) return ignored('non_default_branch', { branch })
    if (!repo.autoGenerate) return ignored('auto_generate_disabled')
    if (parsed.data.commits.length === 0 && !parsed.data.head_commit) return ignored('no_commits')

    const settings = await getAutopilotSettings(repo.userId)
    // Pushes only feed the queue when the user opted into push windows.
    const autoQueue =
      autopilotBlock(repo, settings, 'push_window', now) === null && (await isRepoWithinPlan(repo.userId, repo.id))

    // At most one push-driven draft per repo per day (in the user's timezone).
    const shipEvent = await insertShipEvent({
      userId: repo.userId,
      repoId: repo.id,
      kind: 'push',
      externalId: localDateKey(now, settings.timezone),
      title: parsed.data.head_commit?.message?.split('\n')[0]?.slice(0, 200) || `Pushes to ${branch}`,
      url: `https://github.com/${repo.fullName}/commits/${encodeURIComponent(branch)}`,
      metadata: { commits: parsed.data.commits.length },
    })
    if (!shipEvent) return ignored('already_drafted_today')

    const active = await getActiveJob(repo.id)
    if (active) {
      await updateShipEvent(shipEvent.id, { metadata: { skipped: 'active_job' } })
      return ignored('active_job')
    }

    const windowStart = new Date(now.getTime() - PUSH_WINDOW_DAYS * 24 * 3600_000)
    return startForShipEvent({
      repo,
      shipEventId: shipEvent.id,
      description: `this week's commits in ${repo.fullName}`,
      source: { type: 'window', windowStart, windowEnd: now },
      trigger: 'push',
      autoQueue,
    })
  }

  /* ── pull_request (merged) ────────────────────────────────────────── */
  if (event === 'pull_request') {
    const parsed = GithubPullRequestPayloadSchema.safeParse(json)
    if (!parsed.success) return Response.json({ error: 'Invalid payload', code: 'invalid_request' }, { status: 400 })
    const decision = evaluatePullRequest(parsed.data, repo.defaultBranch)
    if (!decision.ok) return ignored(decision.reason)

    const settings = await getAutopilotSettings(repo.userId)
    const blocked = autopilotBlock(repo, settings, 'pr_merged', now)
    if (blocked) return ignored(blocked)
    if (!(await hasFeature(repo.userId, 'autopilot.ship_moments'))) return ignored('plan')
    if (!(await isRepoWithinPlan(repo.userId, repo.id))) return ignored('plan_repo_limit')

    const pr = parsed.data.pull_request
    const shipEvent = await insertShipEvent({
      userId: repo.userId,
      repoId: repo.id,
      kind: 'pr_merged',
      externalId: String(pr.number),
      title: pr.title.slice(0, 500),
      url: pr.html_url,
      metadata: { additions: pr.additions ?? null, deletions: pr.deletions ?? null, author: pr.user?.login ?? null },
    })
    if (!shipEvent) return ignored('duplicate')

    const active = await getActiveJob(repo.id)
    if (active) {
      await updateShipEvent(shipEvent.id, { metadata: { skipped: 'active_job' } })
      return ignored('active_job')
    }

    return startForShipEvent({
      repo,
      shipEventId: shipEvent.id,
      description: `pull request "${pr.title}" in ${repo.fullName}`,
      source: { type: 'pr', ref: pr.html_url },
      trigger: 'pr_merged',
      autoQueue: true,
    })
  }

  /* ── release (published) ──────────────────────────────────────────── */
  const parsed = GithubReleasePayloadSchema.safeParse(json)
  if (!parsed.success) return Response.json({ error: 'Invalid payload', code: 'invalid_request' }, { status: 400 })
  const decision = evaluateRelease(parsed.data)
  if (!decision.ok) return ignored(decision.reason)

  const settings = await getAutopilotSettings(repo.userId)
  const blocked = autopilotBlock(repo, settings, 'release_published', now)
  if (blocked) return ignored(blocked)
  if (!(await hasFeature(repo.userId, 'autopilot.ship_moments'))) return ignored('plan')
  if (!(await isRepoWithinPlan(repo.userId, repo.id))) return ignored('plan_repo_limit')

  const release = parsed.data.release
  const shipEvent = await insertShipEvent({
    userId: repo.userId,
    repoId: repo.id,
    kind: 'release_published',
    externalId: String(release.id),
    title: (release.name?.trim() || release.tag_name).slice(0, 500),
    url: release.html_url,
    metadata: { tag: release.tag_name },
  })
  if (!shipEvent) return ignored('duplicate')

  const active = await getActiveJob(repo.id)
  if (active) {
    await updateShipEvent(shipEvent.id, { metadata: { skipped: 'active_job', tag: release.tag_name } })
    return ignored('active_job')
  }

  return startForShipEvent({
    repo,
    shipEventId: shipEvent.id,
    description: `release ${release.tag_name} of ${repo.fullName}`,
    source: { type: 'release', ref: release.tag_name },
    trigger: 'release_published',
    autoQueue: true,
  })
}
