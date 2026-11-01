import type { Currency } from '@/lib/billing/catalog'
import type { PricingViewer } from '@/components/landing/pricing/pricing-logic'
import { MarketingShell } from '@/components/landing/marketing-shell'
import { Hero } from '@/components/landing/hero'
import { HowItWorks } from '@/components/landing/how-it-works'
import { ShipMoments } from '@/components/landing/ship-moments'
import { VoicePreview } from '@/components/landing/voice-preview'
import { Publishing } from '@/components/landing/publishing'
import { Trust } from '@/components/landing/trust'
import { PricingSection } from '@/components/landing/pricing-section'
import { Faq } from '@/components/landing/faq'
import { CtaBand } from '@/components/landing/cta-band'

export interface LandingContentProps {
  currency?: Currency
  viewer?: PricingViewer
}

/**
 * The marketing page. Sections follow a visitor's questions in order: what is
 * it, how does it work (with the real queue), when does it post, will it
 * sound like me, how does it publish, is my code safe, and what does it cost.
 * Visual and text sections alternate so it doesn't read as one long document.
 */
export function LandingContent({ currency = 'USD', viewer = { signedIn: false } }: LandingContentProps) {
  return (
    <MarketingShell signedIn={viewer.signedIn}>
      <Hero />
      <HowItWorks />
      <ShipMoments />
      <VoicePreview />
      <Publishing />
      <Trust />
      <PricingSection currency={currency} viewer={viewer} />
      <Faq />
      <CtaBand signedIn={viewer.signedIn} />
    </MarketingShell>
  )
}
