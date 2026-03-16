/**
 * Test helpers — mock DB factory and JWT utilities for API route tests.
 *
 * Instead of hitting a real database, each test wires up a mock that returns
 * controlled data. This makes route tests fast, deterministic, and dependency-free.
 */

import { vi } from 'vitest'
import { Hono } from 'hono'
import { SignJWT } from 'jose'

// ─── JWT helpers ─────────────────────────────────────────────────────────────

const TEST_JWT_SECRET = new TextEncoder().encode(
  'test-jwt-secret-that-is-at-least-64-characters-long-for-hs256-algorithm',
)

export async function signTestToken(payload: { sub: string; handle: string }): Promise<string> {
  return new SignJWT({ handle: payload.handle })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(TEST_JWT_SECRET)
}

export const TEST_USER_ID = '00000000-0000-0000-0000-000000000001'
export const TEST_HANDLE  = 'testuser'

export async function authHeader(): Promise<string> {
  const token = await signTestToken({ sub: TEST_USER_ID, handle: TEST_HANDLE })
  return `Bearer ${token}`
}

// ─── Mock DB factory ──────────────────────────────────────────────────────────

/**
 * Create a chainable mock for Drizzle's query builder.
 * Each chained method returns `this` so you can compose:
 *   db.select().from().where().limit() → resolves to `finalValue`
 */
export function createMockDb(overrides: Record<string, unknown> = {}) {
  const mock: Record<string, unknown> = {
    // Chainable query builder methods
    select:    vi.fn().mockReturnThis(),
    from:      vi.fn().mockReturnThis(),
    where:     vi.fn().mockReturnThis(),
    limit:     vi.fn().mockResolvedValue([]),
    orderBy:   vi.fn().mockReturnThis(),
    leftJoin:  vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),

    // Mutation methods
    insert:     vi.fn().mockReturnThis(),
    values:     vi.fn().mockReturnThis(),
    returning:  vi.fn().mockResolvedValue([]),
    onConflictDoNothing: vi.fn().mockResolvedValue({ count: 0 }),

    update:  vi.fn().mockReturnThis(),
    set:     vi.fn().mockReturnThis(),
    // update().set().where() returns a result with a count
    // We need where() to return something that has `count`
    delete:  vi.fn().mockReturnThis(),

    execute: vi.fn().mockResolvedValue([]),
  }

  // Merge overrides
  for (const [key, value] of Object.entries(overrides)) {
    mock[key] = value
  }

  return mock
}

// ─── Request helpers ──────────────────────────────────────────────────────────

export function json(body: unknown): Request {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
}

export async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>
}
