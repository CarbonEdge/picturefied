/**
 * Promise-based wrapper around the crypto Web Worker.
 * Consumers call `encryptFile(bytes, fek)` and get a Promise<Uint8Array> back.
 */
import CryptoWorker from '../workers/crypto.worker?worker'
import type { WorkerRequest, WorkerResponse } from '../workers/crypto.worker'

type PendingMap = Map<string, { resolve: (r: Uint8Array) => void; reject: (e: Error) => void }>

class CryptoWorkerClient {
  private worker: Worker
  private pending: PendingMap = new Map()

  constructor() {
    this.worker = new CryptoWorker()
    this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id } = event.data
      const p = this.pending.get(id)
      if (!p) return
      this.pending.delete(id)
      if (event.data.type === 'OK') {
        p.resolve(event.data.result)
      } else {
        p.reject(new Error(event.data.error))
      }
    }
    this.worker.onerror = (err) => {
      const error = new Error(`Crypto worker error: ${err.message}`)
      for (const p of this.pending.values()) p.reject(error)
      this.pending.clear()
    }
  }

  private call(request: WorkerRequest, transfer?: Transferable[]): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, { resolve, reject })
      if (transfer) {
        this.worker.postMessage(request, transfer)
      } else {
        this.worker.postMessage(request)
      }
    })
  }

  private id(): string {
    return crypto.randomUUID()
  }

  encryptFile(bytes: Uint8Array, fek: Uint8Array): Promise<Uint8Array> {
    const id = this.id()
    // Clone fek — worker will zero it; we may need the original
    const fekCopy = fek.slice()
    return this.call(
      { type: 'ENCRYPT_FILE', id, payload: { bytes, fek: fekCopy } },
      [bytes.buffer, fekCopy.buffer],
    )
  }

  decryptFile(bytes: Uint8Array, fek: Uint8Array): Promise<Uint8Array> {
    const id = this.id()
    const fekCopy = fek.slice()
    return this.call(
      { type: 'DECRYPT_FILE', id, payload: { bytes, fek: fekCopy } },
      [bytes.buffer, fekCopy.buffer],
    )
  }

  encryptThumb(bytes: Uint8Array, fek: Uint8Array): Promise<Uint8Array> {
    const id = this.id()
    const fekCopy = fek.slice()
    return this.call(
      { type: 'ENCRYPT_THUMB', id, payload: { bytes, fek: fekCopy } },
      [bytes.buffer, fekCopy.buffer],
    )
  }

  decryptThumb(bytes: Uint8Array, fek: Uint8Array): Promise<Uint8Array> {
    const id = this.id()
    const fekCopy = fek.slice()
    return this.call(
      { type: 'DECRYPT_THUMB', id, payload: { bytes, fek: fekCopy } },
      [bytes.buffer, fekCopy.buffer],
    )
  }

  generateFek(): Promise<Uint8Array> {
    const id = this.id()
    return this.call({ type: 'GEN_FEK', id, payload: {} })
  }
}

// Singleton — one worker for the whole app
let _client: CryptoWorkerClient | null = null

export function getCryptoWorker(): CryptoWorkerClient {
  if (!_client) _client = new CryptoWorkerClient()
  return _client
}
