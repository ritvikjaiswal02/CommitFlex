/**
 * One-time approval links for emails. The raw token goes in the link; only
 * its SHA-256 is stored. A token is bound to one queue item, one recipient
 * and the actions that recipient may take, and works once, for 7 days.
 *
 * Opening a link never changes anything: GET only resolves the token and
 * shows a confirmation page. Mail scanners (Safe Links, Mimecast, Proofpoint,
 * Gmail prefetch) open every link in an email, so the state change happens
 * on a same-origin POST from that page.
 */
import { createHash, randomBytes } from 'crypto'
import { appUrl } from '@/lib/env'
import {
  claimApprovalToken,
  findApprovalToken,
  getQueueRow,
  insertApprovalTokens,
  releaseApprovalToken,
} from '@/lib/db/queries/autopilot'
import type { QueueItemRow } from '@/lib/db/schema'

export const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 3600_000

export const APPROVAL_ACTIONS = ['approve', 'skip', 'posted'] as const
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number]

export function isApprovalAction(value: unknown): value is ApprovalAction {
  return typeof value === 'string' && (APPROVAL_ACTIONS as readonly string[]).includes(value)
}

export function hashApprovalToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateApprovalToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashApprovalToken(token) }
}

export function approvalUrl(token: string, action: ApprovalAction = 'approve'): string {
  const params = new URLSearchParams({ token })
  if (action !== 'approve') params.set('action', action)
  return `${appUrl()}/api/drafts/approve?${params.toString()}`
}

/**
 * Creates one token per (item, recipient), allowed to do `actions` only
 * (default: approve). Returns raw tokens keyed by `${queueItemId}:${email}`.
 */
export async function createApprovalTokens(
  userId: string,
  pairs: { queueItemId: string; email: string; actions?: ApprovalAction[] }[],
  now: Date = new Date(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const rows = pairs.map((p) => {
    const { token, hash } = generateApprovalToken()
    out.set(`${p.queueItemId}:${p.email.toLowerCase()}`, token)
    return {
      userId,
      queueItemId: p.queueItemId,
      tokenHash: hash,
      email: p.email.toLowerCase(),
      actions: p.actions && p.actions.length > 0 ? [...p.actions] : ['approve'],
      expiresAt: new Date(now.getTime() + APPROVAL_TOKEN_TTL_MS),
    }
  })
  await insertApprovalTokens(rows)
  return out
}

export type ResolvedApproval =
  | { status: 'invalid' }
  | { status: 'expired'; item: QueueItemRow | null }
  | { status: 'used'; item: QueueItemRow; email: string }
  | {
      status: 'ok'
      item: QueueItemRow
      email: string
      tokenId: string
      userId: string
      actions: ApprovalAction[]
    }

function tokenActions(raw: readonly string[] | null | undefined): ApprovalAction[] {
  const list = (raw ?? ['approve']).filter(isApprovalAction)
  return list.length > 0 ? list : ['approve']
}

/** Looks up a raw token. Never consumes it and never changes anything. */
export async function resolveApprovalToken(raw: string | null | undefined, now: Date = new Date()): Promise<ResolvedApproval> {
  if (!raw || raw.length < 20 || raw.length > 200) return { status: 'invalid' }
  const row = await findApprovalToken(hashApprovalToken(raw))
  if (!row) return { status: 'invalid' }
  const item = await getQueueRow(row.queueItemId)
  if (!item || item.userId !== row.userId) return { status: 'invalid' }
  if (row.usedAt) return { status: 'used', item, email: row.email }
  if (row.expiresAt.getTime() <= now.getTime()) return { status: 'expired', item }
  return {
    status: 'ok',
    item,
    email: row.email,
    tokenId: row.id,
    userId: row.userId,
    actions: tokenActions(row.actions),
  }
}

/**
 * Consumes the token atomically. Returns false when another request already
 * used it (or it expired in between); the caller must then do nothing.
 */
export async function consumeApprovalToken(tokenId: string, now: Date = new Date()): Promise<boolean> {
  return claimApprovalToken(tokenId, now)
}

/** Undoes a consume when the action it was taken for could not run. */
export async function releaseApprovalTokenClaim(tokenId: string): Promise<void> {
  await releaseApprovalToken(tokenId)
}
