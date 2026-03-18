import { Hono } from 'hono'
import type { Env } from '../index'
import { getSession, extractBearerToken } from '../lib/session'
import { SimpleTagFeedService } from '../services/feed'

export const feedRoutes = new Hono<{ Bindings: Env }>()

// GET /feed/tag/:tag — public tag feed
feedRoutes.get('/tag/:tag', async (c) => {
  const tag = c.req.param('tag')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)
  const cursor = c.req.query('cursor')

  const feedService = new SimpleTagFeedService(c.env.DB, c.env.TAG_INDEX, c.env.FEED_CACHE)
  const page = await feedService.getByTag(tag, limit, cursor)
  return c.json(page)
})

// GET /feed/following — authenticated following feed
feedRoutes.get('/following', async (c) => {
  const token = extractBearerToken(c.req.header('authorization'))
  if (!token) return c.json({ error: 'Unauthorized' }, 401)

  const session = await getSession(c.env.SESSIONS, token)
  if (!session) return c.json({ error: 'Unauthorized' }, 401)

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)
  const cursor = c.req.query('cursor')

  const feedService = new SimpleTagFeedService(c.env.DB, c.env.TAG_INDEX, c.env.FEED_CACHE)
  const page = await feedService.getFollowing(session.userId, limit, cursor)
  return c.json(page)
})

// GET /feed/user/:username — public user feed
feedRoutes.get('/user/:username', async (c) => {
  const username = c.req.param('username')
  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100)
  const cursor = c.req.query('cursor')

  const feedService = new SimpleTagFeedService(c.env.DB, c.env.TAG_INDEX, c.env.FEED_CACHE)
  const page = await feedService.getByUser(username, limit, cursor)
  return c.json(page)
})
