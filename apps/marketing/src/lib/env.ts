/**
 * Environment variables for the marketing site.
 * Injected from Doppler.
 */
export const env = {
  CALENDAR_BOOKING_URL: process.env.NEXT_PUBLIC_CALENDAR_BOOKING_URL ?? "",
} as const;
