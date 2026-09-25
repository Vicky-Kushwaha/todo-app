/**
 * Id generation for todos. Kept in one place so tests can rely on injected ids
 * via the reducer's `added` action rather than mocking this module.
 */
export function createId(): string {
  const webCrypto = globalThis.crypto

  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    return webCrypto.randomUUID()
  }

  // Fallback for environments without crypto.randomUUID (older browsers, some jsdom setups).
  return `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}
