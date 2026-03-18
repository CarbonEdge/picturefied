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
