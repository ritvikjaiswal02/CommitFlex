'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'
import { Button, type ButtonSize, type ButtonVariant } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'

export interface CopyButtonProps {
  value: string
  label?: string
  copiedLabel?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  onCopied?: () => void
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(area)
    return ok
  } catch {
    return false
  }
}

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  variant = 'secondary',
  size = 'sm',
  className,
  onCopied,
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const iconOnly = typeof size === 'string' && size.startsWith('icon')

  React.useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const onClick = async () => {
    const ok = await writeClipboard(value)
    if (!ok) {
      toast.error("Couldn't copy to the clipboard", {
        description: 'Your browser blocked clipboard access. Select the text and copy it manually.',
      })
      return
    }
    setCopied(true)
    onCopied?.()
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  const Icon = copied ? Check : Copy
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={onClick}
      aria-label={iconOnly ? (copied ? copiedLabel : label) : undefined}
    >
      <Icon strokeWidth={1.75} aria-hidden="true" className={copied ? 'text-success' : undefined} />
      {!iconOnly && <span aria-live="polite">{copied ? copiedLabel : label}</span>}
    </Button>
  )
}
