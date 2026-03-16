/**
 * IndexManager — the encrypted database that lives in the user's Google Drive.
 *
 * Replaces every server-side database table. The index is a JSON document
 * encrypted with a symmetric key derived from the user's master secret.
 * It lives at picturefied/index.enc in the user's own Google Drive.
 *
 * Schema of the plaintext index:
 * {
 *   version: 1,
 *   files: FileEntry[],
 *   albums: AlbumEntry[],
 *   shares: ShareEntry[],
 * }
 *
 * All FEKs stored here are already wrapped with the owner's X25519 public key.
 * They cannot be read without the owner's private key.
 */

import { encryptMetadata, decryptMetadata } from './crypto'
import type { DriveAdapter } from './storage/gdrive'

// ─── Index types ─────────────────────────────────────────────────────────────

export interface FileEntry {
  id: string                // UUID
  name: string              // original filename (unencrypted — you can see your own filenames)
  mimeType: string
  size: number              // bytes, unencrypted
  blurhash: string | null   // 48-byte perceptual hash, unencrypted for progressive loading
  driveFileId: string       // Google Drive file ID for the encrypted blob
  driveThumbId: string | null  // Google Drive file ID for the encrypted thumbnail
  wrappedFek: string        // base64url — box_seal(FEK, ownerPublicKey)
  uploadedAt: string        // ISO 8601
  albumIds: string[]        // which albums this file belongs to
}

export interface AlbumEntry {
  id: string
  name: string              // album name (unencrypted — you can see your own album names)
  createdAt: string
}

export interface ShareEntry {
  id: string                // share token (random)
  fileId: string
  linkWrappedFek: string    // base64url — wrapped with the link key (not owner key)
  linkFekDriveId: string    // Drive ID of the shared/*.enc file (ciphertext for link viewers)
  expiresAt: string | null  // ISO 8601 or null
  createdAt: string
}

export interface Index {
  version: 1
  files: FileEntry[]
  albums: AlbumEntry[]
  shares: ShareEntry[]
}

const EMPTY_INDEX: Index = { version: 1, files: [], albums: [], shares: [] }

// ─── IndexManager ─────────────────────────────────────────────────────────────

export class IndexManager {
  private drive: DriveAdapter
  /** 32-byte key derived from master secret for encrypting the index */
  private indexKey: Uint8Array
  private cached: Index | null = null

  constructor(drive: DriveAdapter, indexKey: Uint8Array) {
    this.drive = drive
    this.indexKey = indexKey
  }

  // ─── Load / save ────────────────────────────────────────────────────────────

  async load(): Promise<Index> {
    if (this.cached) return this.cached

    const bytes = await this.drive.readIndex()
    if (!bytes) {
      this.cached = structuredClone(EMPTY_INDEX)
      return this.cached
    }

    this.cached = await decryptMetadata<Index>(bytes, this.indexKey)
    return this.cached
  }

  private async save(): Promise<void> {
    if (!this.cached) throw new Error('Index not loaded')
    const bytes = await encryptMetadata(this.cached, this.indexKey)
    await this.drive.writeIndex(bytes)
  }

  // ─── Files ──────────────────────────────────────────────────────────────────

  async listFiles(): Promise<FileEntry[]> {
    const index = await this.load()
    return index.files.slice().sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
    )
  }

  async getFile(id: string): Promise<FileEntry | undefined> {
    const index = await this.load()
    return index.files.find((f) => f.id === id)
  }

  async addFile(entry: FileEntry): Promise<void> {
    const index = await this.load()
    index.files.push(entry)
    await this.save()
  }

  async removeFile(id: string): Promise<void> {
    const index = await this.load()
    index.files = index.files.filter((f) => f.id !== id)
    // Remove dangling shares
    index.shares = index.shares.filter((s) => s.fileId !== id)
    await this.save()
  }

  // ─── Albums ─────────────────────────────────────────────────────────────────

  async listAlbums(): Promise<AlbumEntry[]> {
    const index = await this.load()
    return index.albums.slice()
  }

  async createAlbum(album: AlbumEntry): Promise<void> {
    const index = await this.load()
    index.albums.push(album)
    await this.save()
  }

  async deleteAlbum(id: string): Promise<void> {
    const index = await this.load()
    index.albums = index.albums.filter((a) => a.id !== id)
    // Detach files from the deleted album
    for (const file of index.files) {
      file.albumIds = file.albumIds.filter((aid) => aid !== id)
    }
    await this.save()
  }

  async addFileToAlbum(fileId: string, albumId: string): Promise<void> {
    const index = await this.load()
    const file = index.files.find((f) => f.id === fileId)
    if (!file) throw new Error(`File ${fileId} not found in index`)
    if (!file.albumIds.includes(albumId)) {
      file.albumIds.push(albumId)
      await this.save()
    }
  }

  async removeFileFromAlbum(fileId: string, albumId: string): Promise<void> {
    const index = await this.load()
    const file = index.files.find((f) => f.id === fileId)
    if (!file) return
    file.albumIds = file.albumIds.filter((aid) => aid !== albumId)
    await this.save()
  }

  // ─── Shares ─────────────────────────────────────────────────────────────────

  async listShares(): Promise<ShareEntry[]> {
    const index = await this.load()
    return index.shares.slice()
  }

  async addShare(share: ShareEntry): Promise<void> {
    const index = await this.load()
    index.shares.push(share)
    await this.save()
  }

  async revokeShare(id: string): Promise<ShareEntry | undefined> {
    const index = await this.load()
    const share = index.shares.find((s) => s.id === id)
    index.shares = index.shares.filter((s) => s.id !== id)
    await this.save()
    return share
  }

  getShare(id: string): ShareEntry | undefined {
    return this.cached?.shares.find((s) => s.id === id)
  }

  isShareExpired(share: ShareEntry): boolean {
    if (!share.expiresAt) return false
    return new Date(share.expiresAt) < new Date()
  }

  /** Purges expired shares from the index (call on load). */
  async pruneExpiredShares(): Promise<number> {
    const index = await this.load()
    const before = index.shares.length
    index.shares = index.shares.filter((s) => !this.isShareExpired(s))
    const pruned = before - index.shares.length
    if (pruned > 0) await this.save()
    return pruned
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function randomId(): string {
  return crypto.randomUUID()
}

/** Derives the 32-byte index encryption key from the master secret. */
export async function deriveIndexKey(masterSecret: Uint8Array): Promise<Uint8Array> {
  const { getSodium } = await import('./crypto')
  const sodium = await getSodium()
  return sodium.crypto_kdf_derive_from_key(
    32, 2, 'picidx01', masterSecret.slice(0, 32),
  )
}
