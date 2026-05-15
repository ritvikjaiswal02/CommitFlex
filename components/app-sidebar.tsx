'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { ReactNode } from 'react'

interface AppSidebarProps {
  userName: string | null | undefined
  userEmail: string | null | undefined
  userImage?: string | null
}

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  match?: (p: string) => boolean
}

const Icon = {
  Plus:    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>,
  Dash:    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 8.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25A2.25 2.25 0 0110.5 15.75V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6A2.25 2.25 0 0115.75 3.75H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"/></svg>,
  Drafts:  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM19.5 14.25v4.875a2.625 2.625 0 01-2.625 2.625H5.625a2.625 2.625 0 01-2.625-2.625V7.875A2.625 2.625 0 015.625 5.25H10.5"/></svg>,
  Repo:    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M6.75 15.75h.008v.008H6.75v-.008zM4.5 4.5a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15z"/></svg>,
  Chart:   <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/></svg>,
  Cog:     <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.109-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>,
  Book:    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>,
  Help:    <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"/></svg>,
  Logout:  <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"/></svg>,
}

export function AppSidebar({ userName, userEmail, userImage }: AppSidebarProps) {
  const pathname = usePathname()

  const items: NavItem[] = [
    { href: '/dashboard',    label: 'Dashboard',    icon: Icon.Dash,   match: p => p === '/dashboard' },
    { href: '/drafts',       label: 'Drafts',       icon: Icon.Drafts, match: p => p.startsWith('/drafts') || p.startsWith('/jobs') },
    { href: '/repositories', label: 'Repositories', icon: Icon.Repo,   match: p => p.startsWith('/repositories') },
    { href: '/analytics',    label: 'Analytics',    icon: Icon.Chart,  match: p => p.startsWith('/analytics') },
    { href: '/settings',     label: 'Settings',     icon: Icon.Cog,    match: p => p.startsWith('/settings') },
  ]

  const initial = (userName ?? userEmail ?? '?').charAt(0).toUpperCase()
  const display = userName ?? userEmail?.split('@')[0] ?? 'You'

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 z-40 h-screen w-64 flex-col gap-lg p-md border-r border-white/8 bg-surface-container-lowest">
      {/* Brand + User */}
      <div className="flex flex-col gap-sm">
        <Link
          href="/dashboard"
          className="font-display text-[22px] font-black tracking-tighter text-on-surface hover:opacity-90 transition-opacity"
        >
          Commit<span className="text-primary">Flex</span>
        </Link>
        <div className="flex items-center gap-sm mt-1">
          <div className="w-8 h-8 rounded-full bg-primary/20 ring-1 ring-primary/30 flex items-center justify-center overflow-hidden shrink-0">
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userImage} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display text-sm font-bold text-primary">{initial}</span>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-on-surface truncate">{display}</p>
            {userEmail && (
              <p className="font-mono text-[10px] text-on-surface-variant truncate">{userEmail}</p>
            )}
          </div>
        </div>
      </div>

      {/* + New Generation */}
      <Link
        href="/dashboard?new=1"
        className="btn-primary-solid w-full h-10 rounded-xl text-sm flex items-center justify-center gap-2"
      >
        {Icon.Plus}
        New Generation
      </Link>

      {/* Nav */}
      <nav className="flex flex-col gap-1 grow">
        {items.map(item => {
          const active = item.match ? item.match(pathname) : pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-md px-md py-sm rounded-xl transition-all duration-200 ${
                active
                  ? 'bg-primary/10 text-primary border-l-4 border-primary -ml-[3px] pl-[13px]'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-white/5'
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="text-sm">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Docs / Support */}
      <div className="flex flex-col gap-1 pt-md border-t border-white/8">
        <a href="https://github.com" target="_blank" rel="noopener" className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-on-surface transition-colors">
          {Icon.Book}<span className="text-sm">Docs</span>
        </a>
        <a href="mailto:support@commitflex.dev" className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-on-surface transition-colors">
          {Icon.Help}<span className="text-sm">Support</span>
        </a>
        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="flex items-center gap-md px-md py-sm text-on-surface-variant hover:text-error transition-colors text-left"
        >
          {Icon.Logout}<span className="text-sm">Sign out</span>
        </button>
      </div>
    </aside>
  )
}

export function AppFooter() {
  return (
    <footer className="fixed bottom-0 left-0 lg:left-64 right-0 bg-background/80 backdrop-blur-md border-t border-white/8 z-30">
      <div className="flex flex-col md:flex-row justify-between items-center px-margin py-md gap-md w-full max-w-7xl mx-auto">
        <p className="font-mono text-code-sm text-on-surface-variant">
          © 2026 CommitFlex. Built for the elite.
        </p>
        <div className="flex gap-lg">
          {['Privacy', 'Terms', 'Security', 'Status'].map(s => (
            <a key={s} href="#" className="font-mono text-code-sm text-on-surface-variant hover:text-primary transition-colors">
              {s}
            </a>
          ))}
        </div>
      </div>
    </footer>
  )
}

export function AppShell({
  user,
  children,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null }
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar userName={user.name} userEmail={user.email} userImage={user.image} />
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-5 py-3 border-b border-white/8 bg-background/80 backdrop-blur-md">
        <Link href="/dashboard" className="font-display text-base font-bold tracking-tighter text-on-surface">
          Commit<span className="text-primary">Flex</span>
        </Link>
      </header>
      <main className="lg:ml-64 min-h-screen pb-24">
        <div className="p-5 md:p-margin">{children}</div>
      </main>
      <AppFooter />
    </div>
  )
}
