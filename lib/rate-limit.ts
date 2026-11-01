/**
 * Rate limits shared across serverless instances.
 *
 * Counters live in Postgres (`rate_limit_buckets`, one fixed window per key,
 * advanced with a single atomic upsert), so a burst spread over many
 * instances or cold starts is still counted once. When DATABASE_URL is not
 * set (tests, local tinkering) or the database is unreachable, it falls back
 * to an in-memory window so a limiter problem never takes a route down.
 */
import { sql } from 'drizzle-orm'

interface RateLimitEntry {
  count: number
  resetAt: number
}

export interface RateLimitConfig {
  windowMs: number
  max: number
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 5 minutes. unref() so the timer never keeps
// a serverless function or a test process alive.
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now()
    store.forEach((entry, key) => {
      if (entry.resetAt < now) store.delete(key)
    })
  }, 300_000)
  ;(timer as { unref?: () => void }).unref?.()
}

/** In-memory fixed window. Per instance only; used as the fallback. */
export function checkMemoryRateLimit(key: string, config: RateLimitConfig, now = Date.now()): RateLimitResult {
  const entry = store.get(key)

  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + config.windowMs })
    return { allowed: true, remaining: config.max - 1, resetAt: now + config.windowMs }
  }

  entry.count++
  const remaining = Math.max(0, config.max - entry.count)
  return {
    allowed: entry.count <= config.max,
    remaining,
    resetAt: entry.resetAt,
  }
}

/** Test hook: clears the in-memory windows. */
export function resetMemoryRateLimits(): void {
  store.clear()
}

function sharedStoreEnabled(): boolean {
  return !!process.env.DATABASE_URL && !process.env.VITEST && process.env.RATE_LIMIT_STORE !== 'memory'
}

async function checkSharedRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const { db } = await import('@/lib/db/client')
  const windowSeconds = Math.max(1, Math.ceil(config.windowMs / 1000))
  const safeKey = key.slice(0, 200)
  const rows = (await db.execute(sql`
    insert into rate_limit_buckets (key, count, reset_at)
    values (${safeKey}, 1, now() + make_interval(secs => ${windowSeconds}))
    on conflict (key) do update set
      count = case when rate_limit_buckets.reset_at <= now() then 1 else rate_limit_buckets.count + 1 end,
      reset_at = case when rate_limit_buckets.reset_at <= now() then excluded.reset_at else rate_limit_buckets.reset_at end
    returning count, reset_at
  `)) as unknown as { count: number | string; reset_at: Date | string }[]
  const row = rows[0]
  const count = Number(row?.count ?? 1)
  const resetAt = row?.reset_at ? new Date(row.reset_at).getTime() : Date.now() + config.windowMs

  // Opportunistic cleanup, roughly once per 200 calls.
  if (Math.random() < 0.005) {
    db.execute(sql`delete from rate_limit_buckets where reset_at < now() - interval '1 hour'`).catch(() => {})
  }

  return { allowed: count <= config.max, remaining: Math.max(0, config.max - count), resetAt }
}

/**
 * Counts one request against `key` and says whether it is allowed. Async
 * because the counter is shared; always `await` it.
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  if (!sharedStoreEnabled()) return checkMemoryRateLimit(key, config)
  try {
    return await checkSharedRateLimit(key, config)
  } catch (err) {
    console.error('[rate-limit] shared store failed, using memory', err)
    return checkMemoryRateLimit(key, config)
  }
}

export function rateLimitResponse(resetAt: number) {
  return Response.json(
    { error: 'Too many requests. Try again in a few minutes.', code: 'rate_limited' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))),
        'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000)),
      },
    }
  )
}
