import { auth } from '@/auth'
import { replaceDraft } from '@/lib/db/queries/drafts'
import { requireDraftOwner, ownershipErrorToResponse } from '@/lib/auth/require-owner'
import { ReplaceDraftSchema } from '@/lib/validators/posts'
import { getNarrativeByJob } from '@/lib/db/queries/narratives'
import { getVoiceSettings } from '@/lib/db/queries/voice'
import { generatePost } from '@/lib/ai/posts'
import type { Narrative } from '@/types/ai'
import type { VoiceSettings } from '@/types/jobs'

export async function POST(req: Request, { params }: { params: { draftId: string } }) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const existing = await requireDraftOwner(params.draftId, session.user.id)

    const body = await req.json().catch(() => null)
    const parsed = ReplaceDraftSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: parsed.error.flatten() }, { status: 400 })

    const platform = parsed.data.platform as 'linkedin' | 'twitter'

    const narrativeRow = await getNarrativeByJob(existing.jobId)
    if (!narrativeRow) {
      return Response.json({ error: 'Narrative not found for job; cannot regenerate' }, { status: 404 })
    }

    const voice: VoiceSettings = (await getVoiceSettings(session.user.id)) ?? {
      tone: 'professional',
      technicalLevel: 7,
      audience: 'developers',
    }

    const narrative: Narrative = {
      theme: narrativeRow.angle,
      story: narrativeRow.story,
      keyPoints: narrativeRow.keyInsights,
      technicalDepth: Number(narrativeRow.targetAudience) || 7,
    }

    const generated = await generatePost(platform, narrative, voice)

    const draft = await replaceDraft(params.draftId, existing.jobId, session.user.id, {
      platform,
      content: generated.post.content,
      hashtags: generated.post.hashtags,
    })

    return Response.json({ draft }, { status: 201 })
  } catch (err) {
    const res = ownershipErrorToResponse(err)
    if (res) return res
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
