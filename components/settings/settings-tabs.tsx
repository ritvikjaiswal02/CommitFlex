'use client'

import * as React from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'

export const SETTINGS_TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'voice', label: 'Voice' },
  { value: 'autopilot', label: 'Autopilot' },
  { value: 'connections', label: 'Connections' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'account', label: 'Account' },
] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]['value']

export function isSettingsTab(value: unknown): value is SettingsTab {
  return typeof value === 'string' && SETTINGS_TABS.some((t) => t.value === value)
}

export interface SettingsTabsProps {
  initialTab: SettingsTab
  /** `?linkedin=connected|denied|error` from the LinkedIn OAuth round trip. */
  linkedinReturn?: string | null
  panels: Record<SettingsTab, React.ReactNode>
  /** Badge count per tab, e.g. a connection that needs attention. */
  counts?: Partial<Record<SettingsTab, number>>
}

/** Underline tabs synced to `?tab=` so links like /settings?tab=connections work. */
export function SettingsTabs({ initialTab, linkedinReturn, panels, counts }: SettingsTabsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [tab, setTab] = React.useState<SettingsTab>(initialTab)
  const announced = React.useRef(false)

  React.useEffect(() => {
    if (!linkedinReturn || announced.current) return
    announced.current = true
    if (linkedinReturn === 'connected') toast.success('LinkedIn connected', { description: 'Approved LinkedIn posts now publish directly.' })
    else if (linkedinReturn === 'denied') toast.info('LinkedIn wasn’t connected', { description: 'Nothing changed. Connect it whenever you’re ready.' })
    else if (linkedinReturn === 'error') {
      toast.error('LinkedIn didn’t connect', { description: 'LinkedIn returned an error. Try connecting again.' })
    }
    router.replace(`${pathname}?tab=${tab}`, { scroll: false })
  }, [linkedinReturn, pathname, router, tab])

  // Switching tabs only updates the address bar. A router navigation would
  // re-render the whole (dynamic) page on the server for every click.
  const onChange = (value: string) => {
    if (!isSettingsTab(value)) return
    setTab(value)
    window.history.replaceState(null, '', `${pathname}?tab=${value}`)
  }

  return (
    <Tabs value={tab} onValueChange={onChange} className="gap-8">
      <TabsList aria-label="Settings sections">
        {SETTINGS_TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} count={counts?.[t.value] || undefined}>
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SETTINGS_TABS.map((t) => (
        <TabsContent key={t.value} value={t.value}>
          {panels[t.value]}
        </TabsContent>
      ))}
    </Tabs>
  )
}
