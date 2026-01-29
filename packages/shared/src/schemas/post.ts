import { z } from "zod";

export const createPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().optional(),
  authorId: z.string(),
});

export const updatePostSchema = z.object({
  title: z.string().min(1, "Title is required").optional(),
  content: z.string().optional(),
  published: z.boolean().optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
