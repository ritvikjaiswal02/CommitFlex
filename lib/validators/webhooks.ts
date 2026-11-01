import { z } from 'zod'

/**
 * Subsets of GitHub webhook payloads we read. The real payloads are huge, so we
 * validate only the fields we use and tolerate everything else.
 */
const Repository = z.object({
  id: z.number(),
  full_name: z.string(),
  default_branch: z.string().optional(),
})

export const GithubPushPayloadSchema = z.object({
  ref: z.string(),
  before: z.string().optional(),
  after: z.string().optional(),
  repository: Repository,
  pusher: z.object({ name: z.string().optional(), email: z.string().optional().nullable() }).optional(),
  head_commit: z
    .object({
      id: z.string(),
      message: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .nullable()
    .optional(),
  commits: z
    .array(
      z.object({
        id: z.string(),
        message: z.string(),
        timestamp: z.string(),
      }),
    )
    .default([]),
})

const User = z.object({ login: z.string(), type: z.string().optional() }).nullable().optional()

export const GithubPullRequestPayloadSchema = z.object({
  action: z.string(),
  number: z.number().optional(),
  repository: Repository,
  pull_request: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable().optional(),
    html_url: z.string(),
    merged: z.boolean().nullable().optional(),
    merged_at: z.string().nullable().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
    changed_files: z.number().optional(),
    user: User,
    labels: z.array(z.object({ name: z.string() })).optional(),
    base: z.object({ ref: z.string() }).optional(),
  }),
})

export const GithubReleasePayloadSchema = z.object({
  action: z.string(),
  repository: Repository,
  release: z.object({
    id: z.number(),
    tag_name: z.string(),
    name: z.string().nullable().optional(),
    body: z.string().nullable().optional(),
    html_url: z.string(),
    draft: z.boolean().optional().default(false),
    prerelease: z.boolean().optional().default(false),
    author: User,
  }),
})

/** Just enough to find the repo row before verifying the signature. */
export const GithubRepositoryRefSchema = z.object({ repository: Repository })

export type GithubPushPayload = z.infer<typeof GithubPushPayloadSchema>
export type GithubPullRequestPayload = z.infer<typeof GithubPullRequestPayloadSchema>
export type GithubReleasePayload = z.infer<typeof GithubReleasePayloadSchema>
