export type PostPlatform = 'linkedin' | 'twitter'
export type PostStatus = 'generated' | 'edited' | 'copied' | 'archived' | 'published'

export const POST_PLATFORMS: readonly PostPlatform[] = ['linkedin', 'twitter'] as const

export interface PostDraft {
  id: string
  jobId: string
  userId: string
  narrativeId: string
  summaryId: string
  generationModel: string
  platform: PostPlatform
  sequenceNumber: number
  status: PostStatus
  title?: string
  hook?: string
  originalContent: string
  editedContent?: string
  editedAt?: Date
  contentHash: string
  generationStage: string
  platformMetadata: Record<string, unknown>
  regenerationCount: number
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}
