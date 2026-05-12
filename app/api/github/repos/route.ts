import { auth } from '@/auth'
import { db } from '@/lib/db/client'
import { accounts } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { createOctokit } from '@/lib/github/client'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, session.user.id), eq(accounts.provider, 'github')))
    .limit(1)

  if (!account?.access_token) {
    return Response.json({ error: 'No GitHub account connected' }, { status: 400 })
  }

  const token = account.access_token
  const octokit = createOctokit(token)

  const { data } = await octokit.repos.listForAuthenticatedUser({
    sort: 'updated',
    per_page: 100,
    type: 'owner',
  })

  const repos = data.map(r => ({
    githubRepoId: String(r.id),
    name: r.name,
    fullName: r.full_name,
    url: r.html_url,
    defaultBranch: r.default_branch,
    isPrivate: r.private,
    description: r.description,
    language: r.language,
    updatedAt: r.updated_at,
  }))

  return Response.json({ repos })
}
