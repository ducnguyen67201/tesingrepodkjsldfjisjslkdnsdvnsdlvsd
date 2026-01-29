/**
 * Generate a random hex ID (32 chars = 16 bytes)
 * Uses Web Crypto API for secure random generation
 */
export function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
