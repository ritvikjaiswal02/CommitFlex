export interface CommitSummary {
  sha: string
  summary: string
  tags: string[]
  significance: number
}

export interface Narrative {
  theme: string
  story: string
  keyPoints: string[]
  technicalDepth: number
}

export interface GeneratedPost {
  platform: 'linkedin' | 'twitter'
  content: string
  hashtags: string[]
  callToAction?: string
}
