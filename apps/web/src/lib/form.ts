/**
 * Form utilities - zodResolver wrapper for Zod 4
 *
 * This module provides a type-safe wrapper for @hookform/resolvers/zod
 * that handles type inference quirks with Zod 4. Use this instead of
 * importing zodResolver directly from @hookform/resolvers/zod.
 *
 * The project uses Zod 4 everywhere.
 *
 * @see https://github.com/react-hook-form/resolvers/issues/768
 */

import { zodResolver as baseZodResolver } from "@hookform/resolvers/zod";
import type { FieldValues, Resolver } from "react-hook-form";

/**
 * Type-safe zodResolver wrapper for Zod 4.
 *
 * Usage:
 * ```tsx
 * import { zodResolver } from "@/lib/form";
 *
 * const schema = z.object({ name: z.string() });
 * const form = useForm<z.output<typeof schema>>({
 *   resolver: zodResolver(schema),
 * });
 * ```
 */
export function zodResolver<TOutput extends FieldValues, TInput = TOutput>(
  schema: unknown
): Resolver<TOutput, unknown, TInput> {
  // Cast through unknown to handle @hookform/resolvers type mismatch with Zod 4
  // The runtime behavior is identical, only the types differ
  return baseZodResolver(
    schema as Parameters<typeof baseZodResolver>[0]
  ) as Resolver<TOutput, unknown, TInput>;
}
