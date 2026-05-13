import { createHmac, timingSafeEqual, randomBytes } from 'crypto'
import type { Octokit } from '@octokit/rest'

/**
 * Default origin used to compute the webhook payload URL when the env var
 * isn't set. Vercel exposes VERCEL_URL; locally it falls back to localhost.
 */
export function webhookBaseUrl(): string {
  if (process.env.WEBHOOK_BASE_URL) return process.env.WEBHOOK_BASE_URL
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
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
}

/** Create the push-event webhook on a GitHub repo. Returns the new webhook ID. */
export async function installRepoWebhook({ octokit, owner, repo, secret, payloadUrl }: InstallParams): Promise<number> {
  const { data } = await octokit.repos.createWebhook({
    owner,
    repo,
    config: {
      url: payloadUrl ?? webhookPayloadUrl(),
      content_type: 'json',
      secret,
      insecure_ssl: '0',
    },
    events: ['push'],
    active: true,
  })
  return data.id
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
