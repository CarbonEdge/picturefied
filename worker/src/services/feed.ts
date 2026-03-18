/**
 * FeedService interface and implementations.
 *
 * SimpleTagFeedService reads KV tag index and hydrates from D1.
 * Future: swap in AlgorithmicFeedService with engagement-weighted ranking.
 */

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

export interface FeedService {
  getByTag(tag: string, limit: number, cursor?: string): Promise<FeedPage>
  getFollowing(userId: string, limit: number, cursor?: string): Promise<FeedPage>
  getByUser(username: string, limit: number, cursor?: string): Promise<FeedPage>
}

interface TagIndexEntry {
  postId: string
  authorId: string
  ts: number
}

interface PostRow {
  id: string
  author_id: string
  author_username: string
  drive_public_url: string | null
  title: string | null
  tags: string
  created_at: number
  like_count: number
  view_count: number
}

function formatFeedPage(rows: PostRow[], limit: number): FeedPage {
  const items: FeedItem[] = rows.map((row) => ({
    postId: row.id,
    authorId: row.author_id,
    authorUsername: row.author_username,
    drivePublicUrl: row.drive_public_url ?? '',
    title: row.title ?? undefined,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    likeCount: row.like_count,
    viewCount: row.view_count,
  }))

  const last = items[items.length - 1]
  const cursor = items.length === limit && last ? String(last.createdAt) : undefined

  return { items, cursor }
}

const COUNTS_SUBQUERY = `
  (SELECT COUNT(*) FROM engagement e WHERE e.post_id = p.id AND e.type = 'like') as like_count,
  (SELECT COUNT(*) FROM engagement e WHERE e.post_id = p.id AND e.type = 'view') as view_count
`

export class SimpleTagFeedService implements FeedService {
  constructor(
    private db: D1Database,
    private tagIndex: KVNamespace,
    feedCache: KVNamespace,
  ) {
    // feedCache reserved for future algorithmic feed caching
    void feedCache
  }

  async getByTag(tag: string, limit: number, cursor?: string): Promise<FeedPage> {
    // Try KV tag index first (recent posts)
    const rawIndex = await this.tagIndex.get(`tag:${tag}`)
    let entries: TagIndexEntry[] = rawIndex
      ? (JSON.parse(rawIndex) as TagIndexEntry[])
      : []

    const cursorTs = cursor ? parseInt(cursor, 10) : undefined
    if (cursorTs) {
      entries = entries.filter((e) => e.ts < cursorTs)
    }
    entries = entries.slice(0, limit)

    if (entries.length === 0) {
      return this.getByTagFromD1(tag, limit, cursor)
    }

    const postIds = entries.map((e) => e.postId)
    return this.hydratePostIds(postIds)
  }

  private async getByTagFromD1(tag: string, limit: number, cursor?: string): Promise<FeedPage> {
    const cursorTs = cursor ? parseInt(cursor, 10) : undefined
    const cursorClause = cursorTs ? 'AND p.created_at < ?' : ''
    const query = `
      SELECT p.id, p.author_id, u.username as author_username,
        p.drive_public_url, p.title, p.tags, p.created_at,
        ${COUNTS_SUBQUERY}
      FROM posts p
      JOIN users u ON u.id = p.author_id, json_each(p.tags)
      WHERE p.is_public = 1 AND json_each.value = ?
        ${cursorClause}
      ORDER BY p.created_at DESC LIMIT ?
    `
    const params: (string | number)[] = cursorTs ? [tag, cursorTs, limit] : [tag, limit]
    const result = await this.db.prepare(query).bind(...params).all<PostRow>()
    return formatFeedPage(result.results ?? [], limit)
  }

  async getFollowing(userId: string, limit: number, cursor?: string): Promise<FeedPage> {
    const cursorTs = cursor ? parseInt(cursor, 10) : undefined
    const cursorClause = cursorTs ? 'AND p.created_at < ?' : ''
    const query = `
      SELECT p.id, p.author_id, u.username as author_username,
        p.drive_public_url, p.title, p.tags, p.created_at,
        ${COUNTS_SUBQUERY}
      FROM posts p
      JOIN users u ON u.id = p.author_id
      JOIN follows f ON f.following_id = p.author_id
      WHERE f.follower_id = ? AND p.is_public = 1
        ${cursorClause}
      ORDER BY p.created_at DESC LIMIT ?
    `
    const params: (string | number)[] = cursorTs
      ? [userId, cursorTs, limit]
      : [userId, limit]
    const result = await this.db.prepare(query).bind(...params).all<PostRow>()
    return formatFeedPage(result.results ?? [], limit)
  }

  async getByUser(username: string, limit: number, cursor?: string): Promise<FeedPage> {
    const cursorTs = cursor ? parseInt(cursor, 10) : undefined
    const cursorClause = cursorTs ? 'AND p.created_at < ?' : ''
    const query = `
      SELECT p.id, p.author_id, u.username as author_username,
        p.drive_public_url, p.title, p.tags, p.created_at,
        ${COUNTS_SUBQUERY}
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE u.username = ? AND p.is_public = 1
        ${cursorClause}
      ORDER BY p.created_at DESC LIMIT ?
    `
    const params: (string | number)[] = cursorTs
      ? [username, cursorTs, limit]
      : [username, limit]
    const result = await this.db.prepare(query).bind(...params).all<PostRow>()
    return formatFeedPage(result.results ?? [], limit)
  }

  private async hydratePostIds(postIds: string[]): Promise<FeedPage> {
    if (postIds.length === 0) return { items: [] }
    const placeholders = postIds.map(() => '?').join(',')
    const query = `
      SELECT p.id, p.author_id, u.username as author_username,
        p.drive_public_url, p.title, p.tags, p.created_at,
        ${COUNTS_SUBQUERY}
      FROM posts p
      JOIN users u ON u.id = p.author_id
      WHERE p.id IN (${placeholders})
      ORDER BY p.created_at DESC
    `
    const result = await this.db.prepare(query).bind(...postIds).all<PostRow>()
    return formatFeedPage(result.results ?? [], postIds.length)
  }
}
