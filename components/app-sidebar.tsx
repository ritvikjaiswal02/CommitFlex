'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { LucideIcon } from 'lucide-react'
import {
  CalendarDays,
  ChartNoAxesColumn,
  ChevronsUpDown,
  CreditCard,
  FolderGit2,
  House,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Puzzle,
  Settings,
  SquarePen,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import type { PlanId, PlanStatus } from '@/lib/billing/catalog'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/brand/logo'
import { Avatar } from '@/components/ui/avatar'
import { ButtonLink } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useThemeChoice, type ThemeChoice } from '@/components/ui/theme'

export interface AppNavItem {
  href: string
  label: string
  icon: LucideIcon
  countKey?: 'review' | 'ready'
}

export const APP_NAV: AppNavItem[] = [
  { href: '/dashboard', label: 'Today', icon: House },
  { href: '/queue', label: 'Queue', icon: ListChecks, countKey: 'review' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/repositories', label: 'Repositories', icon: FolderGit2 },
  { href: '/analytics', label: 'Insights', icon: ChartNoAxesColumn },
]

export const APP_NAV_SECONDARY: AppNavItem[] = [
  { href: '/extension', label: 'Extension', icon: Puzzle },
  { href: '/billing', label: 'Billing', icon: CreditCard },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/** Trial length used for the sidebar's trial progress bar (mirrors TRIAL_DAYS in the plan catalog). */
const TRIAL_LENGTH_DAYS = 14

export interface SidebarUser {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}

export interface SidebarPlan {
  id: PlanId
  status: PlanStatus
  /** Whole days left in the Pro trial, computed on the server. */
  trialDaysLeft?: number | null
}

export interface SidebarCounts {
  review: number
  ready: number
}

export interface AppSidebarProps {
  user: SidebarUser
  plan: { id: PlanId; status: PlanStatus; trialDaysLeft?: number | null }
  counts: SidebarCounts
  variant?: 'desktop' | 'sheet'
  className?: string
}

function isActive(pathname: string, href: string): boolean {
  if (pathname === href || pathname.startsWith(`${href}/`)) return true
  // Every draft lives in the Queue: runs (/jobs) and the old Drafts list
  // belong to it. "Draft a post" (/drafts/new) is its own button.
  if (href === '/queue') {
    if (pathname.startsWith('/jobs')) return true
    if (pathname === '/drafts' || (pathname.startsWith('/drafts/') && !pathname.startsWith('/drafts/new'))) return true
  }
  return false
}

function countFor(item: AppNavItem, counts: SidebarCounts): number {
  if (!item.countKey) return 0
  // The Queue badge counts everything that needs the user: review + ready to post.
  if (item.href === '/queue') return counts.review + counts.ready
  return counts[item.countKey]
}

function NavLink({ item, active, count }: { item: AppNavItem; active: boolean; count: number }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors duration-120 ease-out focus-ring-surface',
        active ? 'bg-accent-soft font-medium text-accent-ink' : 'text-fg-muted hover:bg-sunken hover:text-fg',
      )}
    >
      <Icon
        className={cn('size-4 shrink-0', active ? 'text-accent-ink' : 'text-fg-subtle group-hover:text-fg-muted')}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {count > 0 && (
        <span
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center rounded-sm px-1.5 text-xs font-medium tabular-nums',
            active ? 'bg-surface text-accent-ink' : 'bg-sunken text-fg-muted',
          )}
        >
          {count > 99 ? '99+' : count}
          <span className="sr-only">{count === 1 ? ' item needs you' : ' items need you'}</span>
        </span>
      )}
    </Link>
  )
}

function PlanRow({ plan }: { plan: SidebarPlan }) {
  if (plan.status === 'past_due') {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-fg">
          <TriangleAlert className="size-4 text-warning" strokeWidth={1.75} aria-hidden="true" />
          Payment failed
        </p>
        <p className="text-xs text-fg-muted">Razorpay will retry. Update your payment method to keep Pro.</p>
        <ButtonLink href="/billing" variant="secondary" size="sm" className="w-full">
          Fix billing
        </ButtonLink>
      </div>
    )
  }

  if (plan.status === 'trialing') {
    const left = Math.max(0, plan.trialDaysLeft ?? 0)
    const used = Math.min(TRIAL_LENGTH_DAYS, Math.max(0, TRIAL_LENGTH_DAYS - left))
    return (
      <div className="flex flex-col gap-2.5 rounded-lg border border-line p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-fg">
            <span className="font-medium">Pro trial</span>
            <span className="text-fg-muted">
              , {left === 1 ? '1 day' : `${left} days`} left
            </span>
          </p>
          <Link
            href="/billing"
            className="rounded-sm text-sm font-medium text-accent hover:underline focus-ring-surface"
          >
            Upgrade
          </Link>
        </div>
        <Progress
          value={used}
          max={TRIAL_LENGTH_DAYS}
          tone={left <= 3 ? 'warning' : 'accent'}
          aria-label={`Trial: ${left} of ${TRIAL_LENGTH_DAYS} days left`}
        />
      </div>
    )
  }

  if (plan.id === 'free') {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-line p-3">
        <p className="text-sm font-medium text-fg">Free plan</p>
        <Link
          href="/billing"
          className="rounded-sm text-sm font-medium text-accent hover:underline focus-ring-surface"
        >
          Upgrade
        </Link>
      </div>
    )
  }

  return null
}

