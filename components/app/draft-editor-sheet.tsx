'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowUpRight, GitPullRequest, Layers, RotateCw } from 'lucide-react'
import type { QueueItemView } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Kbd } from '@/components/ui/kbd'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { Callout } from '@/components/ui/callout'
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { StatusLabel } from '@/components/ui/status-node'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { PLATFORM_CHAR_LIMIT, PlatformIcon, platformLabel } from '@/components/brand/platform'
import type { QueueActions } from '@/lib/hooks/use-queue-actions'
import { DraftActions } from '@/components/app/draft-actions'
import { describeWhen, nodeStateFor, triggerLabel } from '@/components/app/queue-meta'
import { formatDayTime } from '@/components/app/format'

export interface EditorDraft {
  draftId: string
  jobId: string
  platform: PostPlatform
  content: string
  hashtags: string[]
  repoFullName: string
  sourceTitle?: string | null
  trigger?: string | null
  createdAt: string
}

export interface DraftEditorSheetProps {
  draft: EditorDraft | null
  item: QueueItemView | null
  open: boolean
  onOpenChange: (open: boolean) => void
  timezone: string
  linkedinDirect: boolean
  actions: QueueActions
  suggestions?: string[]
  onSaved?: (draftId: string, content: string) => void
  /** New versions were written for this draft (they land as unqueued drafts). */
  onVariantsCreated?: () => void
}

function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? '')
}

async function errorText(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  return typeof body.error === 'string' && body.error ? body.error : fallback
}

/** Builds an editor draft from a queue item. */
export function editorDraftFromItem(item: QueueItemView): EditorDraft {
  return {
    draftId: item.draftId,
    jobId: item.jobId,
    platform: item.platform,
    content: item.content,
    hashtags: item.hashtags,
    repoFullName: item.repoFullName,
    sourceTitle: item.sourceTitle,
    trigger: item.trigger,
    createdAt: item.createdAt,
  }
}

export function CharacterCount({ length, platform, className }: { length: number; platform: PostPlatform; className?: string }) {
  const limit = PLATFORM_CHAR_LIMIT[platform]
  const over = length > limit
  const near = !over && length > limit * 0.9
  return (
    <span
      data-state={over ? 'over' : near ? 'near' : 'ok'}
      className={cn(
        'text-xs tabular-nums',
        over ? 'font-medium text-danger' : near ? 'text-warning' : 'text-fg-subtle',
        className,
      )}
    >
      <span>{length.toLocaleString('en-US')}</span>
      <span>/{limit.toLocaleString('en-US')}</span>
      <span className="sr-only"> characters{over ? ', over the limit' : ''}</span>
    </span>
  )
}

/**
 * The draft editor. Opens from lists in a right sheet so the list keeps its
 * context. Unsaved edits must be saved before the post can be queued, since
 * the server publishes the stored text; for a draft waiting for review,
 * "Save and approve" does both in one step. Closing with unsaved edits asks
 * first, so text is never thrown away silently.
 */
