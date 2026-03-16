import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { jwtVerify } from 'jose'

export interface JWTPayload {
  sub: string       // userId
  handle: string
  iat: number
  exp: number
}

declare module 'hono' {
  interface ContextVariableMap {
    userId: string
    userHandle: string
  }
}

const secret = process.env['JWT_SECRET']
if (!secret) throw new Error('JWT_SECRET is required')

const jwtSecret = new TextEncoder().encode(secret)

export const requireAuth = createMiddleware(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    throw new HTTPException(401, { message: 'Missing or malformed Authorization header' })
  }

  const token = header.slice(7)
  try {
    const { payload } = await jwtVerify(token, jwtSecret)
    c.set('userId', payload['sub'] as string)
    c.set('userHandle', payload['handle'] as string)
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired token' })
  }

  await next()
})
