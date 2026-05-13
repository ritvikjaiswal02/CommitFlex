import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { getRepoByGithubRepoId } from '@/lib/db/queries/repos'
import { createJob, hasActiveJob } from '@/lib/db/queries/jobs'
import { runPipeline } from '@/lib/pipeline/run'
import { verifySignature } from '@/lib/github/webhook'
import { GithubPushPayloadSchema } from '@/lib/validators/webhooks'
import { checkRateLimit } from '@/lib/rate-limit'

// 10 push events per repo per minute. Independent of user rate-limit because
// a burst of pushes from automation shouldn't block the human's UI generations.
const WEBHOOK_RATE_LIMIT = { windowMs: 60 * 1000, max: 10 }

const WINDOW_DAYS = 7

export async function POST(req: Request) {
  const event = req.headers.get('x-github-event')
  const signature = req.headers.get('x-hub-signature-256')

  // Respond fast to non-push events (GitHub sends a `ping` on install).
  if (event === 'ping') {
    return Response.json({ ok: true, event: 'ping' })
  }
  if (event !== 'push') {
    return Response.json({ ok: true, ignored: event ?? 'unknown' })
  }

  // Read raw body once so we can both verify HMAC and parse JSON.
  const rawBody = await req.text()

  // Parse the payload first to learn which repo this is for; we need the repo
  // row to know its per-repo secret before we can verify the signature.
  let payload
  try {
    const parsed = GithubPushPayloadSchema.safeParse(JSON.parse(rawBody))
    if (!parsed.success) return Response.json({ error: 'Invalid payload' }, { status: 400 })
    payload = parsed.data
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const repo = await getRepoByGithubRepoId(payload.repository.id)
  if (!repo) {
    // Repo isn't connected (or was disconnected). Drop silently with 200 so
    // GitHub doesn't keep retrying.
    return Response.json({ ok: true, ignored: 'repo_not_connected' })
  }
  if (!repo.webhookSecret) {
    return Response.json({ error: 'Webhook not configured for this repo' }, { status: 401 })
  }

  if (!verifySignature(rawBody, signature, repo.webhookSecret)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Per-repo rate limit AFTER we've authenticated the request — we don't want
  // unauth callers to influence the budget for legit pushes.
  const rl = checkRateLimit(`webhook:${repo.githubRepoId}`, WEBHOOK_RATE_LIMIT)
  if (!rl.allowed) return Response.json({ error: 'Rate limit exceeded' }, { status: 429 })

  // Only fire on pushes to the default branch.
  const branch = payload.ref.replace(/^refs\/heads\//, '')
  if (branch !== repo.defaultBranch) {
    return Response.json({ ok: true, ignored: 'non_default_branch', branch })
  }

  // Respect the per-repo kill-switch.
  if (!repo.autoGenerate) {
    return Response.json({ ok: true, ignored: 'auto_generate_disabled' })
  }

  // Don't pile up jobs if one is already running.
  if (await hasActiveJob(repo.id)) {
    return Response.json({ ok: true, ignored: 'active_job' })
  }

  // Need the user's GitHub access token to fetch commits during the pipeline.
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, repo.userId), eq(accounts.provider, 'github')))
    .limit(1)
  if (!account?.access_token) {
    return Response.json({ error: 'Owner has no GitHub account connected' }, { status: 412 })
  }

  // Window: last N days ending now. Matches the manual /generate UX.
  const windowEnd = new Date()
  const windowStart = new Date(windowEnd)
  windowStart.setDate(windowEnd.getDate() - WINDOW_DAYS)

  const job = await createJob({
    userId: repo.userId,
    repoId: repo.id,
    windowStart,
    windowEnd,
  })

  const repoUrl = repo.url ?? `https://github.com/${repo.fullName}`
  // Fire-and-forget — same pattern as /api/generate.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runPipeline(job as any, repoUrl, account.access_token).catch(console.error)

  return Response.json({ ok: true, jobId: job.id }, { status: 202 })
}
