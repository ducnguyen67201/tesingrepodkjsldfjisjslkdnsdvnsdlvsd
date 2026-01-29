import { z } from "zod";

/**
 * Domain validation schema
 * Validates domain format (e.g., example.com, sub.example.co.uk)
 */
export const DomainSchema = z
  .string()
  .min(3, "Domain must be at least 3 characters")
  .max(255, "Domain must be at most 255 characters")
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i,
    "Invalid domain format (e.g., example.com)"
  )
  .transform((d) => d.toLowerCase());

/**
 * Extract domain from email address
 * @returns lowercase domain or null if invalid
 */
export function extractDomainFromEmail(email: string): string | null {
  if (!email || typeof email !== "string") {
    return null;
  }

  const parts = email.split("@");
  if (parts.length !== 2) {
    return null;
  }

  const localPart = parts[0]?.trim();
  const domain = parts[1]?.toLowerCase().trim();

  // Both local part and domain must exist
  if (!localPart || localPart.length === 0 || !domain || domain.length === 0) {
    return null;
  }

  return domain;
}

/**
 * Check if an email matches an allowed domain
 */
export function emailMatchesDomain(email: string, allowedDomain: string): boolean {
  const emailDomain = extractDomainFromEmail(email);
  if (!emailDomain) {
    return false;
  }

  return emailDomain === allowedDomain.toLowerCase();
}

/**
 * Validate domain format
 * @returns parsed domain or null if invalid
 */
export function validateDomain(domain: string): string | null {
  const result = DomainSchema.safeParse(domain);
  return result.success ? result.data : null;
}

/**
 * Check if a domain is a valid format (without parsing)
 */
export function isValidDomainFormat(domain: string): boolean {
  return DomainSchema.safeParse(domain).success;
}
