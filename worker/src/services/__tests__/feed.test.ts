import { describe, it, expect, vi } from 'vitest'
import { SimpleTagFeedService } from '../feed'

// ── D1 mock helpers ───────────────────────────────────────────────────────────

interface MockRow {
  [key: string]: unknown
}

function createMockD1(rows: MockRow[] = []) {
  const stmt = {
    bind: vi.fn(() => stmt),
    all: vi.fn(async () => ({ results: rows })),
    first: vi.fn(async () => rows[0] ?? null),
    run: vi.fn(async () => ({ success: true })),
  }
  return {
    prepare: vi.fn(() => stmt),
    _stmt: stmt,
  } as unknown as D1Database & { _stmt: typeof stmt }
}

// ── KV mock helpers ───────────────────────────────────────────────────────────

function createMockKV(initialData: Record<string, string> = {}) {
  const store = new Map(Object.entries(initialData))
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  } as unknown as KVNamespace
}

// ── Sample data ───────────────────────────────────────────────────────────────

function makePostRow(overrides: Partial<MockRow> = {}): MockRow {
  return {
    id: 'post-1',
    author_id: 'user-1',
    author_username: 'alice',
    drive_public_url: 'https://drive.example.com/1',
    title: 'My meme',
    tags: '["funny","cats"]',
    created_at: 1000000,
    like_count: 5,
    view_count: 42,
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SimpleTagFeedService.getByTag', () => {
  it('returns items from KV tag index when available', async () => {
    const tagEntry = JSON.stringify([{ postId: 'post-1', authorId: 'user-1', ts: 1000000 }])
    const db = createMockD1([makePostRow()])
    const tagIndex = createMockKV({ 'tag:funny': tagEntry })
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getByTag('funny', 20)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.postId).toBe('post-1')
    expect(page.items[0]!.authorUsername).toBe('alice')
    expect(page.items[0]!.likeCount).toBe(5)
  })

  it('falls back to D1 when KV index is empty', async () => {
    const db = createMockD1([makePostRow()])
    const tagIndex = createMockKV() // empty
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getByTag('funny', 20)

    expect(page.items).toHaveLength(1)
    expect(db.prepare).toHaveBeenCalled()
  })

  it('returns empty page when nothing found', async () => {
    const db = createMockD1([])
    const tagIndex = createMockKV()
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getByTag('nonexistent', 20)

    expect(page.items).toHaveLength(0)
    expect(page.cursor).toBeUndefined()
  })

  it('sets cursor when result fills the limit', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makePostRow({ id: `post-${i}`, created_at: 1000 - i }),
    )
    const db = createMockD1(rows)
    const tagIndex = createMockKV()
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getByTag('funny', 3) // limit == result count → cursor set

    expect(page.cursor).toBe('998') // last item's created_at
  })

  it('omits cursor when result is smaller than limit', async () => {
    const db = createMockD1([makePostRow()])
    const tagIndex = createMockKV()
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getByTag('funny', 20) // limit > result count

    expect(page.cursor).toBeUndefined()
  })
})

describe('SimpleTagFeedService.getFollowing', () => {
  it('returns posts from followed users', async () => {
    const db = createMockD1([makePostRow()])
    const tagIndex = createMockKV()
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getFollowing('user-2', 20)

    expect(page.items).toHaveLength(1)
    expect(db.prepare).toHaveBeenCalled()
  })
})

describe('SimpleTagFeedService.getByUser', () => {
  it('returns posts by username', async () => {
    const db = createMockD1([makePostRow()])
    const tagIndex = createMockKV()
    const feedCache = createMockKV()

    const svc = new SimpleTagFeedService(db, tagIndex, feedCache)
    const page = await svc.getByUser('alice', 20)

    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.authorUsername).toBe('alice')
  })
})
