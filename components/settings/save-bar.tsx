'use client'

import * as React from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Button } from '@/components/ui/button'

export interface SaveBarProps {
  dirty: boolean
  saving: boolean
  onSave: () => void
  onDiscard: () => void
  saveLabel?: string
  message?: string
}

/**
 * Sticky bar that appears when a settings form has unsaved changes. Sits at
 * the bottom of the viewport so Save is always reachable on long forms.
 */
export function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel = 'Save changes', message = 'You have unsaved changes' }: SaveBarProps) {
  const reduce = useReducedMotion()

  // Warn before leaving with unsaved changes.
  React.useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  return (
    <AnimatePresence initial={false}>
      {dirty && (
        <motion.div
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : 8 }}
          transition={{ duration: reduce ? 0.1 : 0.18, ease: [0.2, 0, 0, 1] }}
          className="sticky bottom-4 z-[5] mt-8"
        >
          <div
            role="region"
            aria-label="Unsaved changes"
            className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface px-4 py-3 shadow-md sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-fg">{message}</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onDiscard} disabled={saving}>
                Discard
              </Button>
              <Button size="sm" onClick={onSave} loading={saving}>
                {saveLabel}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
