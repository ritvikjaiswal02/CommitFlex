import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog'
import { Toaster, toast } from '@/components/ui/toast'
import { Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Timeline, TimelineItem } from '@/components/ui/timeline'
import { StatusNode } from '@/components/ui/status-node'
import { Callout } from '@/components/ui/callout'
import { PageHeader } from '@/components/ui/page-header'

describe('Switch', () => {
  it('toggles through onCheckedChange', () => {
    const onCheckedChange = vi.fn()
    render(<Switch checked={false} onCheckedChange={onCheckedChange} aria-label="Autopilot" />)
    fireEvent.click(screen.getByRole('switch', { name: 'Autopilot' }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})

describe('Checkbox', () => {
  it('reports the new checked state', () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} aria-label="Weekly digest" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Weekly digest' }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })
})

describe('Tabs', () => {
  it('shows the selected panel and a count', () => {
    render(
      <Tabs defaultValue="profile">
        <TabsList aria-label="Settings">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="connections" count={2}>
            Connections
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">Profile panel</TabsContent>
        <TabsContent value="connections">Connections panel</TabsContent>
      </Tabs>,
    )
    expect(screen.getByText('Profile panel')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /connections/i })).toHaveTextContent('2')
  })
})

describe('Dialog', () => {
  it('renders an open dialog with a close button', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to Pro</DialogTitle>
            <DialogDescription>You've used 10 of 10 drafts this month.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>,
    )
    expect(screen.getByRole('dialog', { name: 'Upgrade to Pro' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })
})

describe('Select', () => {
  it('shows the selected option label', () => {
    render(
      <Select
        aria-label="Cadence"
        value="weekly"
        onValueChange={() => {}}
        options={[
          { value: 'ship_moments', label: 'When I ship something notable' },
          { value: 'weekly', label: 'Once a week' },
        ]}
      />,
    )
    expect(screen.getByText('Once a week')).toBeInTheDocument()
  })
})

describe('toast', () => {
  it('renders toasts from anywhere in client code', async () => {
    render(<Toaster />)
    act(() => {
      toast.success('Approved', { description: 'Scheduled for Tue, 9:30' })
    })
    await waitFor(() => expect(screen.getByText('Approved')).toBeInTheDocument())
    expect(screen.getByText('Scheduled for Tue, 9:30')).toBeInTheDocument()
    act(() => toast.dismiss())
  })
})

describe('Timeline', () => {
  it('renders nodes on a rail', () => {
    render(
      <Timeline>
        <TimelineItem node={<StatusNode state="scheduled" />}>Tuesday post</TimelineItem>
        <TimelineItem node={<StatusNode state="pending_review" />} last>
          Thursday post
        </TimelineItem>
      </Timeline>,
    )
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('img', { name: 'Scheduled' })).toBeInTheDocument()
  })
})

describe('Callout and PageHeader', () => {
  it('renders callout title and action', () => {
    render(
      <Callout tone="warning" title="Your LinkedIn connection expired" action={<button type="button">Reconnect LinkedIn</button>}>
        Posts will open pre-filled until you reconnect.
      </Callout>,
    )
    expect(screen.getByText('Your LinkedIn connection expired')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reconnect LinkedIn' })).toBeInTheDocument()
  })

  it('renders a breadcrumb with the current page marked', () => {
    render(
      <PageHeader
        title="Writing your drafts"
        breadcrumb={[{ label: 'Drafts', href: '/drafts' }, { label: 'Job' }]}
        actions={<button type="button">Cancel</button>}
      />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Writing your drafts' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Drafts' })).toHaveAttribute('href', '/drafts')
    expect(screen.getByText('Job')).toHaveAttribute('aria-current', 'page')
  })
})
