import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-white">Page not found</h1>
        <p className="text-slate-400 text-sm">The page you are looking for does not exist.</p>
        <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
          Back to dashboard
        </Link>
      </div>
    </div>
  )
}
