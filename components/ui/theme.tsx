'use client'

import * as React from 'react'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { SegmentedControl } from '@/components/ui/segmented-control'

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}

/** Current theme choice, or 'system' until mounted (avoids a hydration mismatch). */
export function useThemeChoice(): [ThemeChoice, (value: ThemeChoice) => void] {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const current: ThemeChoice =
    mounted && (theme === 'light' || theme === 'dark' || theme === 'system') ? theme : 'system'
  return [current, (value) => setTheme(value)]
}

export function ThemeToggle({
  size = 'sm',
  iconOnly = false,
  className,
}: {
  size?: 'sm' | 'md'
  iconOnly?: boolean
  className?: string
}) {
  const [theme, setTheme] = useThemeChoice()
  return (
    <SegmentedControl
      aria-label="Theme"
      size={size}
      iconOnly={iconOnly}
      value={theme}
      onValueChange={setTheme}
      options={THEME_OPTIONS}
      className={className}
    />
  )
}
