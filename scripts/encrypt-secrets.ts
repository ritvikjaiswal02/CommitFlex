/**
 * One-off backfill: encrypts GitHub OAuth tokens (accounts.access_token,
 * refresh_token) and per-repo webhook secrets (repos.webhook_secret) that
 * were stored in plaintext before OAUTH_TOKEN_ENCRYPTION_KEY was used for
 * them. Idempotent: values already sealed (prefix "enc:v1:") are skipped.
 *
 *   pnpm db:encrypt-secrets            # encrypts in place
 *   pnpm db:encrypt-secrets --dry-run  # counts what would change
 */
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local' })

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')
  // Import after dotenv so the key is in the environment.
  const { isEncryptionConfigured, isSealed, sealSecret } = await import('../lib/auth/encrypt')
  if (!isEncryptionConfigured()) throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be set (64 hex characters)')
  const dryRun = process.argv.includes('--dry-run')

  const local = /localhost|127\.0\.0\.1/.test(url)
  const sql = postgres(url, { ssl: local ? false : 'require', max: 1 })
  try {
    const accounts = await sql<{ provider: string; providerAccountId: string; access_token: string | null; refresh_token: string | null }[]>`
      select provider, "providerAccountId", access_token, refresh_token from accounts where provider = 'github'
    `
    let accountUpdates = 0
    for (const row of accounts) {
      const access = row.access_token && !isSealed(row.access_token) ? sealSecret(row.access_token) : row.access_token
      const refresh = row.refresh_token && !isSealed(row.refresh_token) ? sealSecret(row.refresh_token) : row.refresh_token
      if (access === row.access_token && refresh === row.refresh_token) continue
      accountUpdates++
      if (!dryRun) {
        await sql`
          update accounts set access_token = ${access}, refresh_token = ${refresh}
          where provider = ${row.provider} and "providerAccountId" = ${row.providerAccountId}
        `
      }
    }

    const repos = await sql<{ id: string; webhook_secret: string }[]>`
      select id, webhook_secret from repos where webhook_secret is not null
    `
    let repoUpdates = 0
    for (const row of repos) {
      if (isSealed(row.webhook_secret)) continue
      repoUpdates++
      if (!dryRun) await sql`update repos set webhook_secret = ${sealSecret(row.webhook_secret)} where id = ${row.id}`
    }

    console.log(
      `${dryRun ? 'Would encrypt' : 'Encrypted'} ${accountUpdates} GitHub account token row(s) and ${repoUpdates} webhook secret(s).`,
    )
  } finally {
    await sql.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
