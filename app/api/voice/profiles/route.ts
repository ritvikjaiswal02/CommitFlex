import { auth } from '@/auth'
import { z } from 'zod'
import { listVoiceProfiles, createVoiceProfile } from '@/lib/db/queries/voice'

const CreateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name required').max(60),
  tone: z.string().min(1).max(50),
  technicalLevel: z.number().int().min(1).max(10),
  audience: z.string().min(1).max(100),
  extraContext: z.string().max(2000).optional().default(''),
  makeDefault: z.boolean().optional().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const profiles = await listVoiceProfiles(session.user.id)
  return Response.json({ profiles })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const parsed = CreateProfileSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

  const profile = await createVoiceProfile(session.user.id, parsed.data)
  return Response.json({ profile }, { status: 201 })
}
