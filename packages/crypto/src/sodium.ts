import sodium from 'libsodium-wrappers'

let ready = false

/**
 * Must be awaited once before calling any crypto function.
 * Safe to call multiple times — subsequent calls are instant.
 */
export async function getSodium() {
  if (!ready) {
    await sodium.ready
    ready = true
  }
  return sodium
}
