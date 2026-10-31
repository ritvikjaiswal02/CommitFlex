/**
 * The queue list shared by the popup and the composer panel: items grouped
 * by state, each hanging off the commit-node rail, with Insert, Copy and Open.
 */
import { copyText, h } from '../shared/dom'
import { STATUS_LABELS, itemWhen, platformLabel } from '../shared/format'
import { brandIcon, icon, spinner, statusNode } from '../shared/icons'
import type { ExtensionItem } from '../shared/types'

export interface ItemListOptions {
  queue: ExtensionItem[]
  recent: ExtensionItem[]
  /** Show the platform mark in each row (popup "All" view). */
  showPlatform: boolean
  /** Whether to offer Insert for an item (a composer for its platform is reachable). */
  canInsert: boolean | ((item: ExtensionItem) => boolean)
  insertLabel?: string
  onInsert: (item: ExtensionItem) => Promise<boolean>
  /** Approves a pending_review item. Resolves true when it worked. */
  onApprove?: (item: ExtensionItem) => Promise<boolean>
  onOpen: (item: ExtensionItem) => void
  onCopied?: (item: ExtensionItem) => void
  /** Rendered when there is nothing to show. */
  empty: () => HTMLElement
}

interface Group {
  key: string
  title: string
  items: ExtensionItem[]
}

export function groupItems(queue: ExtensionItem[], recent: ExtensionItem[]): Group[] {
  const groups: Group[] = [
    { key: 'ready', title: 'Ready to post', items: queue.filter((i) => i.status === 'ready') },
    {
      key: 'scheduled',
      title: 'Scheduled',
      items: queue.filter((i) => i.status === 'scheduled' || i.status === 'approved'),
    },
    { key: 'review', title: 'Needs review', items: queue.filter((i) => i.status === 'pending_review') },
    { key: 'recent', title: 'Recent drafts', items: recent },
  ]
  return groups.filter((g) => g.items.length > 0)
}

export function renderItemList(opts: ItemListOptions): HTMLElement {
  const groups = groupItems(opts.queue, opts.recent)
  if (groups.length === 0) return opts.empty()

  return h(
    'div',
    { class: 'cx-list' },
    groups.map((group) =>
      h(
        'section',
        { class: 'cx-group', attrs: { 'aria-label': group.title } },
        h('h3', { class: 'cx-group-head' }, h('span', { text: group.title }), h('span', { class: 'cx-tabular', text: String(group.items.length) })),
        h('ul', { class: 'cx-items' }, group.items.map((item) => renderItem(item, opts))),
      ),
    ),
  )
}

