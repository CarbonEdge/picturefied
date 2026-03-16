/**
 * IndexManager tests — validates the encrypted index CRUD operations.
 *
 * We mock the DriveAdapter so no real Drive calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IndexManager } from '../lib/index-manager'
import type { FileEntry, AlbumEntry, ShareEntry } from '../lib/index-manager'

// ─── Mock Drive adapter ───────────────────────────────────────────────────────

function makeMockDrive() {
  let storedIndex: Uint8Array | null = null
  return {
    readIndex:  vi.fn(async () => storedIndex),
    writeIndex: vi.fn(async (bytes: Uint8Array) => { storedIndex = bytes }),
  }
}

function makeIndexKey(): Uint8Array {
  return new Uint8Array(32).fill(0xAB)
}

function makeFileEntry(overrides: Partial<FileEntry> = {}): FileEntry {
  return {
    id: 'file-1',
    name: 'photo.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    blurhash: null,
    driveFileId: 'gdrive-file-1',
    driveThumbId: null,
    wrappedFek: 'base64urlwrappedFEK==',
    uploadedAt: '2026-01-01T00:00:00.000Z',
    albumIds: [],
    ...overrides,
  }
}

function makeAlbum(overrides: Partial<AlbumEntry> = {}): AlbumEntry {
  return {
    id: 'album-1',
    name: 'Vacation',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeShare(overrides: Partial<ShareEntry> = {}): ShareEntry {
  return {
    id: 'share-token-1',
    fileId: 'file-1',
    linkWrappedFek: 'base64urlLinkFEK==',
    linkFekDriveId: 'share-token-1',
    expiresAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IndexManager — empty state', () => {
  it('returns empty arrays when no index exists', async () => {
    const drive = makeMockDrive()
    const mgr   = new IndexManager(drive as never, makeIndexKey())

    expect(await mgr.listFiles()).toEqual([])
    expect(await mgr.listAlbums()).toEqual([])
    expect(await mgr.listShares()).toEqual([])
  })

  it('creates index.enc on first write', async () => {
    const drive = makeMockDrive()
    const mgr   = new IndexManager(drive as never, makeIndexKey())

    await mgr.addFile(makeFileEntry())
    expect(drive.writeIndex).toHaveBeenCalledOnce()
  })
})

describe('IndexManager — files', () => {
  let mgr: IndexManager
  let drive: ReturnType<typeof makeMockDrive>

  beforeEach(() => {
    drive = makeMockDrive()
    mgr   = new IndexManager(drive as never, makeIndexKey())
  })

  it('addFile + listFiles round-trip', async () => {
    const entry = makeFileEntry()
    await mgr.addFile(entry)
    const files = await mgr.listFiles()
    expect(files).toHaveLength(1)
    expect(files[0].id).toBe('file-1')
  })

  it('listFiles returns newest first', async () => {
    await mgr.addFile(makeFileEntry({ id: 'old', uploadedAt: '2026-01-01T00:00:00.000Z' }))
    await mgr.addFile(makeFileEntry({ id: 'new', uploadedAt: '2026-06-01T00:00:00.000Z' }))
    const files = await mgr.listFiles()
    expect(files[0].id).toBe('new')
  })

  it('getFile returns the correct entry', async () => {
    await mgr.addFile(makeFileEntry({ id: 'abc' }))
    const found = await mgr.getFile('abc')
    expect(found?.id).toBe('abc')
  })

  it('getFile returns undefined for unknown id', async () => {
    const found = await mgr.getFile('nonexistent')
    expect(found).toBeUndefined()
  })

  it('removeFile deletes the entry', async () => {
    await mgr.addFile(makeFileEntry({ id: 'del' }))
    await mgr.removeFile('del')
    expect(await mgr.listFiles()).toHaveLength(0)
  })

  it('removeFile also removes associated shares', async () => {
    await mgr.addFile(makeFileEntry({ id: 'file-x' }))
    await mgr.addShare(makeShare({ fileId: 'file-x', id: 'share-x' }))
    await mgr.removeFile('file-x')
    expect(await mgr.listShares()).toHaveLength(0)
  })
})

describe('IndexManager — albums', () => {
  let mgr: IndexManager

  beforeEach(() => {
    mgr = new IndexManager(makeMockDrive() as never, makeIndexKey())
  })

  it('createAlbum + listAlbums round-trip', async () => {
    await mgr.createAlbum(makeAlbum())
    expect(await mgr.listAlbums()).toHaveLength(1)
  })

  it('deleteAlbum removes the album', async () => {
    await mgr.createAlbum(makeAlbum({ id: 'a1' }))
    await mgr.deleteAlbum('a1')
    expect(await mgr.listAlbums()).toHaveLength(0)
  })

  it('addFileToAlbum sets albumIds on the file', async () => {
    await mgr.addFile(makeFileEntry({ id: 'f1' }))
    await mgr.createAlbum(makeAlbum({ id: 'a1' }))
    await mgr.addFileToAlbum('f1', 'a1')

    const file = await mgr.getFile('f1')
    expect(file?.albumIds).toContain('a1')
  })

  it('removeFileFromAlbum clears the albumId', async () => {
    await mgr.addFile(makeFileEntry({ id: 'f1' }))
    await mgr.createAlbum(makeAlbum({ id: 'a1' }))
    await mgr.addFileToAlbum('f1', 'a1')
    await mgr.removeFileFromAlbum('f1', 'a1')

    const file = await mgr.getFile('f1')
    expect(file?.albumIds).not.toContain('a1')
  })

  it('addFileToAlbum is idempotent', async () => {
    await mgr.addFile(makeFileEntry({ id: 'f1' }))
    await mgr.addFileToAlbum('f1', 'a1')
    await mgr.addFileToAlbum('f1', 'a1')
    const file = await mgr.getFile('f1')
    expect(file?.albumIds.filter((id) => id === 'a1')).toHaveLength(1)
  })
})

describe('IndexManager — shares', () => {
  let mgr: IndexManager

  beforeEach(() => {
    mgr = new IndexManager(makeMockDrive() as never, makeIndexKey())
  })

  it('addShare + listShares round-trip', async () => {
    await mgr.addShare(makeShare())
    expect(await mgr.listShares()).toHaveLength(1)
  })

  it('revokeShare removes the share', async () => {
    await mgr.addShare(makeShare({ id: 'tok-1' }))
    await mgr.revokeShare('tok-1')
    expect(await mgr.listShares()).toHaveLength(0)
  })

  it('revokeShare returns the removed share', async () => {
    await mgr.addShare(makeShare({ id: 'tok-1' }))
    const removed = await mgr.revokeShare('tok-1')
    expect(removed?.id).toBe('tok-1')
  })

  it('isShareExpired returns false for null expiresAt', () => {
    const share = makeShare({ expiresAt: null })
    expect(mgr.isShareExpired(share)).toBe(false)
  })

  it('isShareExpired returns true for past expiresAt', () => {
    const share = makeShare({ expiresAt: '2020-01-01T00:00:00.000Z' })
    expect(mgr.isShareExpired(share)).toBe(true)
  })

  it('isShareExpired returns false for future expiresAt', () => {
    const share = makeShare({ expiresAt: '2099-01-01T00:00:00.000Z' })
    expect(mgr.isShareExpired(share)).toBe(false)
  })

  it('pruneExpiredShares removes expired shares', async () => {
    await mgr.addShare(makeShare({ id: 'expired', expiresAt: '2020-01-01T00:00:00.000Z' }))
    await mgr.addShare(makeShare({ id: 'valid',   expiresAt: '2099-01-01T00:00:00.000Z' }))
    const pruned = await mgr.pruneExpiredShares()
    expect(pruned).toBe(1)
    expect(await mgr.listShares()).toHaveLength(1)
  })
})
