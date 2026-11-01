'use client'

import * as React from 'react'
import { Check, ChevronDown, Copy, Layers, Lock, RefreshCw, Save } from 'lucide-react'
import type { QueueItemView } from '@/types/autopilot'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Slider } from '@/components/ui/slider'
import { StatusLabel } from '@/components/ui/status-node'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { PLATFORM_CHAR_LIMIT, PlatformIcon, platformLabel } from '@/components/brand/platform'
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { useQueueActions } from '@/lib/hooks/use-queue-actions'
import { DraftActions } from '@/components/app/draft-actions'
import { CharacterCount } from '@/components/app/draft-editor-sheet'
import { describeWhen, nodeStateFor } from '@/components/app/queue-meta'

export interface PostCardVariant {
  id: string
  content: string
  hashtags: string[]
  status: string
  sequenceNumber: number
}

export interface PostCardProps {
  /** Single-draft form (used when `variants` is not given). */
  draftId?: string
  content?: string
  hashtags?: string[]
  status?: string
  /** Every version of this platform's post; takes precedence over the single fields. */
  variants?: PostCardVariant[]
  platform: 'linkedin' | 'twitter'
  onCopied?: () => void
  onVariantsCreated?: () => void
  /** Queue state per draft id (null when the draft isn't queued). */
  queueByDraft?: Record<string, QueueItemView | null | undefined>
  onQueueItem?: (item: QueueItemView) => void
  timezone?: string
  linkedinDirect?: boolean
  /** Plan includes `drafts.variants`. When false the control shows a Pro lock. */
  canUseVariants?: boolean
  suggestions?: string[]
  className?: string
}

const DIALS = [
  { key: 'technical', label: 'Technical depth' },
  { key: 'engagement', label: 'Hook strength' },
  { key: 'creativity', label: 'Creative range' },
] as const

type DialKey = (typeof DIALS)[number]['key']

function normalizeVariants(props: PostCardProps): PostCardVariant[] {
  if (props.variants && props.variants.length > 0) return props.variants
  return [
    {
      id: props.draftId ?? '',
      content: props.content ?? '',
      hashtags: props.hashtags ?? [],
      status: props.status ?? 'generated',
      sequenceNumber: 1,
    },
  ]
}

async function readError(res: Response): Promise<string | null> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown }
  if (typeof body.error === 'string') return body.error
  const err = body.error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> } | undefined
  return err?.formErrors?.[0] ?? Object.values(err?.fieldErrors ?? {}).flat()[0] ?? null
}

/**
 * One platform's post from a run: edit it, switch between versions, write
 * more versions, copy it, and move it through the queue.
 */
