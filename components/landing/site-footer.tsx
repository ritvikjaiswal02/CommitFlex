import Link from 'next/link'
import { Logo } from '@/components/brand/logo'
import { ThemeToggle } from '@/components/ui/theme'

type FooterColumn = { title: string; links: { href: string; label: string }[] }

function columns(signedIn: boolean): FooterColumn[] {
  return [
  {
    title: 'Product',
    links: [
      { href: '/#how-it-works', label: 'How it works' },
      { href: '/#ship-moments', label: 'Ship moments' },
      { href: '/#publishing', label: 'Publishing' },
      { href: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Account',
    // Signed-out visitors would only bounce off Billing and Settings to the login page.
    links: signedIn
      ? [
          { href: '/dashboard', label: 'Today' },
          { href: '/extension', label: 'Chrome extension' },
          { href: '/billing', label: 'Billing' },
          { href: '/settings', label: 'Settings' },
        ]
      : [
          { href: '/login', label: 'Sign in' },
          { href: '/login?next=%2Fdashboard', label: 'Start with GitHub' },
        ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/terms', label: 'Terms of service' },
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms#refunds', label: 'Cancellation and refunds' },
    ],
  },
  ]
}

export function SiteFooter({ signedIn = false }: { signedIn?: boolean }) {
  const COLUMNS = columns(signedIn)
  return (
    <footer className="border-t border-line bg-canvas">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 py-12 sm:px-6 md:grid-cols-12 lg:px-8">
        <div className="flex flex-col gap-4 md:col-span-5">
          <Logo href="/" />
          <p className="max-w-[36ch] text-sm text-fg-muted">
            Turns what you ship on GitHub into LinkedIn and X posts in your own voice, then queues and publishes them.
          </p>
          <ThemeToggle size="sm" className="self-start" />
        </div>

        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-7">
          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-fg">{column.title}</h2>
              <ul className="flex flex-col gap-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-sm text-sm text-fg-muted transition-colors duration-120 ease-out hover:text-fg focus-ring"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-5 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} CommitFlex</p>
          <p>Payments are processed by Razorpay. LinkedIn and X are trademarks of their owners.</p>
        </div>
      </div>
    </footer>
  )
}