function renderItem(item: ExtensionItem, opts: ItemListOptions): HTMLElement {
  const statusLabel = STATUS_LABELS[item.status]
  const row = h('li', { class: 'cx-item', dataset: { draftId: item.draftId } })

  const canInsert = typeof opts.canInsert === 'function' ? opts.canInsert(item) : opts.canInsert
  const insertButton = canInsert
    ? h(
        'button',
        {
          class: 'cx-btn cx-btn--primary cx-btn--xs cx-focus',
          attrs: { type: 'button', 'aria-label': `${opts.insertLabel ?? 'Insert'} this ${platformLabel(item.platform)} post` },
        },
        icon('cornerDownLeft', 14),
        h('span', { text: opts.insertLabel ?? 'Insert' }),
      )
    : null

  if (insertButton) {
    insertButton.addEventListener('click', async () => {
      const label = insertButton.querySelector('span')
      insertButton.setAttribute('aria-disabled', 'true')
      row.dataset.busy = 'true'
      const first = insertButton.firstChild
      const spin = spinner(14)
      if (first) insertButton.replaceChild(spin, first)
      let ok = false
      try {
        ok = await opts.onInsert(item)
      } finally {
        row.dataset.busy = 'false'
        insertButton.removeAttribute('aria-disabled')
        insertButton.replaceChild(icon(ok ? 'check' : 'cornerDownLeft', 14), spin)
        if (label && ok) {
          label.textContent = 'Inserted'
          setTimeout(() => {
            label.textContent = opts.insertLabel ?? 'Insert'
            const current = insertButton.firstChild
            if (current) insertButton.replaceChild(icon('cornerDownLeft', 14), current)
          }, 2000)
        }
      }
    })
  }

  // Needs review: Approve is the primary action (no Insert until it's approved).
  const approveButton =
    item.status === 'pending_review' && opts.onApprove
      ? h(
          'button',
          {
            class: 'cx-btn cx-btn--primary cx-btn--xs cx-focus',
            attrs: { type: 'button', 'aria-label': `Approve this ${platformLabel(item.platform)} post` },
          },
          icon('check', 14),
          h('span', { text: 'Approve' }),
        )
      : null
  if (approveButton && opts.onApprove) {
    const approve = opts.onApprove
    approveButton.addEventListener('click', async () => {
      if (approveButton.getAttribute('aria-disabled') === 'true') return
      approveButton.setAttribute('aria-disabled', 'true')
      row.dataset.busy = 'true'
      const label = approveButton.querySelector('span')
      const first = approveButton.firstChild
      const spin = spinner(14)
      if (first) approveButton.replaceChild(spin, first)
      let ok = false
      try {
        ok = await approve(item)
      } finally {
        row.dataset.busy = 'false'
        approveButton.replaceChild(icon(ok ? 'check' : 'alert', 14), spin)
        if (label) label.textContent = ok ? 'Approved' : 'Try again'
        if (!ok) approveButton.removeAttribute('aria-disabled')
      }
    })
  }

  const copyButton = h(
    'button',
    {
      class: `cx-btn ${insertButton || approveButton ? 'cx-btn--ghost' : 'cx-btn--secondary'} cx-btn--xs cx-focus`,
      attrs: { type: 'button' },
    },
    icon('copy', 14),
    h('span', { text: 'Copy' }),
  )
  copyButton.addEventListener('click', async () => {
    const ok = await copyText(item.text)
    const label = copyButton.querySelector('span')
    const first = copyButton.firstChild
    if (first) copyButton.replaceChild(icon(ok ? 'check' : 'alert', 14), first)
    copyButton.dataset.done = ok ? 'true' : 'false'
    if (label) label.textContent = ok ? 'Copied' : "Couldn't copy"
    if (ok) opts.onCopied?.(item)
    setTimeout(() => {
      const current = copyButton.firstChild
      if (current) copyButton.replaceChild(icon('copy', 14), current)
      copyButton.dataset.done = 'false'
      if (label) label.textContent = 'Copy'
    }, 1600)
  })

  const openButton = h(
    'button',
    {
      class: 'cx-btn cx-btn--ghost cx-btn--xs cx-btn--icon cx-focus',
      attrs: { type: 'button', 'aria-label': 'Open in CommitFlex', title: 'Open in CommitFlex' },
      on: { click: () => opts.onOpen(item) },
    },
    icon('externalLink', 14),
  )

  row.append(
    h('div', { class: 'cx-item-rail' }, statusNode(item.status, statusLabel)),
    h(
      'div',
      { class: 'cx-item-body' },
      h(
        'div',
        { class: 'cx-item-meta' },
        opts.showPlatform ? brandIcon(item.platform, 12, platformLabel(item.platform)) : null,
        h('span', { class: 'cx-mono cx-truncate', text: item.repoFullName || 'CommitFlex' }),
        h('span', { class: 'cx-when cx-tabular', text: itemWhen(item) }),
      ),
      h('p', { class: 'cx-item-text', text: item.text }),
      h('div', { class: 'cx-item-actions' }, approveButton ?? insertButton, copyButton, openButton),
    ),
  )
  return row
}

/** Skeleton rows shaped like items. */
export function renderListSkeleton(rows = 3): HTMLElement {
  return h(
    'div',
    { class: 'cx-list', attrs: { 'aria-busy': 'true', 'aria-label': 'Loading your queue' } },
    h('div', { class: 'cx-group-head' }, h('span', { class: 'cx-skeleton', style: { width: '88px', height: '12px' } })),
    h(
      'ul',
      { class: 'cx-items' },
      Array.from({ length: rows }, () =>
        h(
          'li',
          { class: 'cx-item' },
          h('div', { class: 'cx-item-rail' }, h('span', { class: 'cx-skeleton', style: { width: '12px', height: '12px', borderRadius: '999px' } })),
          h(
            'div',
            { class: 'cx-item-body' },
            h('span', { class: 'cx-skeleton', style: { width: '45%', height: '12px' } }),
            h('span', { class: 'cx-skeleton', style: { width: '100%', height: '14px' } }),
            h('span', { class: 'cx-skeleton', style: { width: '80%', height: '14px' } }),
          ),
        ),
      ),
    ),
  )
}

export function renderEmpty(title: string, body: string, action?: HTMLElement | null): HTMLElement {
  return h(
    'div',
    { class: 'cx-empty' },
    h('div', { class: 'cx-empty-icon' }, icon('inbox', 20)),
    h('div', {}, h('p', { class: 'cx-empty-title', text: title }), h('p', { class: 'cx-empty-body cx-text-sm', text: body })),
    action ?? null,
  )
}

export function renderCallout(
  tone: 'info' | 'warning' | 'danger' | 'success',
  title: string,
  body?: string | null,
  actions?: (HTMLElement | null)[],
): HTMLElement {
  const iconName = tone === 'success' ? 'circleCheck' : 'alert'
  const visible = (actions ?? []).filter((a): a is HTMLElement => a !== null)
  return h(
    'div',
    { class: `cx-callout cx-callout--${tone}`, attrs: { role: tone === 'danger' ? 'alert' : 'status' } },
    icon(iconName, 16),
    h(
      'div',
      { style: { minWidth: '0' } },
      h('p', { class: 'cx-callout-title', text: title }),
      body ? h('p', { class: 'cx-callout-body', text: body }) : null,
      visible.length ? h('div', { class: 'cx-callout-actions' }, visible) : null,
    ),
  )
}
