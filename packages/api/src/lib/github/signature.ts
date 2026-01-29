import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies GitHub webhook signature using HMAC-SHA256.
 * Uses constant-time comparison to prevent timing attacks.
 *
 * @param payload - Raw request body as string
 * @param signature - Value of X-Hub-Signature-256 header
 * @param secret - GitHub webhook secret
 * @returns true if signature is valid
 */
export function verifyGitHubSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret)
    .update(payload)
    .digest("hex")}`;

  // Length check before constant-time comparison
  if (signature.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
