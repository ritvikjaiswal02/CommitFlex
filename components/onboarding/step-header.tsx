import * as React from 'react'

export interface StepHeaderProps {
  index: number
  total: number
  title: string
  helper?: React.ReactNode
  /** id for the h1, so groups can use aria-labelledby. */
  titleId?: string
}

/** "Step 2 of 6", the question, and a one-line helper. */
export function StepHeader({ index, total, title, helper, titleId }: StepHeaderProps) {
  return (
    <header className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted tabular-nums">
        Step {index + 1} of {total}
      </p>
      <h1 id={titleId} tabIndex={-1} className="outline-none text-2xl font-semibold text-fg text-balance sm:text-3xl">
        {title}
      </h1>
      {helper && <p className="max-w-prose text-base text-fg-muted text-pretty">{helper}</p>}
    </header>
  )
}
