export interface FeedItem {
  postId: string
  authorId: string
  authorUsername: string
  drivePublicUrl: string
  title?: string
  tags: string[]
  createdAt: number
  likeCount: number
  viewCount: number
}

export interface FeedPage {
  items: FeedItem[]
  cursor?: string
}

export interface Post {
  id: string
  driveFileId: string
  drivePublicUrl: string | null
  title: string | null
  tags: string[]
  isPublic: boolean
  createdAt: number
}
