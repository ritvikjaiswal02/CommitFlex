'use client'

import * as React from 'react'
import {
  CalendarClock,
  CalendarPlus,
  CalendarX2,
  Check,
  CircleCheck,
  Copy,
  ExternalLink,
  MoreHorizontal,
  PencilLine,
  RotateCw,
  Send,
  SkipForward,
} from 'lucide-react'
import type { QueueItemView } from '@/types/autopilot'
import type { PostPlatform } from '@/types/posts'
import { cn } from '@/lib/utils'
import { Button, ButtonLink } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { PlatformIcon } from '@/components/brand/platform'
import { composePostText } from '@/lib/publish/intents'
import type { QueueActions } from '@/lib/hooks/use-queue-actions'
import { ScheduleDialog } from '@/components/app/schedule-dialog'
import { METHOD_LABELS, publishLabel } from '@/components/app/queue-meta'

export interface DraftActionsDraft {
  draftId: string
  platform: PostPlatform
  content: string
  hashtags: string[]
}

export interface DraftActionsProps {
  draft: DraftActionsDraft
  item: QueueItemView | null
  actions: QueueActions
  timezone: string
  linkedinDirect: boolean
  /** Upcoming slot instants offered in the schedule dialog. */
  suggestions?: string[]
  /** Shows an Edit entry (rows open the editor sheet with it). */
  onEdit?: () => void
  size?: 'sm' | 'md'
  className?: string
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Copied', { description: 'Paste it wherever you like.' })
  } catch {
    toast.error("Couldn't copy to the clipboard", {
      description: 'Your browser blocked clipboard access. Open the draft and copy the text manually.',
    })
  }
}

/**
 * The actions for one draft, chosen by its queue state: one primary button,
 * at most one secondary, and the rest in a "More" menu.
 */
export function DraftActions({
  draft,
  item,
  actions,
  timezone,
  linkedinDirect,
  suggestions,
  onEdit,
  size = 'sm',
  className,
}: DraftActionsProps) {
  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const status = item?.status ?? null
  const { draftId, platform } = draft
  const busy = actions.isPending(draftId)
  const pendingAction = actions.pending[draftId]
  const direct = platform === 'linkedin' && linkedinDirect
  const publishText = publishLabel(platform, linkedinDirect)
  const postedMethod = platform === 'twitter' ? 'x_intent' : 'manual'

  const publish = () =>
    actions.publishNow({ draftId, platform, content: draft.content, hashtags: draft.hashtags })
  const addToQueue = () => actions.schedule(draftId)
  const PublishIcon = direct ? Send : ExternalLink

  const publishButton = (variant: 'primary' | 'secondary') => (
    <Button
      variant={variant}
      size={size}
      onClick={publish}
      loading={pendingAction === 'publish'}
      disabled={busy}
    >
      {platform === 'twitter' && !busy ? (
        <PlatformIcon platform="twitter" colored={false} className="size-3.5" />
      ) : (
        <PublishIcon strokeWidth={1.75} aria-hidden="true" />
      )}
      {publishText}
    </Button>
  )

  let primary: React.ReactNode = null
  let secondary: React.ReactNode = null
  const menu: React.ReactNode[] = []

  const scheduleItem = (label: string) => (
    <DropdownMenuItem key="schedule" icon={CalendarClock} onSelect={() => setScheduleOpen(true)}>
      {label}
    </DropdownMenuItem>
  )
  const skipItem = (
    <DropdownMenuItem key="skip" icon={SkipForward} onSelect={() => void actions.skip(draftId)}>
      Skip
    </DropdownMenuItem>
  )
  const publishItem = (
    <DropdownMenuItem key="publish" icon={direct ? Send : ExternalLink} onSelect={() => void publish()}>
      {publishText}
    </DropdownMenuItem>
  )

  switch (status) {
    case null:
    case 'approved':
      primary = (
        <Button size={size} onClick={addToQueue} loading={pendingAction === 'schedule'} disabled={busy}>
          <CalendarPlus strokeWidth={1.75} aria-hidden="true" />
          Add to queue
        </Button>
      )
      menu.push(scheduleItem('Schedule…'), publishItem)
      if (status === 'approved') menu.push(skipItem)
      break
    case 'pending_review':
      primary = (
        <Button size={size} onClick={() => actions.approve(draftId)} loading={pendingAction === 'approve'} disabled={busy}>
          <Check strokeWidth={2} aria-hidden="true" />
          Approve
        </Button>
      )
      menu.push(scheduleItem(item?.scheduledFor ? 'Change time…' : 'Schedule…'), publishItem, skipItem)
      break
    case 'scheduled':
      secondary = publishButton('secondary')
      menu.push(
        scheduleItem('Reschedule…'),
        <DropdownMenuItem key="unschedule" icon={CalendarX2} onSelect={() => void actions.unschedule(draftId)}>
          Remove from schedule
        </DropdownMenuItem>,
        skipItem,
      )
      break
    case 'ready':
      primary = publishButton('primary')
      secondary = (
        <Button
          variant="secondary"
          size={size}
          onClick={() => actions.markPosted(draftId, postedMethod)}
          loading={pendingAction === 'posted'}
          disabled={busy}
        >
          <CircleCheck strokeWidth={1.75} aria-hidden="true" />
          I posted it
        </Button>
      )
      menu.push(scheduleItem('Reschedule…'), skipItem)
      break
    case 'publishing':
      primary = (
        <Button size={size} variant="secondary" loading disabled>
          Publishing
        </Button>
      )
      break
    case 'published':
      if (item?.externalUrl && /^https:\/\//i.test(item.externalUrl)) {
        secondary = (
          <ButtonLink href={item.externalUrl} target="_blank" rel="noreferrer" variant="secondary" size={size}>
            <ExternalLink strokeWidth={1.75} aria-hidden="true" />
            View post
          </ButtonLink>
        )
      } else if (item?.publishMethod) {
        secondary = <span className="text-sm text-fg-muted">{METHOD_LABELS[item.publishMethod]}</span>
      }
      break
    case 'failed':
      primary = (
        <Button size={size} onClick={publish} loading={pendingAction === 'publish'} disabled={busy}>
          <RotateCw strokeWidth={1.75} aria-hidden="true" />
          Retry now
        </Button>
      )
      menu.push(scheduleItem('Reschedule…'), skipItem)
      break
    case 'skipped':
      secondary = (
        <Button variant="secondary" size={size} onClick={addToQueue} loading={pendingAction === 'schedule'} disabled={busy}>
          <CalendarPlus strokeWidth={1.75} aria-hidden="true" />
          Add back to queue
        </Button>
      )
      break
  }

  // Copy text is always useful, so the menu shows for every state but publishing.
  const showMenu = status !== 'publishing'

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {primary}
      {secondary}
      {showMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size={size === 'sm' ? 'icon-sm' : 'icon'} aria-label="More actions" disabled={busy} />
            }
          >
            <MoreHorizontal strokeWidth={1.75} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit && (
              <DropdownMenuItem icon={PencilLine} onSelect={onEdit}>
                Edit
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              icon={Copy}
              onSelect={() => void copyText(composePostText(draft.content, draft.hashtags, platform))}
            >
              Copy text
            </DropdownMenuItem>
            {menu.length > 0 && <DropdownMenuSeparator />}
            {menu}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        timezone={timezone}
        platform={platform}
        current={item?.scheduledFor ?? null}
        suggestions={suggestions}
        title={item?.scheduledFor ? 'Change when it posts' : 'Schedule post'}
        onConfirm={(at) => actions.schedule(draftId, at)}
      />
    </div>
  )
}
