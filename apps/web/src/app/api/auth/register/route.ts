import { NextRequest } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@ducsigr/db";
import { extractDomainFromEmail } from "@ducsigr/api";
import { z } from "zod";
import { apiError, apiSuccess, apiServerError } from "@/lib/api-responses";

const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = registerSchema.parse(body);

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return apiError.userExists();
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Extract email domain for domain matcher
    const emailDomain = extractDomainFromEmail(email);

    // Check if there's a matching allowed domain
    const allowedDomain = emailDomain
      ? await prisma.allowedDomain.findUnique({
          where: { domain: emailDomain },
        })
      : null;

    // Create user and optionally add to workspace via domain matcher
    const user = await prisma.$transaction(async (tx) => {
      // Create the user
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      // Domain matcher: auto-add user to workspace if domain matches
      if (allowedDomain) {
        await tx.workspaceMember.create({
          data: {
            userId: newUser.id,
            workspaceId: allowedDomain.workspaceId,
            role: allowedDomain.role,
          },
        });
      }

      return newUser;
    });

    return apiSuccess.created(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError.validation("Validation failed", error.issues);
    }

    console.error("Registration error:", error);
    return apiServerError.internal();
  }
}
