import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import type { Octokit } from '@octokit/rest'
import { webhookBaseUrl as envWebhookBaseUrl } from '@/lib/env'

/** Events autopilot needs: pushes, merged pull requests and releases. */
export const WEBHOOK_EVENTS = ['push', 'pull_request', 'release'] as const

/**
 * Public origin GitHub calls back to: WEBHOOK_BASE_URL, else the app URL
 * (APP_URL, NEXTAUTH_URL, VERCEL_URL, localhost).
 */
export function webhookBaseUrl(): string {
  return envWebhookBaseUrl()
}

export function webhookPayloadUrl(): string {
  return `${webhookBaseUrl().replace(/\/$/, '')}/api/webhooks/github`
}

/** 32-byte hex string suitable for use as a per-repo webhook secret. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Verify GitHub's X-Hub-Signature-256 header against the raw request body.
 * Uses timing-safe comparison so a malicious caller can't probe byte-by-byte.
 */
export function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const provided = signatureHeader.slice('sha256='.length)
  if (expected.length !== provided.length) return false
  try {
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'))
  } catch {
    return false
  }
}

interface InstallParams {
  octokit: Octokit
  owner: string
  repo: string
  secret: string
  payloadUrl?: string
  events?: readonly string[]
}

/** Create the repo webhook (push, pull_request, release). Returns the new webhook ID. */
export async function installRepoWebhook({ octokit, owner, repo, secret, payloadUrl, events }: InstallParams): Promise<number> {
  const { data } = await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: payloadUrl ?? webhookPayloadUrl(),
      content_type: 'json',
      secret,
      insecure_ssl: '0',
    },
    events: [...(events ?? WEBHOOK_EVENTS)],
    active: true,
  })
  return data.id
}

/**
 * Switch an existing hook to all autopilot events and a fresh secret.
 * Throws with `status` 404 when the hook no longer exists on GitHub.
 */
export async function updateRepoWebhook(params: {
  octokit: Octokit
  owner: string
  repo: string
  webhookId: number
  secret: string
  payloadUrl?: string
}): Promise<void> {
  await params.octokit.repos.updateWebhook({
    owner: params.owner,
    repo: params.repo,
    hook_id: params.webhookId,
    config: {
      url: params.payloadUrl ?? webhookPayloadUrl(),
      content_type: 'json',
      secret: params.secret,
      insecure_ssl: '0',
    },
    events: [...WEBHOOK_EVENTS],
    active: true,
  })
}

interface RemoveParams {
  octokit: Octokit
  owner: string
  repo: string
  webhookId: number
}

/**
 * Remove a webhook by ID. Tolerates 404 (already gone, e.g. user deleted it
 * from the GitHub UI) — we don't want disconnect to fail on stale data.
 */
export async function removeRepoWebhook({ octokit, owner, repo, webhookId }: RemoveParams): Promise<void> {
  try {
    await octokit.repos.deleteWebhook({ owner, repo, hook_id: webhookId })
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) return
    throw err
  }
}

/** Parse `fullName` like "octocat/hello-world" into owner+repo halves. */
export function splitFullName(fullName: string): { owner: string; repo: string } {
  const idx = fullName.indexOf('/')
  if (idx < 0) throw new Error(`Invalid repo full_name: ${fullName}`)
  return { owner: fullName.slice(0, idx), repo: fullName.slice(idx + 1) }
}
