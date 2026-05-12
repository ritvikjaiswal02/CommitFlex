import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { users, repos, postDrafts, generationJobs } from '@/lib/db/schema'
import { getPrefs, hasEmailedFor, logEmail } from '@/lib/db/queries/notifications'
import { sendEmail } from '@/lib/mailer'
import { GenerationCompleteEmail } from '@/lib/email/templates/generation-complete'

const KIND = 'generation_complete'

function appOrigin(): string {
  return process.env.NEXTAUTH_URL ?? process.env.APP_URL ?? 'http://localhost:3000'
}

/**
 * Sends a "generation complete" email to the user if they have it enabled.
 * Idempotent: if an email already exists for this (jobId, kind) it skips.
 * Never throws — pipeline failures should never block on mail delivery.
 */
export async function notifyJobComplete(jobId: string): Promise<void> {
  try {
    if (await hasEmailedFor(jobId, KIND)) return

    const [job] = await db.select().from(generationJobs).where(eq(generationJobs.id, jobId)).limit(1)
    if (!job) return

    const prefs = await getPrefs(job.userId)
    if (!prefs.emailOnComplete) return

    const [user] = await db.select().from(users).where(eq(users.id, job.userId)).limit(1)
    if (!user?.email) return

    const [repo] = await db.select().from(repos).where(eq(repos.id, job.repoId)).limit(1)
    const draftRows = await db.select({ id: postDrafts.id }).from(postDrafts)
      .where(eq(postDrafts.jobId, jobId))
    const draftCount = draftRows.length

    const firstName = user.name?.split(' ')[0] ?? 'there'
    const jobUrl = `${appOrigin()}/jobs/${jobId}`

    const result = await sendEmail({
      to: user.email,
      subject: `${draftCount} new drafts from ${repo?.fullName ?? 'your repo'}`,
      react: GenerationCompleteEmail({
        firstName,
        repoName: repo?.fullName ?? 'your repo',
        draftCount,
        jobUrl,
      }),
    })

    await logEmail({
      userId: job.userId,
      jobId,
      kind: KIND,
      deliveryStatus: result.ok ? (result.consoleOnly ? 'console-only' : 'sent') : 'failed',
      providerMessageId: result.providerMessageId ?? null,
      errorMessage: result.error ?? null,
    })
  } catch (err) {
    // Last-ditch: never propagate. Log to stderr so it shows up in serverless logs.
    // eslint-disable-next-line no-console
    console.error('[notifyJobComplete] failed', err)
  }
}
