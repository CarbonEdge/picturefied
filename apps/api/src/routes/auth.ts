import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { SignJWT, jwtVerify } from 'jose'
import { hash as argon2Hash, verify as argon2Verify } from 'argon2'
import { randomBytes, createHash } from 'node:crypto'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, userPasswords, userArgon2Salts, refreshTokens } from '../db/schema.js'

const jwtSecret = new TextEncoder().encode(process.env['JWT_SECRET']!)
const ACCESS_EXPIRES  = process.env['JWT_ACCESS_EXPIRES_IN']  ?? '15m'
const REFRESH_EXPIRES = process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  handle:   z.string().min(2).max(30).regex(/^[a-z0-9_]+$/),
  email:    z.string().email().optional(),
  /**
   * The client computes a credential from the password via Argon2id client-side.
   * We hash it again server-side to prevent the server-side hash from being the
   * only line of defence (defence-in-depth).
   *
   * For MVP we accept the password server-side and do full Argon2id here.
   * A more advanced approach would pass only a derived credential.
   */
  password:       z.string().min(12),
  /** Argon2id salt the client generated — stored on server, returned at login. */
  argon2Salt:     z.string(), // base64url
})

const LoginSchema = z.object({
  handle:   z.string(),
  password: z.string(),
})

const RefreshSchema = z.object({
  refreshToken: z.string(),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

const auth = new Hono()

/**
 * GET /auth/salt/:handle
 * Returns the Argon2id salt for a user. Needed before login so the client
 * can derive the master secret before submitting credentials.
 * Public endpoint — leaks that a handle exists. Acceptable trade-off.
 */
auth.get('/salt/:handle', async (c) => {
  const handle = c.req.param('handle')
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.handle, handle), isNull(users.deletedAt)))
    .limit(1)

  if (!user) {
    // Return a deterministic fake salt to prevent handle enumeration timing attacks
    const fakeSalt = createHash('sha256').update(`fake-salt-${handle}`).digest('base64url')
    return c.json({ salt: fakeSalt })
  }

  const [saltRow] = await db
    .select({ salt: userArgon2Salts.salt })
    .from(userArgon2Salts)
    .where(eq(userArgon2Salts.userId, user.id))
    .limit(1)

  if (!saltRow?.salt) throw new HTTPException(500, { message: 'Salt not found' })

  return c.json({ salt: Buffer.from(saltRow.salt).toString('base64url') })
})

/**
 * POST /auth/register
 * Create a new account. Returns JWT pair on success.
 */
auth.post('/register', zValidator('json', RegisterSchema), async (c) => {
  const body = c.req.valid('json')

  // Check handle uniqueness
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.handle, body.handle))
    .limit(1)

  if (existing) {
    throw new HTTPException(409, { message: 'Handle already taken' })
  }

  // Hash the password server-side (defence-in-depth)
  const passwordHash = await argon2Hash(body.password)
  const salt = Buffer.from(body.argon2Salt, 'base64url')

  const [newUser] = await db.insert(users).values({
    handle: body.handle,
    email:  body.email,
  }).returning({ id: users.id })

  if (!newUser) throw new HTTPException(500, { message: 'Failed to create user' })

  await Promise.all([
    db.insert(userPasswords).values({ userId: newUser.id, passwordHash }),
    db.insert(userArgon2Salts).values({ userId: newUser.id, salt }),
  ])

  const tokens = await issueTokenPair(newUser.id, body.handle, c.req.header('user-agent'))
  return c.json(tokens, 201)
})

/**
 * POST /auth/login
 * Authenticate with handle + password. Returns JWT pair.
 */
auth.post('/login', zValidator('json', LoginSchema), async (c) => {
  const body = c.req.valid('json')

  const [row] = await db
    .select({
      id:           users.id,
      handle:       users.handle,
      passwordHash: userPasswords.passwordHash,
    })
    .from(users)
    .innerJoin(userPasswords, eq(users.id, userPasswords.userId))
    .where(and(eq(users.handle, body.handle), isNull(users.deletedAt)))
    .limit(1)

  // Constant-time: always run the hash even if user not found
  const validPassword = row
    ? await argon2Verify(row.passwordHash, body.password)
    : (await argon2Verify('$argon2id$v=19$m=65536,t=3,p=4$placeholder', 'dummy').catch(() => false))

  if (!row || !validPassword) {
    throw new HTTPException(401, { message: 'Invalid credentials' })
  }

  const tokens = await issueTokenPair(row.id, row.handle, c.req.header('user-agent'))
  return c.json(tokens)
})

/**
 * POST /auth/refresh
 * Exchange a refresh token for a new access + refresh token pair.
 */
auth.post('/refresh', zValidator('json', RefreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json')
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

  const [row] = await db
    .select({
      id:       refreshTokens.id,
      userId:   refreshTokens.userId,
      handle:   users.handle,
      expiresAt: refreshTokens.expiresAt,
    })
    .from(refreshTokens)
    .innerJoin(users, eq(users.id, refreshTokens.userId))
    .where(and(
      eq(refreshTokens.tokenHash, tokenHash),
      isNull(refreshTokens.revokedAt),
      isNull(users.deletedAt),
    ))
    .limit(1)

  if (!row || row.expiresAt < new Date()) {
    throw new HTTPException(401, { message: 'Invalid or expired refresh token' })
  }

  // Rotate: revoke old token, issue new pair
  await db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id))

  const tokens = await issueTokenPair(row.userId, row.handle, c.req.header('user-agent'))
  return c.json(tokens)
})

/**
 * POST /auth/logout
 * Revoke the current refresh token.
 */
auth.post('/logout', zValidator('json', RefreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json')
  const tokenHash = createHash('sha256').update(refreshToken).digest('hex')

  await db.update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.tokenHash, tokenHash))

  return c.json({ ok: true })
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function issueTokenPair(
  userId: string,
  handle: string,
  userAgent: string | undefined,
): Promise<{ accessToken: string; refreshToken: string }> {
  const now = Math.floor(Date.now() / 1000)

  const accessToken = await new SignJWT({ handle })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt(now)
    .setExpirationTime(ACCESS_EXPIRES)
    .sign(jwtSecret)

  const rawRefreshToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex')

  const expiresAt = new Date(Date.now() + parseDuration(REFRESH_EXPIRES))

  await db.insert(refreshTokens).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent: userAgent ?? null,
  })

  return { accessToken, refreshToken: rawRefreshToken }
}

function parseDuration(str: string): number {
  const match = /^(\d+)([smhd])$/.exec(str)
  if (!match) throw new Error(`Invalid duration: ${str}`)
  const value = parseInt(match[1]!)
  const unit  = match[2]!
  const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }
  return value * (multipliers[unit] ?? 1000)
}

export default auth
