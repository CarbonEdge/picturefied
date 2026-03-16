'use client'

/**
 * Client-side crypto helper.
 * Wraps the Web Worker with a Promise-based API.
 * All crypto calls return Promises that resolve when the worker completes.
 */

import type { WorkerRequest, WorkerResponse } from '@/workers/crypto.worker'

let worker: Worker | null = null
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/crypto.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const { id } = e.data
      const callbacks = pending.get(id)
      if (!callbacks) return
      pending.delete(id)

      if (e.data.type === 'ERROR') {
        callbacks.reject(new Error(e.data.error))
      } else {
        callbacks.resolve(e.data)
      }
    }
    worker.onerror = (e) => {
      console.error('[crypto-worker] error', e)
    }
  }
  return worker
}

function call<T>(msg: Omit<WorkerRequest, 'id'>): Promise<T> {
  const id = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
    getWorker().postMessage({ ...msg, id })
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────

export type { WorkerRequest, WorkerResponse }

export async function encryptFile(
  fileBytes: Uint8Array,
  metadata: import('@picturefied/crypto').FileMetadata,
  ownerPublicKey: Uint8Array,
) {
  return call<{ type: 'ENCRYPT_FILE_RESULT'; result: import('@/workers/crypto.worker').EncryptFileResult }>(
    { type: 'ENCRYPT_FILE', payload: { fileBytes, metadata, ownerPublicKey } }
  ).then((r) => r.result)
}

export async function encryptThumbnail(thumbBytes: Uint8Array, ownerPublicKey: Uint8Array) {
  return call<{ type: 'ENCRYPT_THUMB_RESULT'; result: import('@/workers/crypto.worker').EncryptThumbResult }>(
    { type: 'ENCRYPT_THUMB', payload: { thumbBytes, ownerPublicKey } }
  ).then((r) => r.result)
}

export async function decryptFile(
  encryptedFile: Uint8Array,
  wrappedFek: string,
  ownerPublicKey: Uint8Array,
  ownerPrivateKey: Uint8Array,
) {
  return call<{ type: 'DECRYPT_FILE_RESULT'; result: Uint8Array }>(
    { type: 'DECRYPT_FILE', payload: { encryptedFile, wrappedFek, ownerPublicKey, ownerPrivateKey } }
  ).then((r) => r.result)
}

export async function decryptThumbnail(
  encryptedThumb: Uint8Array,
  wrappedThumbnailFek: string,
  ownerPublicKey: Uint8Array,
  ownerPrivateKey: Uint8Array,
) {
  return call<{ type: 'DECRYPT_THUMB_RESULT'; result: Uint8Array }>(
    { type: 'DECRYPT_THUMB', payload: { encryptedThumb, wrappedThumbnailFek, ownerPublicKey, ownerPrivateKey } }
  ).then((r) => r.result)
}

export async function createShareKey(
  wrappedFek: string,
  ownerPublicKey: Uint8Array,
  ownerPrivateKey: Uint8Array,
) {
  return call<{ type: 'CREATE_SHARE_KEY_RESULT'; result: import('@/workers/crypto.worker').CreateShareKeyResult }>(
    { type: 'CREATE_SHARE_KEY', payload: { wrappedFek, ownerPublicKey, ownerPrivateKey } }
  ).then((r) => r.result)
}

/**
 * Generate a thumbnail from an image File using the Canvas API.
 * Runs on the main thread (canvas access required) before handing off to the worker.
 */
export async function generateThumbnail(file: File, maxDim = 400): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const { width, height } = img
      const scale = Math.min(maxDim / width, maxDim / height, 1)
      const w = Math.round(width  * scale)
      const h = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width  = w
      canvas.height = h
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, w, h)

      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('Canvas toBlob failed')); return }
          blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject)
        },
        'image/webp',
        0.8,
      )
    }
    img.onerror = reject
    img.src = url
  })
}
