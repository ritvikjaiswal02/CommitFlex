/**
 * Environment helpers.
 *
 * This module never throws at import time: `next build` runs with only the
 * core variables set, and every optional integration (LinkedIn, Razorpay,
 * Resend, cron, Anthropic) must degrade gracefully when its keys are absent.
 * Missing required values throw only when the helper that needs them runs.
 */

/** Returns the trimmed value, treating '' (and whitespace-only) as unset. */
export function optionalEnv(name: string): string | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  const value = raw.trim()
  return value === '' ? undefined : value
}

/** Returns the value or throws `Missing env NAME` when it is unset. */
export function requireEnv(name: string): string {
  const value = optionalEnv(name)
  if (value === undefined) throw new Error(`Missing env ${name}`)
  return value
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Canonical public origin, without a trailing slash. Used for email links,
 * approval links and OAuth redirects.
 * Order: APP_URL, NEXTAUTH_URL, https://$VERCEL_URL, http://localhost:3000.
 */
export function appUrl(): string {
  const explicit = optionalEnv('APP_URL') ?? optionalEnv('NEXTAUTH_URL')
  if (explicit) return stripTrailingSlash(explicit)
  const vercel = optionalEnv('VERCEL_URL')
  if (vercel) return stripTrailingSlash(/^https?:\/\//.test(vercel) ? vercel : `https://${vercel}`)
  return 'http://localhost:3000'
}

export type Integration = 'linkedin' | 'razorpay' | 'email' | 'cron' | 'anthropic'

const INTEGRATION_VARS: Record<Integration, readonly string[]> = {
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'OAUTH_TOKEN_ENCRYPTION_KEY'],
  razorpay: ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
  email: ['RESEND_API_KEY'],
  cron: ['CRON_SECRET'],
  anthropic: ['ANTHROPIC_API_KEY'],
}

/** True when every variable the integration needs is set (non-empty). */
export function isConfigured(integration: Integration): boolean {
  return INTEGRATION_VARS[integration].every((name) => optionalEnv(name) !== undefined)
}

/** Names of the variables an integration needs that are currently unset. */
export function missingEnvFor(integration: Integration): string[] {
  return INTEGRATION_VARS[integration].filter((name) => optionalEnv(name) === undefined)
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/** LinkedIn `LinkedIn-Version` header for the Posts API. */
export function linkedInApiVersion(): string {
  return optionalEnv('LINKEDIN_API_VERSION') ?? '202510'
}

/** Sender for transactional email. */
export function emailFrom(): string {
  return optionalEnv('EMAIL_FROM') ?? 'CommitFlex <onboarding@resend.dev>'
}

/** Public origin GitHub calls back to for webhooks. Falls back to appUrl(). */
export function webhookBaseUrl(): string {
  const explicit = optionalEnv('WEBHOOK_BASE_URL')
  return explicit ? stripTrailingSlash(explicit) : appUrl()
}

/** The variables the app cannot run without. */
export const CORE_ENV_VARS = [
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GEMINI_API_KEY',
] as const

/**
 * Lists missing core variables (plus the production-only ones). For startup
 * diagnostics in scripts or health routes; never called at import time.
 */
export function missingCoreEnv(): string[] {
  const missing: string[] = CORE_ENV_VARS.filter((name) => optionalEnv(name) === undefined)
  if (isProduction()) {
    const key = optionalEnv('OAUTH_TOKEN_ENCRYPTION_KEY')
    if (!key || !/^[0-9a-f]{64}$/i.test(key)) missing.push('OAUTH_TOKEN_ENCRYPTION_KEY')
    if (!optionalEnv('CRON_SECRET')) missing.push('CRON_SECRET')
  }
  return missing
}
