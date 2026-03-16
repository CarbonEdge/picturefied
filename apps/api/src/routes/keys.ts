import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { userKeys, users } from '../db/schema.js'
import { requireAuth } from '../middleware/auth.js'

// ─── Schemas ──────────────────────────────────────────────────────────────────

const UpsertKeysSchema = z.object({
  identity: z.object({
    publicKey:           z.string(),
    encryptedPrivateKey: z.string(),
  }),
  signing: z.object({
    publicKey:           z.string(),
    encryptedPrivateKey: z.string(),
  }),
})

// ─── Routes ───────────────────────────────────────────────────────────────────

const keys = new Hono()

/**
 * GET /keys/me
 * Return own public keys + encrypted private key bundles.
 * Used on login to reconstruct the in-memory keystore.
 */
keys.get('/me', requireAuth, async (c) => {
  const userId = c.get('userId')
  const rows = await db
    .select()
    .from(userKeys)
    .where(and(eq(userKeys.userId, userId), isNull(userKeys.revokedAt)))

  const identity = rows.find((r) => r.keyType === 'identity')
  const signing  = rows.find((r) => r.keyType === 'signing')

  if (!identity || !signing) return c.json({ keys: null })

  return c.json({
    keys: {
      identity: {
        publicKey:           Buffer.from(identity.publicKey!).toString('base64url'),
        encryptedPrivateKey: Buffer.from(identity.encryptedPrivateKey!).toString('base64url'),
        version:             identity.version,
      },
      signing: {
        publicKey:           Buffer.from(signing.publicKey!).toString('base64url'),
        encryptedPrivateKey: Buffer.from(signing.encryptedPrivateKey!).toString('base64url'),
        version:             signing.version,
      },
    },
  })
})

/**
 * PUT /keys/me
 * Upload or rotate key material. Replaces existing keys atomically.
 * Called once on registration; again on key rotation.
 */
keys.put('/me', requireAuth, zValidator('json', UpsertKeysSchema), async (c) => {
  const userId = c.get('userId')
  const body   = c.req.valid('json')

  // Revoke all existing keys
  await db.update(userKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(userKeys.userId, userId), isNull(userKeys.revokedAt)))

  // Insert new key rows
  await db.insert(userKeys).values([
    {
      userId,
      keyType:             'identity',
      algorithm:           'x25519',
      publicKey:           Buffer.from(body.identity.publicKey, 'base64url'),
      encryptedPrivateKey: Buffer.from(body.identity.encryptedPrivateKey, 'base64url'),
    },
    {
      userId,
      keyType:             'signing',
      algorithm:           'ed25519',
      publicKey:           Buffer.from(body.signing.publicKey, 'base64url'),
      encryptedPrivateKey: Buffer.from(body.signing.encryptedPrivateKey, 'base64url'),
    },
  ])

  return c.json({ ok: true })
})

/**
 * GET /keys/user/:handle
 * Return another user's public identity key (for future user-to-user sharing).
 * Only returns the public key — never private key material.
 */
keys.get('/user/:handle', requireAuth, async (c) => {
  const handle = c.req.param('handle')

  const rows = await db
    .select({ publicKey: userKeys.publicKey })
    .from(userKeys)
    .innerJoin(users, eq(users.id, userKeys.userId))
    .where(and(
      eq(users.handle, handle),
      eq(userKeys.keyType, 'identity'),
      isNull(userKeys.revokedAt),
      isNull(users.deletedAt),
    ))
    .limit(1)

  if (!rows[0]) throw new HTTPException(404, { message: 'User not found' })

  return c.json({
    handle,
    identityPublicKey: Buffer.from(rows[0].publicKey!).toString('base64url'),
  })
})

export default keys
