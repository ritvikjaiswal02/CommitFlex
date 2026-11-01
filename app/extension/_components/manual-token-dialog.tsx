'use client'

import * as React from 'react'
import type { ApiTokenSummary } from '@/lib/db/queries/tokens'
import { Button } from '@/components/ui/button'
import { Callout } from '@/components/ui/callout'
import { CopyButton } from '@/components/ui/copy-button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export interface ManualTokenDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  createToken: (name?: string) => Promise<{ token: string; summary: ApiTokenSummary } | null>
}

/**
 * The copy-token fallback: for a browser where this page can't hand the token
 * to the extension directly. The plaintext is shown once, then forgotten.
 */
export function ManualTokenDialog({ open, onOpenChange, createToken }: ManualTokenDialogProps) {
  const [name, setName] = React.useState('')
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [created, setCreated] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      // Forget the plaintext as soon as the dialog closes.
      const t = setTimeout(() => {
        setCreated(null)
        setName('')
        setNameError(null)
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length > 60) {
      setNameError('Keep the name under 60 characters.')
      return
    }
    setNameError(null)
    setCreating(true)
    try {
      const result = await createToken(trimmed || undefined)
      if (result) setCreated(result.token)
      else onOpenChange(false)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !creating && onOpenChange(next)}>
      <DialogContent size="md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your token</DialogTitle>
              <DialogDescription>
                Open the extension&apos;s settings, paste it under Account, and choose Save.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 rounded-md border border-line bg-sunken p-3 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-fg" aria-label="Extension token">
                  {created}
                </code>
                <CopyButton value={created} label="Copy token" className="shrink-0 self-start sm:self-auto" />
              </div>
              <Callout tone="warning" title="CommitFlex shows a token only once">
                Treat it like a password. If you lose it, revoke it and create another.
              </Callout>
            </DialogBody>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader>
              <DialogTitle>Create a token</DialogTitle>
              <DialogDescription>
                For a browser where this page can&apos;t reach the extension, such as another computer.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <Field
                label="Name"
                description="So you can tell your browsers apart later."
                error={nameError}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Work laptop"
                  maxLength={80}
                  autoComplete="off"
                  invalid={nameError !== null}
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button variant="secondary" type="button" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" loading={creating}>
                Create token
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