export function PostCard(props: PostCardProps) {
  const {
    platform,
    onCopied,
    onVariantsCreated,
    queueByDraft,
    onQueueItem,
    timezone = 'UTC',
    linkedinDirect = false,
    canUseVariants = true,
    suggestions,
    className,
  } = props
  const { handlePlanError, openUpgrade } = useUpgrade()
  const limit = PLATFORM_CHAR_LIMIT[platform]
  const label = platformLabel(platform)

  const incoming = normalizeVariants(props)
  const incomingKey = incoming.map((v) => `${v.id}:${v.content}:${v.status}`).join('|')
  const [variants, setVariants] = React.useState<PostCardVariant[]>(incoming)
  const [activeIdx, setActiveIdx] = React.useState(0)

  React.useEffect(() => {
    setVariants(incoming)
    setActiveIdx((i) => Math.min(i, incoming.length - 1))
    // incomingKey captures every field the card renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomingKey])

  const active = variants[Math.min(activeIdx, variants.length - 1)]
  const [content, setContent] = React.useState(active.content)
  const [savedContent, setSavedContent] = React.useState(active.content)
  const [saving, setSaving] = React.useState(false)
  const [justSaved, setJustSaved] = React.useState(false)
  const [copying, setCopying] = React.useState(false)
  const [copied, setCopied] = React.useState(active.status === 'copied')
  const [regenerating, setRegenerating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [tuneOpen, setTuneOpen] = React.useState(false)
  const [dials, setDials] = React.useState<Record<DialKey, number>>({ technical: 50, engagement: 50, creativity: 50 })
  const [writingVersions, setWritingVersions] = React.useState(false)

  // Switching versions loads that version into the editor.
  React.useEffect(() => {
    setContent(active.content)
    setSavedContent(active.content)
    setCopied(active.status === 'copied')
    setJustSaved(false)
    setError(null)
    // Only on version change; content updates are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.id])

  // New text from outside (a refresh or a rewrite) replaces the editor unless
  // it is what we just saved.
  const savedRef = React.useRef(savedContent)
  savedRef.current = savedContent
  React.useEffect(() => {
    if (active.content !== savedRef.current) {
      setContent(active.content)
      setSavedContent(active.content)
    }
    if (active.status === 'copied') setCopied(true)
  }, [active.content, active.status])

  const actions = useQueueActions({ timezone, linkedinDirect, onItem: onQueueItem })
  const queueItem = active.id ? queueByDraft?.[active.id] ?? null : null

  const overLimit = content.length > limit
  const dirty = content !== savedContent
  const fullText = active.hashtags.length > 0 ? `${content}\n\n${active.hashtags.join(' ')}` : content
  const busy = regenerating || writingVersions
  const locked = queueItem?.status === 'published' || queueItem?.status === 'publishing'

  const save = async () => {
    if (!active.id || overLimit || !dirty) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) throw new Error((await readError(res)) ?? 'Failed to save')
      setSavedContent(content)
      setVariants((prev) => prev.map((v) => (v.id === active.id ? { ...v, content } : v)))
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    setCopying(true)
    setError(null)
    try {
      await navigator.clipboard.writeText(fullText)
      if (active.id) await fetch(`/api/drafts/${active.id}`, { method: 'POST' })
      setCopied(true)
      onCopied?.()
    } catch {
      setError('Failed to copy. Select the text and copy it manually.')
    } finally {
      setCopying(false)
    }
  }

  const regenerate = async () => {
    if (!active.id) return
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${active.id}/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, content }),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      if (!res.ok) throw new Error((await readError(res)) ?? 'Rewrite failed')
      const data = (await res.json()) as { draft?: { originalContent?: string; platformMetadata?: { hashtags?: string[] } } }
      const next = data.draft?.originalContent
      if (next) {
        setContent(next)
        setSavedContent(next)
        setVariants((prev) =>
          prev.map((v) =>
            v.id === active.id
              ? { ...v, content: next, hashtags: data.draft?.platformMetadata?.hashtags ?? v.hashtags, status: 'generated' }
              : v,
          ),
        )
        toast.success('Rewritten', { description: 'The new version replaced this draft.' })
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Rewrite failed')
    } finally {
      setRegenerating(false)
    }
  }

  const writeVersions = async () => {
    if (!canUseVariants) {
      openUpgrade({ code: 'feature_locked', feature: 'drafts.variants' }, 'pro')
      return
    }
    if (!active.id) return
    setWritingVersions(true)
    setError(null)
    try {
      const res = await fetch(`/api/drafts/${active.id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dials, count: 3 }),
      })
      if (res.status === 402 && (await handlePlanError(res))) return
      if (!res.ok) throw new Error((await readError(res)) ?? "Couldn't write new versions")
      toast.success('Three new versions are ready', { description: 'Switch between them above the text.' })
      setTuneOpen(false)
      onVariantsCreated?.()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Couldn't write new versions")
    } finally {
      setWritingVersions(false)
    }
  }

  const textareaId = `post-${platform}-${active.id || 'new'}`

  return (
    <article
      aria-label={`${label} post`}
      aria-busy={busy || undefined}
      className={cn('flex h-full flex-col rounded-lg border border-line bg-surface', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <PlatformIcon platform={platform} />
          <h3 className="text-base font-semibold text-fg">{label} post</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {copied && (
            <Badge variant="success">
              <Check aria-hidden="true" strokeWidth={2.5} />
              Copied
            </Badge>
          )}
          <StatusLabel state={nodeStateFor(queueItem?.status)} />
        </div>
      </header>

      {variants.length > 1 && (
        <div className="border-b border-line px-4 py-2.5 sm:px-5">
          <SegmentedControl
            aria-label={`${label} versions`}
            size="sm"
            value={active.id}
            onValueChange={(id) => setActiveIdx(Math.max(0, variants.findIndex((v) => v.id === id)))}
            options={variants.map((v) => ({ value: v.id, label: `Version ${v.sequenceNumber}` }))}
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 px-4 py-4 sm:px-5">
        <label htmlFor={textareaId} className="sr-only">
          {label} post text
        </label>
        <Textarea
          id={textareaId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
              e.preventDefault()
              void save()
            }
          }}
          autoResize
          rows={8}
          disabled={locked || busy}
          invalid={overLimit}
          placeholder={`Write your ${label} post`}
          className={cn('min-h-[200px] text-base leading-7', busy && 'animate-pulse-soft')}
        />

        {active.hashtags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Hashtags">
            {active.hashtags.map((tag) => (
              <li key={tag}>
                <Badge variant="neutral">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <CharacterCount length={content.length} platform={platform} />
          <span className="text-xs text-fg-subtle" aria-live="polite">
            {justSaved ? 'Saved' : dirty ? 'Unsaved changes' : queueItem ? describeWhen(queueItem, timezone) : ''}
          </span>
        </div>

        {overLimit && (
          <p className="text-sm text-danger">
            {label} allows {limit.toLocaleString('en-US')} characters. Trim {(content.length - limit).toLocaleString('en-US')} to save.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>

      <div className="border-t border-line">
        <button
          type="button"
          onClick={() => setTuneOpen((o) => !o)}
          aria-expanded={tuneOpen}
          aria-controls={`${textareaId}-versions`}
          className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium text-fg-muted transition-colors duration-120 hover:text-fg focus-ring-inset sm:px-5"
        >
          <span className="inline-flex items-center gap-2">
            <Layers className="size-4" strokeWidth={1.75} aria-hidden="true" />
            Write more versions
            {!canUseVariants && <Badge variant="accent">Pro</Badge>}
          </span>
          <ChevronDown
            className={cn('size-4 transition-transform duration-180 ease-out', tuneOpen && 'rotate-180')}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
        {tuneOpen && (
          <div id={`${textareaId}-versions`} className="flex flex-col gap-4 px-4 pb-4 sm:px-5">
            <p className="text-sm text-fg-muted">Adjust the direction, then CommitFlex writes three alternatives from the same work.</p>
            {DIALS.map((dial) => (
              <div key={dial.key} className="grid grid-cols-[120px_1fr_32px] items-center gap-3">
                <span className="text-sm text-fg-muted">{dial.label}</span>
                <Slider
                  aria-label={dial.label}
                  value={dials[dial.key]}
                  onValueChange={(v) => setDials((d) => ({ ...d, [dial.key]: v }))}
                  disabled={writingVersions || !canUseVariants}
                />
                <span className="text-right text-sm tabular-nums text-fg">{dials[dial.key]}</span>
              </div>
            ))}
            <Button
              variant="secondary"
              onClick={writeVersions}
              loading={writingVersions}
              disabled={!active.id}
              className="self-start"
            >
              {!canUseVariants && <Lock strokeWidth={1.75} aria-hidden="true" />}
              {writingVersions ? 'Writing 3 versions' : 'Write 3 versions'}
            </Button>
          </div>
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={save}
            loading={saving}
            disabled={saving || overLimit || !active.id || !dirty}
          >
            {justSaved ? <Check strokeWidth={2} aria-hidden="true" /> : <Save strokeWidth={1.75} aria-hidden="true" />}
            {justSaved ? 'Saved' : 'Save'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={copy}
            loading={copying}
            disabled={copying || overLimit}
          >
            <Copy strokeWidth={1.75} aria-hidden="true" />
            Copy post
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={regenerate}
            disabled={regenerating || !active.id || locked}
            title="Regenerate"
            aria-label="Rewrite this draft"
          >
            <RefreshCw strokeWidth={1.75} aria-hidden="true" className={cn(regenerating && 'motion-safe:animate-node-spin')} />
          </Button>
        </div>
        {active.id && (
          dirty ? (
            <span className="text-sm text-fg-muted">Save your edits to queue this post.</span>
          ) : (
            <DraftActions
              draft={{ draftId: active.id, platform, content: savedContent, hashtags: active.hashtags }}
              item={queueItem}
              actions={actions}
              timezone={timezone}
              linkedinDirect={linkedinDirect}
              suggestions={suggestions}
            />
          )
        )}
      </footer>
    </article>
  )
}
