import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Schibsted_Grotesk } from 'next/font/google'
import { ThemeProvider } from '@/components/ui/theme'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import './globals.css'

const sans = Schibsted_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s · CommitFlex',
    default: 'CommitFlex: your commits, posted',
  },
  description:
    'CommitFlex turns what you ship on GitHub into LinkedIn and X posts in your own voice, then queues and publishes them for you.',
  applicationName: 'CommitFlex',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F5F8' },
    { media: '(prefers-color-scheme: dark)', color: '#0E1120' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
      <body>
        <ThemeProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
