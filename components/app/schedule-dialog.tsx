'use client'

import * as React from 'react'
import { CalendarClock, Clock } from 'lucide-react'
import type { PostPlatform } from '@/types/posts'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { platformLabel } from '@/components/brand/platform'
import {
  dayKey,
  formatDayTime,
  formatTime,
  timeZoneAbbr,
  zonedDateTimeToUtc,
} from '@/components/app/format'

export interface ScheduleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  timezone: string
  platform: PostPlatform
  /** Current slot, used to prefill the picker. */
  current?: string | null
  /** Upcoming slot instants to offer as quick picks. */
  suggestions?: string[]
  /** `undefined` means "next free slot". */
  onConfirm: (at: Date | undefined) => Promise<unknown> | void
  title?: string
}

type Mode = 'next' | 'custom'

function defaultCustom(current: string | null | undefined, tz: string) {
  const base = current && new Date(current).getTime() > Date.now() ? new Date(current) : new Date(Date.now() + 60 * 60 * 1000)
  const minutes = base.getMinutes()
  const rounded = new Date(base.getTime() + ((15 - (minutes % 15)) % 15) * 60_000)
  return { day: dayKey(rounded, tz), time: formatTime(rounded, tz) }
}

/**
 * Pick when a draft goes out: the next free slot (the default) or an exact
 * date and time in the user's timezone, which the dialog always names.
 */
export function ScheduleDialog({
  open,
  onOpenChange,
  timezone,
  platform,
  current,
  suggestions = [],
  onConfirm,
  title = 'Schedule post',
}: ScheduleDialogProps) {
  const [mode, setMode] = React.useState<Mode>(current ? 'custom' : 'next')
  const [day, setDay] = React.useState('')
  const [time, setTime] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    const initial = defaultCustom(current, timezone)
    setDay(initial.day)
    setTime(initial.time)
    setMode(current ? 'custom' : 'next')
    setError(null)
  }, [open, current, timezone])

  const abbr = timeZoneAbbr(timezone)
  const today = dayKey(new Date(), timezone)
  const upcoming = suggestions.filter((s) => new Date(s).getTime() > Date.now()).slice(0, 3)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    let at: Date | undefined
    if (mode === 'custom') {
      const parsed = zonedDateTimeToUtc(day, time, timezone)
      if (!parsed) {
        setError('Enter a date and a time.')
        return
      }
      if (parsed.getTime() <= Date.now() + 60_000) {
        setError('Pick a time at least a minute from now.')
        return
      }
      at = parsed
    }
    setError(null)
    setSubmitting(true)
    try {
      await onConfirm(at)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  const pickSuggestion = (iso: string) => {
    setMode('custom')
    setDay(dayKey(iso, timezone))
    setTime(formatTime(iso, timezone))
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Your {platformLabel(platform)} post goes out at the time you choose. Times are in {abbr}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-5">
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} aria-label="When to post">
              <div className="flex items-start gap-3">
                <RadioGroupItem value="next" id="schedule-next" />
                <Label htmlFor="schedule-next" className="flex flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium text-fg">Next free slot</span>
                  <span className="text-sm text-fg-muted">The first open time in your posting schedule.</span>
                </Label>
              </div>
              <div className="flex items-start gap-3">
                <RadioGroupItem value="custom" id="schedule-custom" />
                <Label htmlFor="schedule-custom" className="flex flex-col items-start gap-0.5 font-normal">
                  <span className="font-medium text-fg">Pick a time</span>
                  <span className="text-sm text-fg-muted">Any date and time from now on.</span>
                </Label>
              </div>
            </RadioGroup>

            {mode === 'custom' && (
              <div className="flex flex-col gap-4 rounded-lg border border-line bg-sunken/50 p-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_140px]">
                  <Field label="Date">
                    <Input
                      type="date"
                      value={day}
                      min={today}
                      onChange={(e) => setDay(e.target.value)}
                      leadingIcon={CalendarClock}
                    />
                  </Field>
                  <Field label={`Time (${abbr})`}>
                    <Input
                      type="time"
                      step={900}
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      leadingIcon={Clock}
                    />
                  </Field>
                </div>
                {upcoming.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm text-fg-muted">Your next slots</span>
                    <div className="flex flex-wrap gap-2">
                      {upcoming.map((slot) => (
                        <Button key={slot} variant="outline" size="sm" onClick={() => pickSuggestion(slot)}>
                          {formatDayTime(slot, timezone)}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              {mode === 'next' ? 'Add to next slot' : 'Schedule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
