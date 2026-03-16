/**
 * Global test setup for the API test suite.
 *
 * Sets required environment variables before any test module is loaded,
 * so JWT signing, DB config, and storage config are always available.
 */

process.env['JWT_SECRET']            = 'test-jwt-secret-that-is-at-least-64-characters-long-for-hs256-algorithm'
process.env['JWT_ACCESS_EXPIRES_IN'] = '15m'
process.env['JWT_REFRESH_EXPIRES_IN'] = '30d'
process.env['DATABASE_URL']          = 'postgresql://test:test@localhost:5432/test'
process.env['STORAGE_BACKEND']       = 'local'
process.env['STORAGE_ROOT']          = '/tmp/picturefied-test'
process.env['PUBLIC_URL']            = 'http://localhost:3000'
