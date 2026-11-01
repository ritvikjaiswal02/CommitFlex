'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Logo } from '@/components/brand/logo'
import { ButtonLink } from '@/components/ui/button'
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { GitHubButton } from '@/components/landing/github-button'
import { cn } from '@/lib/utils'

export const MARKETING_NAV: { href: string; label: string }[] = [
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#ship-moments', label: 'Ship moments' },
  { href: '/#publishing', label: 'Publishing' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

export function SiteHeader({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname()
  const [open, setOpen] = React.useState(false)

  return (
    <header className="sticky top-0 z-topbar border-b border-line bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-overlay focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md focus-ring"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Logo href="/" />

        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {MARKETING_NAV.map((item) => {
            const active = item.href === pathname
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-120 ease-out focus-ring',
                  active ? 'text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="md">
              Open dashboard
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-md px-2.5 py-1.5 text-sm font-medium text-fg-muted transition-colors duration-120 ease-out hover:text-fg focus-ring sm:inline-flex"
              >
                Sign in
              </Link>
              <GitHubButton size="md" className="hidden sm:inline-flex">
                Start with GitHub
              </GitHubButton>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              aria-label="Open menu"
              className="inline-flex size-9 items-center justify-center rounded-md text-fg-muted transition-colors duration-120 ease-out hover:bg-sunken hover:text-fg focus-ring md:hidden"
            >
              <Menu className="size-5" strokeWidth={1.75} aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" size="md">
              <SheetHeader>
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <SheetBody className="px-3 py-3">
                <nav aria-label="Main" className="flex flex-col">
                  {MARKETING_NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="rounded-md px-3 py-2.5 text-base font-medium text-fg transition-colors duration-120 ease-out hover:bg-sunken focus-ring-surface"
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </SheetBody>
              <SheetFooter className="sm:flex-col-reverse sm:items-stretch sm:justify-start">
                {signedIn ? (
                  <ButtonLink href="/dashboard" size="lg" className="w-full">
                    Open dashboard
                  </ButtonLink>
                ) : (
                  <>
                    <ButtonLink href="/login" variant="secondary" size="lg" className="w-full">
                      Sign in
                    </ButtonLink>
                    <GitHubButton fullWidth>Start with GitHub</GitHubButton>
                  </>
                )}
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
