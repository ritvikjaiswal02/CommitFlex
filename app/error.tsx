'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error('Unhandled error:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center space-y-4 max-w-md">
        <h1 className="text-2xl font-bold text-white">Something went wrong</h1>
        <p className="text-slate-400 text-sm">{error.message || 'An unexpected error occurred'}</p>
        <Button onClick={reset} variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-900">
          Try again
        </Button>
      </div>
    </div>
  )
}