export function DraftEditorSheet({
  draft,
  item,
  open,
  onOpenChange,
  timezone,
  linkedinDirect,
  actions,
  suggestions,
  onSaved,
  onVariantsCreated,
}: DraftEditorSheetProps) {
  const { handlePlanError } = useUpgrade()
  const [value, setValue] = React.useState(draft?.content ?? '')
  const [saved, setSaved] = React.useState(draft?.content ?? '')
  const [saving, setSaving] = React.useState<false | 'save' | 'approve'>(false)
  const [rewriting, setRewriting] = React.useState(false)
  const [writingVariants, setWritingVariants] = React.useState(false)
  const [confirmDiscard, setConfirmDiscard] = React.useState(false)
  const [mac, setMac] = React.useState(false)

  React.useEffect(() => setMac(isMacPlatform()), [])

  React.useEffect(() => {
    setValue(draft?.content ?? '')
    setSaved(draft?.content ?? '')
  }, [draft?.draftId, draft?.content])

  if (!draft) return null

  const limit = PLATFORM_CHAR_LIMIT[draft.platform]
  const dirty = value !== saved
  const tooLong = value.length > limit
  const empty = value.trim().length === 0
  const locked = item?.status === 'published' || item?.status === 'publishing'

  const pendingReview = item?.status === 'pending_review'
  const busy = saving !== false || rewriting || writingVariants

  /** PATCHes the text. Resolves true when it was stored. */
  const persist = async (): Promise<boolean> => {
    try {
      const res = await fetch(`/api/drafts/${draft.draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: value }),
      })
      if (!res.ok) {
        toast.error("Couldn't save your changes", { description: await errorText(res, 'Try again in a moment.') })
        return false
      }
      const body = (await res.json().catch(() => ({}))) as { backToReview?: boolean }
      setSaved(value)
      onSaved?.(draft.draftId, value)
      if (body.backToReview) {
        toast.info('Sent back for review', { description: 'Your reviewer approved the earlier text, so they get the new one to approve.' })
      }
      return true
    } catch {
      toast.error("Couldn't save your changes", { description: 'Check your connection and try again.' })
      return false
    }
  }

  const save = async () => {
    if (!dirty || tooLong || empty || busy) return
    setSaving('save')
    try {
      if (await persist()) toast.success('Saved')
    } finally {
      setSaving(false)
    }
  }

  const saveAndApprove = async () => {
    if (!dirty || tooLong || empty || busy) return
    setSaving('approve')
    try {
      if (await persist()) await actions.approve(draft.draftId)
    } finally {
      setSaving(false)
    }
  }

  const rewrite = async () => {
    if (busy || locked) return
    setRewriting(true)
    try {
      const res = await fetch(`/api/drafts/${draft.draftId}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: draft.platform, content: (value.trim() ? value : saved).slice(0, 5000) }),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      if (!res.ok) {
        toast.error("The rewrite didn't finish", { description: await errorText(res, 'Try again in a minute.') })
        return
      }
      const data = (await res.json()) as { draft?: { originalContent?: string } }
      const next = data.draft?.originalContent
      if (next) {
        setValue(next)
        setSaved(next)
        onSaved?.(draft.draftId, next)
        toast.success('Rewritten', { description: 'The new version replaced this draft.' })
      }
    } catch {
      toast.error("The rewrite didn't finish", { description: 'Check your connection and try again.' })
    } finally {
      setRewriting(false)
    }
  }

  const writeVariants = async () => {
    if (busy) return
    setWritingVariants(true)
    try {
      const res = await fetch(`/api/drafts/${draft.draftId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 3 }),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      if (!res.ok) {
        toast.error("The new versions weren't written", { description: await errorText(res, 'Try again in a minute.') })
        return
      }
      toast.success('Three new versions are ready', { description: 'Find them under Unqueued in your queue.' })
      onVariantsCreated?.()
    } catch {
      toast.error("The new versions weren't written", { description: 'Check your connection and try again.' })
    } finally {
      setWritingVariants(false)
    }
  }

  /** Closing with unsaved text asks first. */
  const requestOpenChange = (next: boolean) => {
    if (!next && dirty) {
      setConfirmDiscard(true)
      return
    }
    onOpenChange(next)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
      event.preventDefault()
      void save()
    }
  }

  const textareaId = `draft-editor-${draft.draftId}`

  return (
    <>
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent side="right" size="lg">
        <SheetHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <div className="flex items-center gap-2">
              <PlatformIcon platform={draft.platform} />
              <SheetTitle>{platformLabel(draft.platform)} post</SheetTitle>
            </div>
            {!locked && (
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={rewrite} loading={rewriting} disabled={busy && !rewriting}>
                  {!rewriting && <RotateCw strokeWidth={1.75} aria-hidden="true" />}
                  Rewrite
                </Button>
                <Button variant="ghost" size="sm" onClick={writeVariants} loading={writingVariants} disabled={busy && !writingVariants}>
                  {!writingVariants && <Layers strokeWidth={1.75} aria-hidden="true" />}
                  Variants
                </Button>
              </div>
            )}
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusLabel state={nodeStateFor(item?.status)} />
            <span className="font-mono text-xs text-fg-muted">{draft.repoFullName}</span>
            {item && <span>{describeWhen(item, timezone)}</span>}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-5">
          {draft.sourceTitle && (
            <div className="flex items-start gap-2 text-sm text-fg-muted">
              <GitPullRequest className="mt-0.5 size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />
              <p>
                {triggerLabel(draft.trigger)}: <span className="marker">{draft.sourceTitle}</span>
              </p>
            </div>
          )}

          {item?.status === 'failed' && item.lastError && (
            <Callout tone="danger" title="The last attempt failed">
              {item.lastError}
            </Callout>
          )}

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={textareaId} className="text-sm font-medium text-fg">
                Post text
              </label>
              <CharacterCount length={value.length} platform={draft.platform} />
            </div>
            <Textarea
              id={textareaId}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={onKeyDown}
              autoResize
              rows={10}
              disabled={locked}
              invalid={tooLong}
              className="min-h-[240px] text-base leading-7"
            />
            {tooLong && (
              <p className="text-sm text-danger">
                {platformLabel(draft.platform)} allows {limit.toLocaleString('en-US')} characters. Trim{' '}
                {(value.length - limit).toLocaleString('en-US')} to save.
              </p>
            )}
            {locked && <p className="text-sm text-fg-muted">Published posts can&rsquo;t be edited here.</p>}
          </div>

          {draft.hashtags.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-fg">Hashtags</span>
              <div className="flex flex-wrap gap-1.5">
                {draft.hashtags.map((tag) => (
                  <Badge key={tag} variant="neutral" size="md">
                    {tag.startsWith('#') ? tag : `#${tag}`}
                  </Badge>
                ))}
              </div>
              {draft.platform === 'twitter' && (
                <p className="text-xs text-fg-subtle">Hashtags are dropped first when the post would pass 280 characters.</p>
              )}
            </div>
          )}

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
            <dt className="text-fg-muted">Drafted</dt>
            <dd className="text-fg">{formatDayTime(draft.createdAt, timezone)}</dd>
            {item?.scheduledFor && (
              <>
                <dt className="text-fg-muted">Slot</dt>
                <dd className="text-fg">{formatDayTime(item.scheduledFor, timezone)}</dd>
              </>
            )}
            {item?.publishedAt && (
              <>
                <dt className="text-fg-muted">Published</dt>
                <dd className="text-fg">{formatDayTime(item.publishedAt, timezone)}</dd>
              </>
            )}
            <dt className="text-fg-muted">Source</dt>
            <dd>
              <Link
                href={`/jobs/${draft.jobId}`}
                className="inline-flex items-center gap-1 rounded-sm text-accent hover:underline focus-ring-surface"
              >
                All drafts from this run
                <ArrowUpRight className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
              </Link>
            </dd>
          </dl>
        </SheetBody>
        <SheetFooter className="sm:justify-between">
          {dirty ? (
            <>
              <span className="text-sm text-fg-muted">Unsaved changes</span>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button variant="ghost" onClick={() => setValue(saved)} disabled={busy}>
                  Discard
                </Button>
                {pendingReview ? (
                  <>
                    <Button variant="secondary" onClick={save} loading={saving === 'save'} disabled={tooLong || empty || busy}>
                      Save
                    </Button>
                    <Button onClick={saveAndApprove} loading={saving === 'approve'} disabled={tooLong || empty || busy}>
                      Save and approve
                    </Button>
                  </>
                ) : (
                  <Button onClick={save} loading={saving === 'save'} disabled={tooLong || empty || busy}>
                    Save changes
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <span className="hidden items-center gap-1 text-sm text-fg-subtle sm:inline-flex">
                Save with <Kbd>{mac ? '\u2318' : 'Ctrl'}</Kbd>
                <Kbd>S</Kbd>
              </span>
              <DraftActions
                draft={{ draftId: draft.draftId, platform: draft.platform, content: saved, hashtags: draft.hashtags }}
                item={item}
                actions={actions}
                timezone={timezone}
                linkedinDirect={linkedinDirect}
                suggestions={suggestions}
                size="md"
              />
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
          <AlertDialogDescription>The edits you made to this post haven&rsquo;t been saved.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            onClick={() => {
              setValue(saved)
              onOpenChange(false)
            }}
          >
            Discard
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
