'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { fieldControlClass } from '@/components/ui/input'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Grows with its content instead of showing a scrollbar. */
  autoResize?: boolean
  invalid?: boolean
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoResize = false, invalid, onChange, value, rows = 4, ...props },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

  const setRefs = React.useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
    },
    [forwardedRef],
  )

  const resize = React.useCallback(() => {
    const el = innerRef.current
    if (!el || !autoResize) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 2}px`
  }, [autoResize])

  useIsomorphicLayoutEffect(() => {
    resize()
  }, [resize, value])

  return (
    <textarea
      ref={setRefs}
      data-slot="textarea"
      rows={rows}
      value={value}
      {...props}
      aria-invalid={invalid ? true : props['aria-invalid']}
      onChange={(e) => {
        onChange?.(e)
        if (value === undefined) resize()
      }}
      className={cn(
        fieldControlClass,
        'block min-h-[88px] px-3 py-2 leading-6',
        autoResize ? 'resize-none overflow-hidden' : 'resize-y',
        className,
      )}
    />
  )
})
