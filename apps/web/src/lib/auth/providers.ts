import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { compare } from "bcryptjs";
import { prisma } from "@ducsigr/db";
import { z } from "zod";
import { env } from "../env";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const providers = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(credentials) {
      const parsed = loginSchema.safeParse(credentials);
      if (!parsed.success) {
        return null;
      }

      const { email, password } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        return null;
      }

      const isValid = await compare(password, user.password);
      if (!isValid) {
        return null;
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),

  GoogleProvider({
    clientId: env.AUTH_GOOGLE_ID ?? "",
    clientSecret: env.AUTH_GOOGLE_SECRET ?? "",
  }),

  GitHubProvider({
    clientId: env.AUTH_GITHUB_ID ?? "",
    clientSecret: env.AUTH_GITHUB_SECRET ?? "",
  }),
];
