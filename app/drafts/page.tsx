import { redirect } from 'next/navigation'

/**
 * Drafts now live in the Queue: drafts that were never queued are its
 * Unqueued tab. Old links and bookmarks land there.
 */
export default function DraftsPage() {
  redirect('/queue?tab=unqueued')
}
