'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ensureDefaultVoiceProfile } from '@/app/settings/actions'
import { Plus, ScanText, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { useUpgrade } from '@/components/billing/upgrade-provider'
import { VOICE_SAMPLES_MAX, VOICE_SAMPLE_MIN, checkVoiceSamples } from '@/components/onboarding/questions'
import { patchJson, readError } from '@/components/onboarding/client'

export interface VoiceProfileView {
  id: string
  name: string
  isDefault: boolean
  tone: string
  technicalLevel: number
  audience: string
  extraContext: string | null
}

export interface VoiceProfileManagerProps {
  initialProfiles: VoiceProfileView[]
  /** The plan's voiceProfiles limit. */
  maxProfiles: number
}

const TONES: { value: string; label: string }[] = [
  { value: 'analytical', label: 'Plain and technical' },
  { value: 'storytelling', label: 'Story-led' },
  { value: 'enthusiastic', label: 'Confident' },
  { value: 'educational', label: 'Teacher' },
  { value: 'casual', label: 'Casual' },
  { value: 'professional', label: 'Professional' },
]

const AUDIENCE_SUGGESTIONS = [
  'developers',
  'developers and recruiters',
  'developers and customers',
  'founders and investors',
  'engineering leaders',
  'my project’s users',
]

const STYLE_NOTES_MAX = 4000

function toneLabel(tone: string): string {
  return TONES.find((t) => t.value === tone)?.label ?? tone.charAt(0).toUpperCase() + tone.slice(1)
}

function levelLabel(level: number): string {
  if (level <= 3) return 'Plain language'
  if (level <= 6) return 'Some technical detail'
  if (level <= 8) return 'Technical'
  return 'Deeply technical'
}

type Draft = Pick<VoiceProfileView, 'name' | 'tone' | 'technicalLevel' | 'audience'> & { extraContext: string }

function toDraft(p: VoiceProfileView): Draft {
  return {
    name: p.name,
    tone: p.tone,
    technicalLevel: p.technicalLevel,
    audience: p.audience,
    extraContext: p.extraContext ?? '',
  }
}

function sameDraft(a: Draft, b: Draft) {
  return (
    a.name.trim() === b.name.trim() &&
    a.tone === b.tone &&
    a.technicalLevel === b.technicalLevel &&
    a.audience.trim() === b.audience.trim() &&
    a.extraContext.trim() === b.extraContext.trim()
  )
}

function normalise(p: Partial<VoiceProfileView> & { id: string }): VoiceProfileView {
  return {
    id: p.id,
    name: p.name ?? 'Profile',
    isDefault: !!p.isDefault,
    tone: p.tone ?? 'professional',
    technicalLevel: p.technicalLevel ?? 7,
    audience: p.audience ?? 'developers',
    extraContext: p.extraContext ?? null,
  }
}

export function VoiceProfileManager({ initialProfiles, maxProfiles }: VoiceProfileManagerProps) {
  const router = useRouter()
  const { handlePlanError, openUpgrade } = useUpgrade()
  const [profiles, setProfiles] = React.useState<VoiceProfileView[]>(initialProfiles)

  // Accounts from before onboarding wrote a voice have none: create the
  // default once, then reload the page data.
  const ensured = React.useRef(false)
  React.useEffect(() => {
    if (initialProfiles.length > 0 || ensured.current) return
    ensured.current = true
    void ensureDefaultVoiceProfile()
      .then((result) => {
        if (result.created) router.refresh()
      })
      .catch(() => undefined)
  }, [initialProfiles.length, router])
  React.useEffect(() => {
    if (initialProfiles.length > 0) setProfiles((current) => (current.length === 0 ? initialProfiles : current))
  }, [initialProfiles])
  const [selectedId, setSelectedId] = React.useState<string>(
    () => initialProfiles.find((p) => p.isDefault)?.id ?? initialProfiles[0]?.id ?? '',
  )
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null
  const [draft, setDraft] = React.useState<Draft | null>(selected ? toDraft(selected) : null)
  const [saving, setSaving] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [makingDefault, setMakingDefault] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [learnOpen, setLearnOpen] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)

  const dirty = !!selected && !!draft && !sameDraft(draft, toDraft(selected))

  const select = (id: string) => {
    if (id === selectedId) return
    if (dirty && !window.confirm('Discard unsaved changes to this profile?')) return
    const next = profiles.find((p) => p.id === id)
    setSelectedId(id)
    setDraft(next ? toDraft(next) : null)
    setNameError(null)
  }

  const replace = (p: VoiceProfileView) => setProfiles((list) => list.map((x) => (x.id === p.id ? p : x)))

  const onAdd = async () => {
    if (profiles.length >= maxProfiles) {
      openUpgrade({ code: 'limit_reached', limit: 'voiceProfiles', used: profiles.length, max: maxProfiles })
      return
    }
    setAdding(true)
    try {
      const base = selected ?? profiles[0]
      const res = await patchJson(
        '/api/voice/profiles',
        {
          name: `Profile ${profiles.length + 1}`,
          tone: base?.tone ?? 'professional',
          technicalLevel: base?.technicalLevel ?? 7,
          audience: base?.audience ?? 'developers',
          extraContext: '',
        },
        'POST',
      )
      if (!res.ok) {
        if (await handlePlanError(res)) return
        toast.error('Profile not created', { description: await readError(res, 'Try again in a moment.') })
        return
      }
      const { profile } = (await res.json()) as { profile: VoiceProfileView }
      const created = normalise(profile)
      setProfiles((list) => [...list, created])
      setSelectedId(created.id)
      setDraft(toDraft(created))
      toast.success('Profile created', { description: 'Name it and set its tone, then save.' })
    } catch {
      toast.error('Profile not created', { description: 'Check your connection and try again.' })
    } finally {
      setAdding(false)
    }
  }

  const onSave = async () => {
    if (!selected || !draft) return
    if (!draft.name.trim()) {
      setNameError('Give the profile a name.')
      return
    }
    setSaving(true)
    try {
      const res = await patchJson(`/api/voice/profiles/${selected.id}`, {
        name: draft.name.trim(),
        tone: draft.tone,
        technicalLevel: draft.technicalLevel,
        audience: draft.audience.trim() || 'developers',
        extraContext: draft.extraContext.trim(),
      })
      if (!res.ok) {
        toast.error('Profile not saved', { description: await readError(res, 'Check the fields and try again.') })
        return
      }
      const { profile } = (await res.json()) as { profile: VoiceProfileView }
      const updated = normalise(profile)
      replace(updated)
      setDraft(toDraft(updated))
      toast.success('Profile saved')
    } catch {
      toast.error('Profile not saved', { description: 'Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  const onMakeDefault = async () => {
    if (!selected) return
    setMakingDefault(true)
    try {
      const res = await fetch(`/api/voice/profiles/${selected.id}/default`, { method: 'POST' })
      if (!res.ok) {
        toast.error('Default not changed', { description: await readError(res, 'Try again in a moment.') })
        return
      }
      setProfiles((list) => list.map((p) => ({ ...p, isDefault: p.id === selected.id })))
      toast.success(`${selected.name} is now your default voice`)
      router.refresh()
    } catch {
      toast.error('Default not changed', { description: 'Check your connection and try again.' })
    } finally {
      setMakingDefault(false)
    }
  }

  const onDelete = async () => {
    if (!selected) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/voice/profiles/${selected.id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Profile not deleted', { description: await readError(res, 'Try again in a moment.') })
        return
      }
      const remaining = profiles.filter((p) => p.id !== selected.id)
      if (selected.isDefault && remaining[0]) remaining[0] = { ...remaining[0], isDefault: true }
      setProfiles(remaining)
      const next = remaining.find((p) => p.isDefault) ?? remaining[0]
      setSelectedId(next?.id ?? '')
      setDraft(next ? toDraft(next) : null)
      setDeleteOpen(false)
      toast.success(`Deleted ${selected.name}`)
      router.refresh()
    } catch {
      toast.error('Profile not deleted', { description: 'Check your connection and try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const onFingerprint = (profile: VoiceProfileView) => {
    replace(profile)
    setDraft((d) => (d ? { ...d, extraContext: profile.extraContext ?? '' } : d))
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10">
      {/* Profile list */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-fg">Voice profiles</h2>
          <span className="text-sm text-fg-muted tabular-nums">
            {profiles.length} of {maxProfiles}
          </span>
        </div>
        <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface" aria-label="Voice profiles">
          {profiles.map((p) => {
            const active = p.id === selected?.id
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => select(p.id)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'relative flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors duration-120 focus-ring-inset',
                    active ? 'bg-accent-soft/50' : 'hover:bg-sunken/60',
                  )}
                >
                  {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-0.5 bg-accent" />}
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{p.name}</span>
                    {p.isDefault && (
                      <Badge variant="accent" size="sm">
                        Default
                      </Badge>
                    )}
                  </span>
                  <span className="truncate text-xs text-fg-muted">
                    {toneLabel(p.tone)}, level {p.technicalLevel}
                    {p.extraContext ? ', with fingerprint' : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <Button variant="secondary" size="sm" onClick={onAdd} loading={adding} className="self-start">
          {!adding && <Plus className="size-4" strokeWidth={1.75} aria-hidden="true" />}
          New profile
        </Button>
        <p className="text-xs text-fg-subtle">
          The default profile writes autopilot drafts unless Autopilot settings pick another.
        </p>
      </div>

      {/* Editor */}
      {selected && draft ? (
        <section aria-label={`Edit ${selected.name}`} className="flex flex-col rounded-lg border border-line bg-surface">
          <div className="flex flex-col gap-6 p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Name" error={nameError}>
                <Input
                  value={draft.name}
                  maxLength={60}
                  onChange={(e) => {
                    setDraft({ ...draft, name: e.target.value })
                    setNameError(null)
                  }}
                  placeholder="Founder voice"
                />
              </Field>
              <Field label="Tone">
                <Select<string>
                  value={draft.tone}
                  onValueChange={(v) => setDraft({ ...draft, tone: v })}
                  options={
                    TONES.some((t) => t.value === draft.tone)
                      ? TONES
                      : [...TONES, { value: draft.tone, label: toneLabel(draft.tone) }]
                  }
                />
              </Field>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-fg" id={`level-${selected.id}`}>
                  Technical depth
                </span>
                <span className="text-sm text-fg-muted tabular-nums">
                  {draft.technicalLevel} of 10, {levelLabel(draft.technicalLevel).toLowerCase()}
                </span>
              </div>
              <Slider
                value={draft.technicalLevel}
                onValueChange={(v) => setDraft({ ...draft, technicalLevel: v })}
                min={1}
                max={10}
                step={1}
                aria-label="Technical depth"
                getAriaValueText={(v) => `${v} of 10, ${levelLabel(v)}`}
              />
              <div className="flex justify-between text-xs text-fg-subtle">
                <span>Explain the outcome</span>
                <span>Explain the implementation</span>
              </div>
            </div>

            <Field label="Audience" description="Who the post is for, in your words.">
              <Input
                value={draft.audience}
                maxLength={100}
                list={`audiences-${selected.id}`}
                onChange={(e) => setDraft({ ...draft, audience: e.target.value })}
                placeholder="developers and recruiters"
              />
            </Field>
            <datalist id={`audiences-${selected.id}`}>
              {AUDIENCE_SUGGESTIONS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <label htmlFor={`notes-${selected.id}`} className="text-sm font-medium text-fg">
                    Style notes
                  </label>
                  <p className="text-sm text-fg-muted">
                    What the writer should copy from you: sentence length, openings, sign-offs, words to avoid.
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setLearnOpen(true)}>
                  <ScanText className="size-4" strokeWidth={1.75} aria-hidden="true" />
                  Learn from my posts
                </Button>
              </div>
              <Textarea
                id={`notes-${selected.id}`}
                value={draft.extraContext}
                maxLength={STYLE_NOTES_MAX}
                autoResize
                rows={5}
                onChange={(e) => setDraft({ ...draft, extraContext: e.target.value })}
                placeholder="Short sentences. Open with the problem, not the feature. No emoji. Never say “excited to announce”."
              />
              <p className="text-right text-xs text-fg-subtle tabular-nums">
                {draft.extraContext.length.toLocaleString('en-US')} / {STYLE_NOTES_MAX.toLocaleString('en-US')}
              </p>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              disabled={profiles.length <= 1}
              className="self-start text-danger hover:bg-danger-soft hover:text-danger sm:self-auto"
              title={profiles.length <= 1 ? 'You need at least one voice profile' : undefined}
            >
              <Trash2 className="size-4" strokeWidth={1.75} aria-hidden="true" />
              Delete
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              {!selected.isDefault && (
                <Button variant="secondary" onClick={onMakeDefault} loading={makingDefault}>
                  Make default
                </Button>
              )}
              <Button onClick={onSave} loading={saving} disabled={!dirty}>
                Save changes
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="rounded-lg border border-line bg-surface p-5 text-sm text-fg-muted">
          Create a voice profile to start.
        </div>
      )}

      {selected && (
        <LearnVoiceDialog
          open={learnOpen}
          onOpenChange={setLearnOpen}
          profile={selected}
          onSaved={onFingerprint}
        />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={(o) => !deleting && setDeleteOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selected?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Drafts already written keep their text.
              {selected?.isDefault && ' Your oldest remaining profile becomes the default.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Keep profile</AlertDialogCancel>
            <AlertDialogAction variant="danger" closeOnClick={false} loading={deleting} onClick={onDelete}>
              Delete profile
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ─── Learn from my posts ────────────────────────────────────────────── */

function LearnVoiceDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: VoiceProfileView
  onSaved: (p: VoiceProfileView) => void
}) {
  const [text, setText] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const check = checkVoiceSamples(text)
  const count = check.samples.length

  const status =
    count === 0
      ? `Paste one to ${VOICE_SAMPLES_MAX} posts. Separate them with a blank line.`
      : check.tooMany
        ? `${count} posts found. Paste at most ${VOICE_SAMPLES_MAX}.`
        : check.tooShort > 0
          ? `${check.tooShort} of ${count} ${count === 1 ? 'post is' : 'posts are'} shorter than ${VOICE_SAMPLE_MIN} characters.`
          : check.tooLong > 0
            ? `${check.tooLong} ${check.tooLong === 1 ? 'post is' : 'posts are'} over 5,000 characters.`
            : `${count} ${count === 1 ? 'post' : 'posts'} ready. Two or three give the best result.`

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (count === 0 || !check.valid) {
      setError(status)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await patchJson(`/api/voice/profiles/${profile.id}/fingerprint`, { samples: check.samples }, 'POST')
      if (!res.ok) {
        setError(await readError(res, 'The analysis didn’t finish. Try again in a minute.'))
        return
      }
      const data = (await res.json()) as { profile: VoiceProfileView }
      onSaved(normalise(data.profile))
      setText('')
      onOpenChange(false)
      toast.success('Style notes updated', { description: `${profile.name} now writes like your posts.` })
    } catch {
      setError('The analysis didn’t finish. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent size="lg">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>Learn from your posts</DialogTitle>
            <DialogDescription>
              Paste posts you’ve written. We turn them into style notes for {profile.name} and don’t keep the posts.
              This replaces the current style notes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-2">
            <Textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError(null)
              }}
              rows={10}
              aria-label="Your past posts"
              aria-describedby="learn-status"
              invalid={!!error}
              placeholder={'Paste a post here.\n\nLeave a blank line, then paste the next one.'}
            />
            <p
              id="learn-status"
              aria-live="polite"
              className={cn('text-sm', error ? 'text-danger' : check.valid ? 'text-fg-muted' : 'text-warning')}
            >
              {error ?? status}
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={count === 0}>
              {busy ? 'Reading your posts' : 'Analyse and save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
