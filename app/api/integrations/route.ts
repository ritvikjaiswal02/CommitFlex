import { auth } from '@/auth'
import { isConfigured } from '@/lib/env'
import { getGithubAccount, getLinkedInConnectionSummary } from '@/lib/db/queries/integrations'
import { createOctokit } from '@/lib/github/client'
import { unauthorized } from '@/lib/validators/http'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorized()

  const [linkedin, github] = await Promise.all([getLinkedInConnectionSummary(userId), getGithubAccount(userId)])

  let login: string | null = null
  if (github?.accessToken) {
    try {
      const { data } = await createOctokit(github.accessToken).users.getAuthenticated()
      login = data.login
    } catch {
      login = null
    }
  }

  return Response.json({
    linkedin,
    linkedinAvailable: isConfigured('linkedin'),
    github: {
      login,
      scopes: github?.scope ? github.scope.split(/[ ,]+/).filter(Boolean) : [],
    },
  })
}
