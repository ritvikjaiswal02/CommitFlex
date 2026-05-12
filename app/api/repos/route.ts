import { auth } from '@/auth'
import { getUserRepos, createRepo } from '@/lib/db/queries/repos'
import { z } from 'zod'

const CreateRepoSchema = z.object({
  githubRepoId: z.string(),
  name: z.string().min(1),
  fullName: z.string().min(1),
  url: z.string().url(),
  defaultBranch: z.string().default('main'),
  isPrivate: z.boolean().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const repos = await getUserRepos(session.user.id)
  return Response.json({ repos })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = CreateRepoSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const repo = await createRepo({ ...parsed.data, userId: session.user.id })
  return Response.json({ repo }, { status: 201 })
}
