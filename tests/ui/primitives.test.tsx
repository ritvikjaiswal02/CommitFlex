import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusNode, NODE_LABELS, NODE_STATES, isNodeState, StatusLabel } from '@/components/ui/status-node'
import { ChoiceGroup } from '@/components/ui/choice-group'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { EmptyState } from '@/components/ui/empty-state'
import { Progress } from '@/components/ui/progress'
import { Stat, StatGroup } from '@/components/ui/stat'
import { initialsFrom } from '@/components/ui/avatar'
import { PlatformBadge, PlatformIcon, platformLabel, PLATFORM_CHAR_LIMIT } from '@/components/brand/platform'
import { Logo } from '@/components/brand/logo'

describe('Button', () => {
  it('defaults to a primary button of type="button"', () => {
    render(<Button>Approve</Button>)
    const button = screen.getByRole('button', { name: 'Approve' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.className).toContain('bg-accent')
  })

  it('disables itself and sets aria-busy while loading', () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Publish now
      </Button>,
    )
    const button = screen.getByRole('button', { name: /publish now/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('applies the danger variant', () => {
    render(<Button variant="danger">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger')
  })
})

describe('Badge', () => {
  it('renders the marker variant', () => {
    render(<Badge variant="marker">New</Badge>)
    expect(screen.getByText('New').className).toContain('bg-marker')
  })
})

describe('StatusNode', () => {
  it('has an accessible name for every state', () => {
    for (const state of NODE_STATES) {
      const { unmount } = render(<StatusNode state={state} />)
      expect(screen.getByRole('img', { name: NODE_LABELS[state] })).toBeInTheDocument()
      unmount()
    }
  })

  it('uses the contracted labels', () => {
    expect(NODE_LABELS.pending_review).toBe('Needs review')
    expect(NODE_LABELS.ready).toBe('Ready to post')
    expect(isNodeState('scheduled')).toBe(true)
    expect(isNodeState('nope')).toBe(false)
  })

  it('is hidden from assistive tech when decorative', () => {
    render(<StatusLabel state="published" />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('Published')).toBeInTheDocument()
  })
})

describe('ChoiceGroup', () => {
  const options = [
    { value: 'developers', label: 'Other developers' },
    { value: 'recruiters', label: 'Recruiters and hiring managers' },
    { value: 'customers', label: 'Potential customers' },
  ] as const

  it('selects with click and arrow keys in single mode', () => {
    function Harness() {
      const [value, setValue] = React.useState<string>('developers')
      return (
        <ChoiceGroup
          aria-label="Audience"
          value={value}
          onChange={(v) => setValue(v as string)}
          options={options.map((o) => ({ ...o }))}
        />
      )
    }
    render(<Harness />)
    const group = screen.getByRole('radiogroup', { name: 'Audience' })
    expect(group).toBeInTheDocument()
    const first = screen.getByRole('radio', { name: /other developers/i })
    expect(first).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(screen.getByRole('radio', { name: /recruiters/i })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('radio', { name: /potential customers/i }))
    expect(screen.getByRole('radio', { name: /potential customers/i })).toHaveAttribute('aria-checked', 'true')
  })

  it('respects max in multiple mode', () => {
    const onChange = vi.fn()
    render(
      <ChoiceGroup
        aria-label="Audience"
        multiple
        max={2}
        value={['developers', 'recruiters']}
        onChange={onChange}
        options={options.map((o) => ({ ...o }))}
      />,
    )
    const third = screen.getByRole('checkbox', { name: /potential customers/i })
    expect(third).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(third)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('checkbox', { name: /other developers/i }))
    expect(onChange).toHaveBeenCalledWith(['recruiters'])
  })
})

describe('SegmentedControl', () => {
  it('moves selection with arrow keys', () => {
    const onValueChange = vi.fn()
    render(
      <SegmentedControl
        aria-label="Post time"
        value="09:00"
        onValueChange={onValueChange}
        options={[
          { value: '09:00', label: 'Morning 9:00' },
          { value: '12:30', label: 'Midday 12:30' },
          { value: '18:00', label: 'Evening 18:00' },
        ]}
      />,
    )
    const selected = screen.getByRole('radio', { name: 'Morning 9:00' })
    expect(selected).toHaveAttribute('tabindex', '0')
    fireEvent.keyDown(selected, { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenCalledWith('12:30')
    fireEvent.keyDown(selected, { key: 'ArrowLeft' })
    expect(onValueChange).toHaveBeenLastCalledWith('18:00')
  })
})

describe('Field', () => {
  it('links the label, description and error to the control', () => {
    render(
      <Field label="In one line, what are you building?" description="Max 160 characters." error="Too long">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText('In one line, what are you building?')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/Too long/)
  })
})

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        icon={FileText}
        title="Nothing waiting for review"
        description="Merge a pull request or run autopilot now."
        action={<button type="button">Draft something now</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Nothing waiting for review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Draft something now' })).toBeInTheDocument()
  })
})

describe('Progress', () => {
  it('clamps the value and exposes aria values', () => {
    render(<Progress value={14} max={10} aria-label="Drafts this month" />)
    const bar = screen.getByRole('progressbar', { name: 'Drafts this month' })
    expect(bar).toHaveAttribute('aria-valuenow', '10')
    expect(bar).toHaveAttribute('aria-valuemax', '10')
  })
})

describe('Stat', () => {
  it('renders label and value as a description list', () => {
    render(
      <StatGroup>
        <Stat label="Published this month" value={12} />
      </StatGroup>,
    )
    expect(screen.getByText('Published this month').closest('dt')).not.toBeNull()
    expect(screen.getByText('12').closest('dd')).not.toBeNull()
  })
})

describe('avatar initials', () => {
  it('derives initials from names and emails', () => {
    expect(initialsFrom('Ritvik Jaiswal')).toBe('RJ')
    expect(initialsFrom('octocat')).toBe('OC')
    expect(initialsFrom('jane.doe@example.com')).toBe('JD')
    expect(initialsFrom('')).toBe('?')
    expect(initialsFrom(null)).toBe('?')
  })
})

describe('brand', () => {
  it('labels platforms', () => {
    expect(platformLabel('twitter')).toBe('X')
    expect(platformLabel('linkedin')).toBe('LinkedIn')
    expect(PLATFORM_CHAR_LIMIT).toEqual({ linkedin: 3000, twitter: 280 })
  })

  it('renders platform icons with and without a title', () => {
    render(
      <>
        <PlatformIcon platform="github" title="GitHub" />
        <PlatformBadge platform="linkedin" />
      </>,
    )
    expect(screen.getByRole('img', { name: 'GitHub' })).toBeInTheDocument()
    expect(screen.getByText('LinkedIn')).toBeInTheDocument()
  })

  it('renders the logo as a home link', () => {
    render(<Logo href="/" />)
    expect(screen.getByRole('link', { name: 'CommitFlex home' })).toHaveAttribute('href', '/')
  })
})
