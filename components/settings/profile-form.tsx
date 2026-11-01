'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Avatar } from '@/components/ui/avatar'
import { ChoiceGroup } from '@/components/ui/choice-group'
import { Field } from '@/components/ui/field'
import { FormSection } from '@/components/ui/form-section'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/toast'
import {
  AUDIENCE_OPTIONS,
  MAX_AUDIENCES,
  PITCH_MAX,
  ROLE_OPTIONS,
  isAudience,
  isRole,
  timeZoneAbbreviation,
  type Audience,
  type Role,
} from '@/components/onboarding/questions'
import { TimezoneSelect } from '@/components/onboarding/timezone-select'
import { patchJson, readError } from '@/components/onboarding/client'
import { SaveBar } from './save-bar'

export interface ProfileFormProps {
  user: { name: string | null; email: string | null; image: string | null }
  profile: { role: string | null; pitch: string | null; audiences: string[]; timezone: string }
}

interface Values {
  role: Role | ''
  pitch: string
  audiences: Audience[]
  timezone: string
}

function toValues(p: ProfileFormProps['profile']): Values {
  return {
    role: isRole(p.role) ? p.role : '',
    pitch: p.pitch ?? '',
    audiences: (p.audiences ?? []).filter(isAudience),
    timezone: p.timezone || 'UTC',
  }
}

function same(a: Values, b: Values) {
  return (
    a.role === b.role &&
    a.pitch.trim() === b.pitch.trim() &&
    a.timezone === b.timezone &&
    a.audiences.length === b.audiences.length &&
    a.audiences.every((x) => b.audiences.includes(x))
  )
}

export function ProfileForm({ user, profile }: ProfileFormProps) {
  const router = useRouter()
  const [saved, setSaved] = React.useState<Values>(() => toValues(profile))
  const [values, setValues] = React.useState<Values>(saved)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<Partial<Record<keyof Values, string>>>({})
  const dirty = !same(values, saved)

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const onSave = async () => {
    if (values.audiences.length === 0) {
      setErrors({ audiences: 'Pick at least one audience.' })
      return
    }
    setSaving(true)
    try {
      const res = await patchJson('/api/user/profile', {
        role: values.role || null,
        pitch: values.pitch.trim() || null,
        audiences: values.audiences,
        timezone: values.timezone,
      })
      if (!res.ok) {
        toast.error('Profile not saved', { description: await readError(res, 'Check the fields and try again.') })
        return
      }
      setSaved(values)
      toast.success('Profile saved')
      router.refresh()
    } catch {
      toast.error('Profile not saved', { description: 'Check your connection and try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <FormSection title="Account" description="Your name and photo come from GitHub.">
        <div className="flex items-center gap-4">
          <Avatar src={user.image} name={user.name ?? user.email} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-medium text-fg">{user.name ?? 'GitHub user'}</p>
            <p className="truncate text-sm text-fg-muted">{user.email ?? 'No public email on GitHub'}</p>
          </div>
        </div>
      </FormSection>
      <Separator />
      <FormSection
        title="About you"
        description="The writer uses this as author context, so posts mention your work the way you would."
      >
        <div className="flex max-w-xl flex-col gap-5">
          <Field label="What best describes you?">
            <Select<Role | ''>
              value={values.role}
              onValueChange={(v) => set('role', v)}
              placeholder="Choose one"
              options={ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label, description: o.description }))}
            />
          </Field>
          <Field label="In one line, what are you building?" description={`${PITCH_MAX - values.pitch.length} characters left`}>
            <Input
              value={values.pitch}
              maxLength={PITCH_MAX}
              onChange={(e) => set('pitch', e.target.value)}
              placeholder="An open-source feature flag service for small teams"
            />
          </Field>
        </div>
      </FormSection>
      <Separator />
      <FormSection title="Audience" description="Up to two. This changes what posts explain and what they skip.">
        <div className="flex max-w-xl flex-col gap-2">
          <ChoiceGroup<Audience>
            aria-label="Who should your posts reach?"
            multiple
            max={MAX_AUDIENCES}
            columns={2}
            value={values.audiences}
            onChange={(v) => set('audiences', v as Audience[])}
            options={AUDIENCE_OPTIONS}
          />
          {errors.audiences && (
            <p role="alert" className="text-sm text-danger">
              {errors.audiences}
            </p>
          )}
        </div>
      </FormSection>
      <Separator />
      <FormSection
        title="Time zone"
        description="Posting slots, the Monday digest and every date in the app use this zone."
      >
        <Field
          label="Time zone"
          className="max-w-sm"
          description={`Currently ${timeZoneAbbreviation(values.timezone)}`}
        >
          <TimezoneSelect value={values.timezone} onChange={(tz) => set('timezone', tz)} />
        </Field>
      </FormSection>

      <SaveBar dirty={dirty} saving={saving} onSave={onSave} onDiscard={() => setValues(saved)} />
    </div>
  )
}
