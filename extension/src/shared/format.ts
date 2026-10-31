import type { ExtensionItem, ItemStatus, Platform } from './types'

export const STATUS_LABELS: Record<ItemStatus, string> = {
  draft: 'Draft',
  pending_review: 'Needs review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  ready: 'Ready to post',
  publishing: 'Publishing',
  published: 'Published',
  failed: 'Failed',
  skipped: 'Skipped',
}

export function platformLabel(platform: Platform): 'LinkedIn' | 'X' {
  return platform === 'linkedin' ? 'LinkedIn' : 'X'
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * Relative under a week, the date after that, always in the browser's timezone:
 * "in 3 hours", "tomorrow at 09:00", "Tue at 18:00", "yesterday at 12:30", "Tue, 3 Nov".
 */
export function relativeTime(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null
  const date = new Date(iso)
  const t = date.getTime()
  if (Number.isNaN(t)) return null
  const diff = t - now.getTime()
  const abs = Math.abs(diff)

  if (abs < MINUTE) return diff >= 0 ? 'in a moment' : 'just now'
  if (abs < HOUR) {
    const m = Math.round(abs / MINUTE)
    return diff > 0 ? `in ${m} min` : `${m} min ago`
  }
  const dayDelta = Math.round((startOfDay(date) - startOfDay(now)) / DAY)
  if (abs < 6 * HOUR && dayDelta === 0) {
    const h = Math.round(abs / HOUR)
    return diff > 0 ? `in ${h} ${h === 1 ? 'hour' : 'hours'}` : `${h} ${h === 1 ? 'hour' : 'hours'} ago`
  }
  const time = timeFmt.format(date)
  if (dayDelta === 0) return `today at ${time}`
  if (dayDelta === 1) return `tomorrow at ${time}`
  if (dayDelta === -1) return `yesterday at ${time}`
  if (Math.abs(dayDelta) < 7) return `${diff > 0 ? '' : 'last '}${weekdayFmt.format(date)} at ${time}`
  return dayFmt.format(date)
}

/** The short time label on the right of an item row. */
export function itemWhen(item: ExtensionItem, now: Date = new Date()): string {
  switch (item.status) {
    case 'ready':
      return 'Ready now'
    case 'scheduled':
    case 'pending_review':
    case 'approved':
      return relativeTime(item.scheduledFor, now) ?? 'Not scheduled'
    default:
      return relativeTime(item.createdAt, now) ?? ''
  }
}

export function pluralize(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Normalises text for comparisons: collapses whitespace and strips zero-width characters. */
export function normalizeText(text: string): string {
  return text.replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim()
}
