import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { Redis } from 'ioredis'

interface RateLimitOptions {
  /** Key prefix for Redis. */
  prefix: string
  /** Max requests in the window. */
  limit: number
  /** Window size in seconds. */
  windowSeconds: number
  /** Key resolver — defaults to IP address. */
  keyFn?: (c: import('hono').Context) => string
}

export function rateLimit(redis: Redis, opts: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    const key = opts.keyFn
      ? opts.keyFn(c)
      : (c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown')

    const redisKey = `rl:${opts.prefix}:${key}`
    const current = await redis.incr(redisKey)

    if (current === 1) {
      await redis.expire(redisKey, opts.windowSeconds)
    }

    c.header('X-RateLimit-Limit', String(opts.limit))
    c.header('X-RateLimit-Remaining', String(Math.max(0, opts.limit - current)))

    if (current > opts.limit) {
      throw new HTTPException(429, { message: 'Too many requests' })
    }

    await next()
  })
}
