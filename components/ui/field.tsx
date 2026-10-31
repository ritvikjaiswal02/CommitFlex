'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

export interface FieldProps {
  label: string
  htmlFor?: string
  description?: React.ReactNode
  error?: string | null
  required?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Label, control, help text and error in one column. When `children` is a
 * single element, Field wires up its id, aria-describedby and aria-invalid.
 */
export function Field({ label, htmlFor, description, error, required, className, children }: FieldProps) {
  const autoId = React.useId()
  const controlId = htmlFor ?? `field-${autoId.replace(/:/g, '')}`
  const descriptionId = description ? `${controlId}-description` : undefined
  const errorId = error ? `${controlId}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  let control = children
  if (React.isValidElement<Record<string, unknown>>(children)) {
    const childProps = children.props
    control = React.cloneElement(children, {
      id: (childProps.id as string | undefined) ?? controlId,
      'aria-describedby':
        [childProps['aria-describedby'] as string | undefined, describedBy].filter(Boolean).join(' ') ||
        undefined,
      'aria-invalid': error ? true : childProps['aria-invalid'],
      'aria-required': required || childProps['aria-required'] ? true : undefined,
    })
  }

  return (
    <div data-slot="field" className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={controlId}>
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="font-normal text-fg-subtle">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </Label>
      {control}
      {description && (
        <p id={descriptionId} className={cn('text-sm text-fg-muted', error && 'sr-only')}>
          {description}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
