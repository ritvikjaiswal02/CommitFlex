import { appUrl } from '@/lib/env'
import {
  consumeApprovalToken,
  isApprovalAction,
  releaseApprovalTokenClaim,
  resolveApprovalToken,
  type ApprovalAction,
} from '@/lib/autopilot/approval'
import { approveQueueRow, recordManualPublish } from '@/lib/autopilot/queue'
import { isQueueError } from '@/lib/autopilot/errors'
import { isPlanError } from '@/lib/plans'
import { transitionQueueItem } from '@/lib/db/queries/autopilot'
import type { QueueItemRow } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

type Outcome = 'approved' | 'already' | 'expired' | 'invalid' | 'skipped' | 'posted' | 'limit' | 'busy'

const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }

function see(path: string, params: URLSearchParams): Response {
  return new Response(null, { status: 303, headers: { Location: `${appUrl()}${path}?${params.toString()}`, ...NO_STORE } })
}

function redirectTo(status: Outcome, item?: QueueItemRow | null, token?: string | null): Response {
  const params = new URLSearchParams({ status })
  if (item) {
    params.set('draft', item.draftId)
    params.set('platform', item.platform)
    if (item.scheduledFor) params.set('at', item.scheduledFor.toISOString())
  }
  // The result page uses the (now spent) token to show the post it acted on.
  if (token) params.set('token', token)
  return see('/queue/approved', params)
}

const DONE = ['approved', 'scheduled', 'ready', 'publishing', 'published']

function readAction(value: unknown): ApprovalAction {
  return isApprovalAction(value) ? value : 'approve'
}

/**
 * GET: the link in the email. Never changes anything, because mail scanners
 * open every link. It only checks the token and sends the browser to the
 * confirmation page, which shows the post and POSTs back here.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const action = readAction(url.searchParams.get('action'))

  try {
    const resolved = await resolveApprovalToken(token)
    if (resolved.status === 'invalid') return redirectTo('invalid')
    if (resolved.status === 'expired') return redirectTo('expired', resolved.item)
    if (resolved.status === 'used') return redirectTo('already', resolved.item, token)
    if (!resolved.actions.includes(action)) return redirectTo('invalid')
    return see('/queue/approved', new URLSearchParams({ token: token ?? '', action, preview: '1' }))
  } catch (err) {
    console.error('[drafts/approve] lookup failed', err)
    return redirectTo('invalid')
  }
}

/** Same-origin check for the confirmation form (defence in depth on top of the token). */
function isSameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.get('origin')
  if (!origin || origin === 'null') return true
  const allowed = new Set([new URL(req.url).origin])
  try {
    allowed.add(new URL(appUrl()).origin)
  } catch {
    // appUrl() is validated at startup; ignore a malformed value here.
  }
  return allowed.has(origin)
}

async function readForm(req: Request): Promise<{ token: string | null; action: unknown }> {
  const type = req.headers.get('content-type') ?? ''
  try {
    if (type.includes('application/json')) {
      const body = (await req.json()) as { token?: unknown; action?: unknown }
      return { token: typeof body.token === 'string' ? body.token : null, action: body.action }
    }
    const form = await req.formData()
    const token = form.get('token')
    return { token: typeof token === 'string' ? token : null, action: form.get('action') }
  } catch {
    return { token: null, action: null }
  }
}

/**
 * POST: the confirmation page's button. Consumes the token atomically
 * before acting, so two clicks (or two tabs) can't both act, and checks that
 * this token may take this action (Team reviewers can only approve).
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) {
    return Response.json({ error: 'Open the link from your email to confirm.', code: 'forbidden' }, { status: 403 })
  }
  const { token, action } = await readForm(req)
  if (!isApprovalAction(action)) return redirectTo('invalid')

  try {
    const resolved = await resolveApprovalToken(token)
    if (resolved.status === 'invalid') return redirectTo('invalid')
    if (resolved.status === 'expired') return redirectTo('expired', resolved.item)
    if (resolved.status === 'used') return redirectTo('already', resolved.item, token)
    if (!resolved.actions.includes(action)) return redirectTo('invalid')

    const { item, email, tokenId, userId } = resolved
    if (action === 'approve' && DONE.includes(item.status)) return redirectTo('already', item, token)
    if (action === 'skip' && ['published', 'publishing', 'skipped'].includes(item.status)) {
      return redirectTo('already', item, token)
    }
    if (action === 'posted' && item.status === 'published') return redirectTo('already', item, token)

    // Claim first: only one request ever gets past this line per token.
    if (!(await consumeApprovalToken(tokenId))) return redirectTo('already', item, token)

    try {
      if (action === 'skip') {
        const updated = await transitionQueueItem(
          item.id,
          ['pending_review', 'approved', 'scheduled', 'ready', 'failed'],
          { status: 'skipped', nextAttemptAt: null },
        )
        return redirectTo(updated ? 'skipped' : 'already', updated ?? item, token)
      }

      if (action === 'posted') {
        await recordManualPublish({
          userId,
          draftId: item.draftId,
          method: item.platform === 'twitter' ? 'x_intent' : 'manual',
        })
        return redirectTo('posted', item, token)
      }

      const { item: updated, changed } = await approveQueueRow(item, email)
      return redirectTo(changed ? 'approved' : 'already', updated, token)
    } catch (err) {
      // The action didn't happen, so the link should keep working.
      await releaseApprovalTokenClaim(tokenId).catch(() => {})
      if (isPlanError(err)) return redirectTo('limit', item)
      if (isQueueError(err) && err.status === 409) return redirectTo('busy', item)
      throw err
    }
  } catch (err) {
    console.error('[drafts/approve] failed', err)
    return redirectTo('invalid')
  }
}
