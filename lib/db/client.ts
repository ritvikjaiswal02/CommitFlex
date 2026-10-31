import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

// postgres() connects lazily, so importing this module during `next build`
// never opens a connection. A placeholder URL keeps imports working when
// DATABASE_URL is unset (tests, static analysis).
const url = process.env.DATABASE_URL || 'postgresql://user:password@host.neon.tech/db'

function isLocal(connection: string): boolean {
  try {
    const host = new URL(connection).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')
  } catch {
    return false
  }
}

function createClient() {
  return postgres(url, {
    ssl: isLocal(url) ? false : 'require',
    // Serverless functions each hold their own pool; keep it small so a burst
    // of invocations doesn't exhaust the database's connection limit.
    max: process.env.NODE_ENV === 'production' ? 5 : 10,
    idle_timeout: 20,
  })
}

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { __commitflexSql?: ReturnType<typeof postgres> }
const client = globalForDb.__commitflexSql ?? createClient()
if (process.env.NODE_ENV !== 'production') globalForDb.__commitflexSql = client

export const db = drizzle(client, { schema })
export type DB = typeof db
