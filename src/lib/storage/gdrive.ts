/**
 * Google Drive storage adapter (browser-only).
 *
 * Uses the Google Identity Services (GIS) OAuth2 implicit flow — no server
 * needed. The access token lives in memory; it's not persisted anywhere.
 *
 * Folder structure in the user's Drive:
 *   picturefied/
 *     config.enc      ← Argon2id salt + encrypted keypair (JSON → encrypted)
 *     index.enc       ← encrypted file index (replaces the DB)
 *     files/          ← encrypted file blobs
 *     thumbs/         ← encrypted thumbnail blobs
 *     shared/         ← link-share blobs (link-key-wrapped FEK + ciphertext)
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const APP_FOLDER = 'picturefied'

export interface DriveFile {
  id: string
  name: string
  size?: string
  mimeType: string
  modifiedTime?: string
}

export class DriveAdapter {
  private token: string
  private rootFolderId: string | null = null

  constructor(token: string) {
    this.token = token
  }

  // ─── Auth helper ────────────────────────────────────────────────────────────

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, ...extra }
  }

  private async json<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      throw new DriveError(res.status, text)
    }
    return res.json() as Promise<T>
  }

  // ─── Folder management ───────────────────────────────────────────────────────

  private async findOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const query = [
      `name = '${name}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
      parentId ? `'${parentId}' in parents` : `'root' in parents`,
    ].join(' and ')

    const res = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)`, {
      headers: this.headers(),
    })
    const data = await this.json<{ files: { id: string }[] }>(res)

    if (data.files.length > 0) return data.files[0].id

    // Create it
    const body: Record<string, unknown> = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }
    if (parentId) body.parents = [parentId]

    const createRes = await fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: this.headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    })
    const created = await this.json<{ id: string }>(createRes)
    return created.id
  }

  /** Returns (and caches) the root picturefied/ folder ID. */
  async getRootFolderId(): Promise<string> {
    if (!this.rootFolderId) {
      this.rootFolderId = await this.findOrCreateFolder(APP_FOLDER)
    }
    return this.rootFolderId
  }

  async getSubFolderId(sub: 'files' | 'thumbs' | 'shared'): Promise<string> {
    const rootId = await this.getRootFolderId()
    return this.findOrCreateFolder(sub, rootId)
  }

  // ─── File lookup ────────────────────────────────────────────────────────────

  async findFile(name: string, parentId: string): Promise<DriveFile | null> {
    const query = `name = '${name}' and '${parentId}' in parents and trashed = false`
    const res = await fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,mimeType,modifiedTime)`,
      { headers: this.headers() },
    )
    const data = await this.json<{ files: DriveFile[] }>(res)
    return data.files[0] ?? null
  }

  // ─── Upload ─────────────────────────────────────────────────────────────────

  /**
   * Uploads bytes to Drive using the resumable upload protocol.
   * Supports files of any size — Google handles chunking internally.
   */
  async upload(
    name: string,
    bytes: Uint8Array,
    parentId: string,
    existingFileId?: string,
  ): Promise<DriveFile> {
    const metadata = { name, parents: existingFileId ? undefined : [parentId] }
    const mimeType = 'application/octet-stream'

    // Initiate resumable upload session
    const url = existingFileId
      ? `${UPLOAD_API}/files/${existingFileId}?uploadType=resumable`
      : `${UPLOAD_API}/files?uploadType=resumable`

    const method = existingFileId ? 'PATCH' : 'POST'

    const sessionRes = await fetch(url, {
      method,
      headers: this.headers({
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': mimeType,
        'X-Upload-Content-Length': bytes.length.toString(),
      }),
      body: JSON.stringify(metadata),
    })

    if (!sessionRes.ok) {
      const text = await sessionRes.text()
      throw new DriveError(sessionRes.status, text)
    }

    const uploadUrl = sessionRes.headers.get('Location')!

    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mimeType }),
    })

    return this.json<DriveFile>(uploadRes)
  }

  // ─── Download ───────────────────────────────────────────────────────────────

  async download(fileId: string): Promise<Uint8Array> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
      headers: this.headers(),
    })
    if (!res.ok) throw new DriveError(res.status, res.statusText)
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  // ─── Delete ─────────────────────────────────────────────────────────────────

  async delete(fileId: string): Promise<void> {
    const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: this.headers(),
    })
    if (!res.ok && res.status !== 404) throw new DriveError(res.status, res.statusText)
  }

  // ─── Convenience: named files in root ────────────────────────────────────────

  /** Read config.enc from the root picturefied/ folder. */
  async readConfig(): Promise<Uint8Array | null> {
    const rootId = await this.getRootFolderId()
    const file = await this.findFile('config.enc', rootId)
    if (!file) return null
    return this.download(file.id)
  }

  /** Write config.enc to the root picturefied/ folder. */
  async writeConfig(bytes: Uint8Array): Promise<void> {
    const rootId = await this.getRootFolderId()
    const existing = await this.findFile('config.enc', rootId)
    await this.upload('config.enc', bytes, rootId, existing?.id)
  }

  /** Read index.enc from the root picturefied/ folder. */
  async readIndex(): Promise<Uint8Array | null> {
    const rootId = await this.getRootFolderId()
    const file = await this.findFile('index.enc', rootId)
    if (!file) return null
    return this.download(file.id)
  }

  /** Write index.enc to the root picturefied/ folder. */
  async writeIndex(bytes: Uint8Array): Promise<void> {
    const rootId = await this.getRootFolderId()
    const existing = await this.findFile('index.enc', rootId)
    await this.upload('index.enc', bytes, rootId, existing?.id)
  }
}

export class DriveError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(`Drive API error ${status}: ${message}`)
    this.name = 'DriveError'
  }
}

// ─── Google OAuth (GIS implicit flow) ────────────────────────────────────────

const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',  // only files created by this app
].join(' ')

/**
 * Opens the Google OAuth popup and returns an access token.
 * Requires VITE_GOOGLE_CLIENT_ID to be set at build time.
 *
 * Uses the GIS TokenClient — no redirect URIs needed for GitHub Pages
 * (it uses a postMessage popup approach).
 */
export function requestDriveToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      reject(new Error('VITE_GOOGLE_CLIENT_ID is not set. See QUICKSTART.md.'))
      return
    }

    // Load the GIS library lazily
    loadGisScript().then(() => {
      // @ts-expect-error — window.google injected by GIS script
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: { access_token?: string; error?: string }) => {
          if (response.error) {
            reject(new Error(`OAuth error: ${response.error}`))
          } else if (response.access_token) {
            resolve(response.access_token)
          } else {
            reject(new Error('No access token in OAuth response'))
          }
        },
      })
      client.requestAccessToken({ prompt: 'consent' })
    }).catch(reject)
  })
}

function loadGisScript(): Promise<void> {
  if (document.getElementById('gis-script')) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.id = 'gis-script'
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'))
    document.head.appendChild(script)
  })
}
