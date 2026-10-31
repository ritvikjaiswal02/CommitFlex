import type { Metadata } from 'next'
import { Logo } from '@/components/brand/logo'
import { PlatformIcon, platformLabel } from '@/components/brand/platform'
import { Button, ButtonLink } from '@/components/ui/button'
import { StatusNode, type NodeState } from '@/components/ui/status-node'
import { LocalTime } from '@/components/app/local-time'
import { isApprovalAction, resolveApprovalToken, type ApprovalAction } from '@/lib/autopilot/approval'
import { getDraft } from '@/lib/db/queries/drafts'
import { draftContent, draftHashtags } from '@/lib/db/queries/autopilot'
import { composePostText } from '@/lib/publish/intents'

export const metadata: Metadata = {
  title: 'Approval',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export const dynamic = 'force-dynamic'

type ApprovalStatus = 'approved' | 'already' | 'expired' | 'invalid' | 'skipped' | 'posted' | 'limit' | 'busy'

const STATUSES: readonly ApprovalStatus[] = ['approved', 'already', 'expired', 'invalid', 'skipped', 'posted', 'limit', 'busy']

function readStatus(value: string | undefined): ApprovalStatus {
  return STATUSES.includes(value as ApprovalStatus) ? (value as ApprovalStatus) : 'invalid'
}

function readPlatform(value: string | undefined): 'linkedin' | 'twitter' | null {
  return value === 'linkedin' || value === 'twitter' ? value : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const COPY: Record<ApprovalStatus, { node: NodeState; title: string; body: string }> = {
  approved: {
    node: 'scheduled',
    title: 'Approved',
    body: 'The post is scheduled. You can close this tab, or open it in your queue to change the time or the text.',
  },
  already: {
    node: 'approved',
    title: 'Already done',
    body: 'This draft was handled before, so nothing changed. Your queue shows where it stands.',
  },
  expired: {
    node: 'skipped',
    title: 'This approval link expired',
    body: 'Approval links work for 7 days. Open your queue to approve the draft from there.',
  },
  invalid: {
    node: 'failed',
    title: "This approval link doesn't work",
    body: 'It may have been copied incompletely, or it belongs to a different action. Open your queue to see the draft.',
  },
  skipped: {
    node: 'skipped',
    title: 'Skipped',
    body: "This draft won't be posted. You can still find it in your queue under Failed and skipped.",
  },
  posted: {
    node: 'published',
    title: 'Marked as posted',
    body: 'Thanks. CommitFlex counts it as published and keeps it out of your queue.',
  },
  limit: {
    node: 'pending_review',
    title: 'Your queue is full on your plan',
    body: 'The draft is still waiting for review. Publish or skip something in your queue, or upgrade to queue more posts.',
  },
  busy: {
    node: 'publishing',
    title: 'This post is going out right now',
    body: 'CommitFlex is publishing it at this moment, so nothing was changed. Check your queue in a minute.',
  },
}

const CONFIRM: Record<ApprovalAction, { title: string; body: string }> = {
  approve: {
    title: 'Approve this post?',
    body: 'Read it once more. Approving locks in this exact text for the time shown.',
  },
  skip: {
    title: 'Skip this draft?',
    body: "It won't be posted. You can still find it in your queue later.",
  },
  posted: {
    title: 'Did you post this?',
    body: 'Confirm and CommitFlex counts it as published and stops reminding you.',
  },
}

function actionLabel(action: ApprovalAction, platform: 'linkedin' | 'twitter' | null): string {
  if (action === 'skip') return 'Skip this draft'
  if (action === 'posted') return 'Yes, I posted it'
  return platform ? `Approve for ${platformLabel(platform)}` : 'Approve'
}

interface PostPreview {
  draftId: string
  platform: 'linkedin' | 'twitter'
  text: string
  scheduledFor: string | null
}

/**
 * Reads the post a token points at. Holding the token is what grants access,
 * which is the same thing the email itself grants, so nothing extra leaks.
 */
async function loadPreview(token: string | undefined): Promise<
  | { kind: 'ok'; post: PostPreview; actions: ApprovalAction[] }
  | { kind: 'spent'; post: PostPreview | null }
  | { kind: 'none' }
> {
  if (!token) return { kind: 'none' }
  try {
    const resolved = await resolveApprovalToken(token)
    if (resolved.status === 'invalid' || resolved.status === 'expired' || !resolved.item) return { kind: 'none' }
    const draft = await getDraft(resolved.item.draftId)
    const platform = resolved.item.platform === 'twitter' ? 'twitter' : 'linkedin'
    const post: PostPreview | null = draft
      ? {
          draftId: draft.id,
          platform,
          text: composePostText(draftContent(draft), draftHashtags(draft.platformMetadata), platform),
          scheduledFor: resolved.item.scheduledFor ? resolved.item.scheduledFor.toISOString() : null,
        }
      : null
    if (resolved.status === 'used') return { kind: 'spent', post }
    if (!post) return { kind: 'none' }
    return { kind: 'ok', post, actions: resolved.actions }
  } catch (err) {
    console.error('[queue/approved] preview failed', err)
    return { kind: 'none' }
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex h-14 items-center px-4 sm:px-6">
        <Logo href="/" />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-10 sm:items-center sm:pt-0">
        <section
          aria-labelledby="approval-title"
          className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-xs sm:p-8"
        >
          {children}
        </section>
      </main>
    </div>
  )
}

function PostText({ post }: { post: PostPreview }) {
  return (
    <figure className="mt-5">
      <figcaption className="sr-only">The post</figcaption>
      <div className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-canvas p-4 text-sm leading-6 text-fg">
        {post.text}
      </div>
    </figure>
  )
}

/**
 * Where approval links from emails land. `GET /api/drafts/approve` sends the
 * browser here with `preview=1` to confirm (nothing has changed yet); the
 * form POSTs back and the result comes here again with `status`. Public: the
 * token, not a session, is the credential.
 */
export default async function ApprovalResultPage({
  searchParams,
}: {
  searchParams: { status?: string; draft?: string; platform?: string; at?: string; token?: string; action?: string; preview?: string }
}) {
  const token = typeof searchParams.token === 'string' ? searchParams.token : undefined

  /* ─── Confirmation step ─────────────────────────────────────────────── */
  if (searchParams.preview === '1') {
    const action: ApprovalAction = isApprovalAction(searchParams.action) ? searchParams.action : 'approve'
    const preview = await loadPreview(token)
    if (preview.kind === 'ok' && preview.actions.includes(action)) {
      const { post } = preview
      const copy = CONFIRM[action]
      return (
        <Shell>
          <div className="flex items-center gap-3">
            <StatusNode state={action === 'skip' ? 'skipped' : action === 'posted' ? 'ready' : 'pending_review'} />
            <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
              <PlatformIcon platform={post.platform} className="size-3.5" />
              {platformLabel(post.platform)} post
            </span>
          </div>
          <h1 id="approval-title" className="mt-4 text-2xl font-semibold text-fg">
            {copy.title}
          </h1>
          <p className="mt-2 text-base text-fg-muted">{copy.body}</p>
          {action === 'approve' && post.scheduledFor && (
            <p className="mt-2 text-sm text-fg">
              Goes out <LocalTime iso={post.scheduledFor} />.
            </p>
          )}
          <PostText post={post} />
          <form method="post" action="/api/drafts/approve" className="mt-6 flex flex-wrap items-center gap-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="action" value={action} />
            <Button type="submit" variant={action === 'skip' ? 'secondary' : 'primary'}>
              {actionLabel(action, post.platform)}
            </Button>
            <ButtonLink href={`/queue?draft=${post.draftId}`} variant="ghost">
              Edit in queue first
            </ButtonLink>
          </form>
        </Shell>
      )
    }
    if (preview.kind === 'spent') {
      return <Result status="already" post={preview.post} />
    }
    return <Result status="invalid" post={null} />
  }

  /* ─── Result step ───────────────────────────────────────────────────── */
  const status = readStatus(searchParams.status)
  const preview = token ? await loadPreview(token) : { kind: 'none' as const }
  const post = preview.kind === 'none' ? null : preview.post
  return (
    <Result
      status={status}
      post={post}
      platform={readPlatform(searchParams.platform)}
      draftId={searchParams.draft && UUID.test(searchParams.draft) ? searchParams.draft : null}
      at={searchParams.at && !Number.isNaN(Date.parse(searchParams.at)) ? searchParams.at : null}
    />
  )
}

function Result({
  status,
  post,
  platform: platformParam = null,
  draftId: draftParam = null,
  at: atParam = null,
}: {
  status: ApprovalStatus
  post: PostPreview | null
  platform?: 'linkedin' | 'twitter' | null
  draftId?: string | null
  at?: string | null
}) {
  const copy = COPY[status]
  const platform = post?.platform ?? platformParam
  const draftId = post?.draftId ?? draftParam
  const at = atParam ?? post?.scheduledFor ?? null
  const queueHref = draftId ? `/queue?draft=${draftId}` : '/queue'
  const settled = status === 'approved' || status === 'already'
  const showTime = settled && at

  return (
    <Shell>
      <div className="flex items-center gap-3">
        <StatusNode state={copy.node} />
        {platform && (
          <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
            <PlatformIcon platform={platform} className="size-3.5" />
            {platformLabel(platform)} post
          </span>
        )}
      </div>
      {post && (status === 'approved' || status === 'already' || status === 'posted') && <PostText post={post} />}
      <h1 id="approval-title" className="mt-5 text-2xl font-semibold text-fg">
        {copy.title}
      </h1>
      {showTime && (
        <p className="mt-2 text-base text-fg">
          Goes out <LocalTime iso={at} />.
        </p>
      )}
      <p className="mt-2 text-base text-fg-muted">{copy.body}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <ButtonLink href={queueHref} variant="primary">
          {draftId ? 'Open in queue' : 'Open queue'}
        </ButtonLink>
        {settled && draftId && (
          <ButtonLink href={`/queue?draft=${draftId}&schedule=1`} variant="ghost">
            Change the time
          </ButtonLink>
        )}
        {status === 'limit' && (
          <ButtonLink href="/billing" variant="ghost">
            See plans
          </ButtonLink>
        )}
      </div>
    </Shell>
  )
}
