'use client'

import * as React from 'react'
import { isPlanErrorBody, type PaidPlanId, type PlanId } from '@/lib/billing/catalog'
import { UpgradeDialog, type UpgradeReason } from './upgrade-dialog'

export interface UpgradeContextValue {
  /** Opens the upgrade dialog. Outside a provider it navigates to /pricing. */
  openUpgrade: (reason?: UpgradeReason, requiredPlan?: PaidPlanId) => void
  /**
   * Reads a 402 response (from a clone, so the caller can still read it),
   * opens the dialog with the reason and returns true. Anything else: false.
   */
  handlePlanError: (res: Response) => Promise<boolean>
}

const UpgradeContext = React.createContext<UpgradeContextValue | null>(null)

const FALLBACK: UpgradeContextValue = {
  openUpgrade: () => {
    if (typeof window !== 'undefined') window.location.assign('/pricing')
  },
  handlePlanError: async () => false,
}

interface DialogState {
  open: boolean
  reason?: UpgradeReason
  requiredPlan?: PaidPlanId
  currentPlan?: PlanId
}

export interface UpgradeProviderProps {
  children: React.ReactNode
  /** The viewer's plan, when the page already knows it. 402 bodies override it. */
  currentPlan?: PlanId
}

/**
 * Hosts one UpgradeDialog for everything below it. AppShell, the pricing page
 * and the billing page each wrap themselves in one; the innermost wins.
 */
export function UpgradeProvider({ children, currentPlan }: UpgradeProviderProps) {
  const [state, setState] = React.useState<DialogState>({ open: false })

  const openUpgrade = React.useCallback(
    (reason?: UpgradeReason, requiredPlan?: PaidPlanId) => {
      setState({ open: true, reason: reason ?? { code: 'manual' }, requiredPlan, currentPlan })
    },
    [currentPlan],
  )

  const handlePlanError = React.useCallback(async (res: Response) => {
    if (res.status !== 402) return false
    let body: unknown
    try {
      body = await res.clone().json()
    } catch {
      return false
    }
    if (!isPlanErrorBody(body)) return false
    const reason: UpgradeReason =
      body.code === 'feature_locked'
        ? { code: 'feature_locked', feature: body.feature }
        : { code: 'limit_reached', limit: body.limit, used: body.used, max: body.max }
    setState({ open: true, reason, requiredPlan: body.requiredPlan, currentPlan: body.currentPlan })
    return true
  }, [])

  const value = React.useMemo(() => ({ openUpgrade, handlePlanError }), [openUpgrade, handlePlanError])

  return (
    <UpgradeContext.Provider value={value}>
      {children}
      <UpgradeDialog
        open={state.open}
        onOpenChange={(open) => setState((s) => ({ ...s, open }))}
        reason={state.reason}
        requiredPlan={state.requiredPlan}
        currentPlan={state.currentPlan ?? currentPlan}
      />
    </UpgradeContext.Provider>
  )
}

export function useUpgrade(): UpgradeContextValue {
  return React.useContext(UpgradeContext) ?? FALLBACK
}