const THEME_ICONS: Record<ThemeChoice, LucideIcon> = { light: Sun, dark: Moon, system: Monitor }

function UserMenu({ user }: { user: SidebarUser }) {
  const [theme, setTheme] = useThemeChoice()
  const display = user.name || user.email?.split('@')[0] || 'Your account'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-md p-2 text-left transition-colors duration-120',
          'hover:bg-sunken data-[popup-open]:bg-sunken focus-ring-surface',
        )}
      >
        <Avatar src={user.image} name={user.name ?? user.email} size="md" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-fg">{display}</span>
          {user.email && <span className="truncate text-xs text-fg-subtle">{user.email}</span>}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-fg-subtle" strokeWidth={1.75} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-[var(--anchor-width)] min-w-[224px]">
        <DropdownMenuLinkItem href="/settings" icon={Settings}>
          Settings
        </DropdownMenuLinkItem>
        <DropdownMenuLinkItem href="/billing" icon={CreditCard}>
          Billing
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeChoice)}>
          {(['light', 'dark', 'system'] as const).map((value) => (
            <DropdownMenuRadioItem key={value} value={value} icon={THEME_ICONS[value]}>
              {value === 'light' ? 'Light' : value === 'dark' ? 'Dark' : 'System'}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={LogOut} onSelect={() => void signOut({ callbackUrl: '/' })}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function AppSidebar({ user, plan, counts, variant = 'desktop', className }: AppSidebarProps) {
  const pathname = usePathname() ?? ''
  return (
    <div
      data-slot="app-sidebar"
      data-variant={variant}
      className={cn(
        'flex h-full w-full flex-col bg-surface',
        variant === 'desktop' && 'border-r border-line',
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center px-4">
        <Logo href="/dashboard" />
      </div>

      <div className="px-3 pb-3">
        <ButtonLink href="/drafts/new" className="w-full">
          <SquarePen strokeWidth={1.75} aria-hidden="true" />
          Draft a post
        </ButtonLink>
      </div>

      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
        <ul className="flex flex-col gap-0.5">
          {APP_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(pathname, item.href)} count={countFor(item, counts)} />
            </li>
          ))}
        </ul>
        <ul className="mt-4 flex flex-col gap-0.5 border-t border-line pt-4">
          {APP_NAV_SECONDARY.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(pathname, item.href)} count={0} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex shrink-0 flex-col gap-2 px-3 pb-3">
        <PlanRow plan={plan} />
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <UserMenu user={user} />
      </div>
    </div>
  )
}

/**
 * Top bar shown below `lg`: menu button that opens the sidebar in a sheet,
 * the logo, and the primary action as an icon button.
 */
export function AppMobileNav(props: Omit<AppSidebarProps, 'variant' | 'className'>) {
  const [open, setOpen] = React.useState(false)
  const pathname = usePathname()
  const needsYou = props.counts.review + props.counts.ready

  // Close the sheet after navigating.
  React.useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-topbar flex h-14 items-center gap-2 border-b border-line bg-surface px-2 sm:px-4 lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Open navigation"
          className="relative inline-flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 hover:bg-sunken hover:text-fg focus-ring-surface"
        >
          <MenuIcon className="size-5" strokeWidth={1.75} aria-hidden="true" />
          {needsYou > 0 && (
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-surface">
              <span className="sr-only">{needsYou} items need you</span>
            </span>
          )}
        </SheetTrigger>
        <SheetContent side="left" size="md" className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <AppSidebar {...props} variant="sheet" />
        </SheetContent>
      </Sheet>
      <Logo href="/dashboard" />
      <div className="ml-auto">
        <ButtonLink href="/drafts/new" size="sm" aria-label="Draft a post">
          <SquarePen strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">Draft a post</span>
        </ButtonLink>
      </div>
    </header>
  )
}
