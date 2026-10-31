import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit does not load Next.js env files. `generate` needs no database,
// but `studio` and `push` do, so read .env.local the same way scripts/migrate.ts does.
config({ path: '.env.local' })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  verbose: true,
})
