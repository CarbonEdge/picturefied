/**
 * Crypto Web Worker
 *
 * Offloads all heavy crypto operations from the main thread.
 * Messages use a simple { type, id, payload } protocol; responses
 * use the same id so the caller can match them up.
 */
import { encryptBytes, decryptBytes, generateFek, getSodium } from '../lib/crypto'

export type WorkerRequest =
  | { type: 'ENCRYPT_FILE';  id: string; payload: { bytes: Uint8Array; fek: Uint8Array } }
  | { type: 'DECRYPT_FILE';  id: string; payload: { bytes: Uint8Array; fek: Uint8Array } }
  | { type: 'ENCRYPT_THUMB'; id: string; payload: { bytes: Uint8Array; fek: Uint8Array } }
  | { type: 'DECRYPT_THUMB'; id: string; payload: { bytes: Uint8Array; fek: Uint8Array } }
  | { type: 'GEN_FEK';       id: string; payload: Record<string, never> }

export type WorkerResponse =
  | { type: 'OK';    id: string; result: Uint8Array }
  | { type: 'ERROR'; id: string; error: string }

// Ensure libsodium is ready before processing messages
const sodiumReady = getSodium()

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  await sodiumReady
  const { type, id, payload } = event.data

  try {
    let result: Uint8Array

    switch (type) {
      case 'ENCRYPT_FILE':
      case 'ENCRYPT_THUMB':
        result = await encryptBytes(payload.bytes, payload.fek)
        // Zero the FEK after use so it doesn't linger in worker memory
        payload.fek.fill(0)
        break

      case 'DECRYPT_FILE':
      case 'DECRYPT_THUMB':
        result = await decryptBytes(payload.bytes, payload.fek)
        payload.fek.fill(0)
        break

      case 'GEN_FEK':
        result = await generateFek()
        break

      default:
        throw new Error(`Unknown message type: ${(event.data as { type: string }).type}`)
    }

    const response: WorkerResponse = { type: 'OK', id, result }
    // Transfer the buffer to avoid copying — the worker relinquishes ownership
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(self as any).postMessage(response, [result.buffer])
  } catch (err) {
    const response: WorkerResponse = {
      type: 'ERROR',
      id,
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(response)
  }
}
