import { config } from 'dotenv'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

// Load .env.local (Next.js loads this automatically, but tsx scripts don't)
config({ path: '.env.local' })

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is required')

  const client = postgres(url, { ssl: 'require', max: 1 })
  const db = drizzle(client)

  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations applied successfully')
  await client.end()
}

main().catch(err => { console.error(err); process.exit(1) })
