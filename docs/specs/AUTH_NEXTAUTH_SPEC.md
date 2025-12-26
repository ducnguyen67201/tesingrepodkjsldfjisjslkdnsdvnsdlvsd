# Engineering Specification: NextAuth.js Authentication

## Overview

This specification outlines the implementation of NextAuth.js (Auth.js v5) for Ducsigr's web application, enabling user authentication with bearer token reuse across services.

**Status:** Draft
**Version:** 1.0
**Date:** 2025-11-27

---

## Table of Contents

1. [Goals & Requirements](#1-goals--requirements)
2. [Architecture](#2-architecture)
3. [Database Schema Changes](#3-database-schema-changes)
4. [Implementation Plan](#4-implementation-plan)
5. [Configuration](#5-configuration)
6. [API Routes](#6-api-routes)
7. [Middleware](#7-middleware)
8. [Token Strategy](#8-token-strategy)
9. [Integration with Services](#9-integration-with-services)
10. [Security Considerations](#10-security-considerations)
11. [Testing](#11-testing)
12. [Migration Path](#12-migration-path)

---

## 1. Goals & Requirements

### 1.1 Primary Goals

- **User Authentication**: Email/password and OAuth (Google, GitHub) login
- **Bearer Token Reuse**: JWT tokens usable across Web, Ingest (Go), and Worker services
- **Project Ownership**: Link users to projects with role-based access
- **Session Management**: Secure session handling with refresh tokens
- **API Key Management**: Users can create/revoke API keys for their projects

### 1.2 Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Users can sign up with email/password | P0 |
| FR-2 | Users can sign in with Google OAuth | P1 |
| FR-3 | Users can sign in with GitHub OAuth | P1 |
| FR-4 | JWT tokens are accessible for API calls | P0 |
| FR-5 | Users can create and manage projects | P0 |
| FR-6 | Users can generate API keys for projects | P0 |
| FR-7 | Protected routes require authentication | P0 |
| FR-8 | Token refresh happens automatically | P0 |

### 1.3 Non-Functional Requirements

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-1 | Token expiry | Access: 15min, Refresh: 7 days |
| NFR-2 | Password hashing | bcrypt, cost factor 12 |
| NFR-3 | Session storage | JWT (stateless) |
| NFR-4 | Rate limiting | 5 failed logins per 15min |

---

## 2. Architecture

### 2.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Authentication Flow                          │
└─────────────────────────────────────────────────────────────────────┘

┌──────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│  Client  │────▶│  Next.js     │────▶│  NextAuth   │────▶│ Prisma   │
│ (Browser)│     │  Middleware  │     │  Handlers   │     │ Adapter  │
└──────────┘     └──────────────┘     └─────────────┘     └──────────┘
     │                                       │                   │
     │                                       ▼                   ▼
     │                              ┌─────────────┐     ┌──────────────┐
     │                              │   OAuth     │     │  PostgreSQL  │
     │                              │  Providers  │     │   (Users)    │
     │                              └─────────────┘     └──────────────┘
     │
     │  Bearer Token (JWT)
     ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Service Layer                                 │
├────────────────┬─────────────────────┬───────────────────────────────┤
│   Ingest (Go)  │    Worker (Node)    │         Web API (Next.js)     │
│   Port: 8080   │                     │         Port: 3000            │
├────────────────┴─────────────────────┴───────────────────────────────┤
│                      Token Validation                                 │
│  - Verify JWT signature (shared secret or JWKS)                      │
│  - Extract userId, projectIds from claims                            │
│  - Check token expiry                                                │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 Token Flow for API Calls

```
┌─────────────┐                    ┌─────────────┐
│   Browser   │                    │  Ingest API │
│   (React)   │                    │    (Go)     │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │  1. getSession() / getToken()    │
       │◀─────────────────────────────────│
       │                                  │
       │  2. API Request                  │
       │  Authorization: Bearer <JWT>     │
       │─────────────────────────────────▶│
       │                                  │
       │                           3. Validate JWT
       │                           4. Extract claims
       │                           5. Process request
       │                                  │
       │  6. Response                     │
       │◀─────────────────────────────────│
       │                                  │
```

### 2.3 Component Architecture

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (auth)/                    # Auth route group (public)
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/               # Protected route group
│   │   │   ├── projects/
│   │   │   ├── settings/
│   │   │   └── layout.tsx
│   │   │
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── [...nextauth]/
│   │   │           └── route.ts       # NextAuth API handler
│   │   │
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── lib/
│   │   └── auth/
│   │       ├── index.ts               # Auth exports
│   │       ├── config.ts              # NextAuth configuration
│   │       ├── providers.ts           # OAuth providers setup
│   │       └── adapter.ts             # Prisma adapter config
│   │
│   ├── components/
│   │   └── auth/
│   │       ├── login-form.tsx
│   │       ├── register-form.tsx
│   │       ├── oauth-buttons.tsx
│   │       └── user-menu.tsx
│   │
│   └── middleware.ts                  # Route protection
│
└── auth.ts                            # Root auth config (Next.js 16 pattern)
```

---

## 3. Database Schema Changes

### 3.1 New Models for NextAuth

Add to `packages/db/prisma/schema.prisma`:

```prisma
// ============================================================
// Authentication Models (NextAuth.js / Auth.js)
// ============================================================

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  password      String?   // Null for OAuth-only users
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  accounts      Account[]
  sessions      Session[]
  projects      ProjectMember[]

  @@map("users")
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ============================================================
// Project Membership (User-Project Relationship)
// ============================================================

enum ProjectRole {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

model ProjectMember {
  id        String      @id @default(cuid())
  userId    String
  projectId String
  role      ProjectRole @default(MEMBER)
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([userId, projectId])
  @@map("project_members")
}
```

### 3.2 Updated Project Model

```prisma
model Project {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  apiKeys ApiKey[]
  traces  Trace[]
  members ProjectMember[]  // NEW: Add this relation

  @@map("projects")
}
```

### 3.3 Updated ApiKey Model

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  projectId   String
  name        String    @default("Default")  // NEW: Friendly name
  hashedKey   String    @unique
  displayKey  String                          // Last 8 chars for display
  createdById String?                         // NEW: Track who created it
  createdAt   DateTime  @default(now())
  lastUsedAt  DateTime?
  expiresAt   DateTime?                       // NEW: Optional expiration

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("api_keys")
}
```

### 3.4 Migration Commands

```bash
# Generate migration
cd packages/db
pnpm prisma migrate dev --name add_auth_models

# Generate Prisma client
pnpm prisma generate
```

---

## 4. Implementation Plan

### Phase 1: Foundation (Core Auth)

| Step | Task | Files |
|------|------|-------|
| 1.1 | Install NextAuth dependencies | `apps/web/package.json` |
| 1.2 | Update Prisma schema | `packages/db/prisma/schema.prisma` |
| 1.3 | Run database migration | - |
| 1.4 | Create auth configuration | `apps/web/src/lib/auth/config.ts` |
| 1.5 | Create NextAuth route handler | `apps/web/src/app/api/auth/[...nextauth]/route.ts` |
| 1.6 | Add environment variables | `.env`, `.env.example` |

### Phase 2: Providers & Middleware

| Step | Task | Files |
|------|------|-------|
| 2.1 | Configure Credentials provider | `apps/web/src/lib/auth/providers.ts` |
| 2.2 | Configure Google OAuth | `apps/web/src/lib/auth/providers.ts` |
| 2.3 | Configure GitHub OAuth | `apps/web/src/lib/auth/providers.ts` |
| 2.4 | Create middleware | `apps/web/src/middleware.ts` |
| 2.5 | Create auth utilities | `apps/web/src/lib/auth/index.ts` |

### Phase 3: UI Components

| Step | Task | Files |
|------|------|-------|
| 3.1 | Login page | `apps/web/src/app/(auth)/login/page.tsx` |
| 3.2 | Register page | `apps/web/src/app/(auth)/register/page.tsx` |
| 3.3 | Login form component | `apps/web/src/components/auth/login-form.tsx` |
| 3.4 | Register form component | `apps/web/src/components/auth/register-form.tsx` |
| 3.5 | OAuth buttons | `apps/web/src/components/auth/oauth-buttons.tsx` |
| 3.6 | User menu (header) | `apps/web/src/components/auth/user-menu.tsx` |

### Phase 4: Service Integration

| Step | Task | Files |
|------|------|-------|
| 4.1 | JWT validation in Go | `apps/ingest/internal/middleware/auth.go` |
| 4.2 | Shared JWT secret config | `packages/shared/src/constants.ts` |
| 4.3 | Token helper on frontend | `apps/web/src/lib/auth/token.ts` |
| 4.4 | API client with auth | `apps/web/src/lib/api/client.ts` |

---

## 5. Configuration

### 5.1 Dependencies

Add to `apps/web/package.json`:

```json
{
  "dependencies": {
    "next-auth": "5.0.0-beta.25",
    "@auth/prisma-adapter": "^2.7.4",
    "bcryptjs": "^2.4.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6"
  }
}
```

### 5.2 Environment Variables

Add to `.env.example` and `.env`:

```bash
# ============================================================
# NextAuth Configuration
# ============================================================

# Required: Secret for JWT signing (generate with: openssl rand -base64 32)
AUTH_SECRET="your-auth-secret-min-32-chars"

# Required: Base URL of your application
AUTH_URL="http://localhost:3000"

# Trust host header (for proxies/containers)
AUTH_TRUST_HOST=true

# ============================================================
# OAuth Providers (Optional)
# ============================================================

# Google OAuth
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# GitHub OAuth
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""

# ============================================================
# JWT Configuration
# ============================================================

# JWT expiration times (in seconds)
AUTH_JWT_MAX_AGE=900           # 15 minutes for access token
AUTH_REFRESH_TOKEN_MAX_AGE=604800  # 7 days for refresh

# Shared secret for cross-service JWT validation
# MUST be the same across Web, Ingest, and Worker
JWT_SHARED_SECRET="your-jwt-shared-secret-min-32-chars"
```

### 5.3 Auth Configuration File

Create `apps/web/src/lib/auth/config.ts`:

```typescript
import { NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@ducsigr/db";
import { providers } from "./providers";

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),

  providers,

  session: {
    strategy: "jwt",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },

  pages: {
    signIn: "/login",
    signOut: "/login",
    error: "/login",
    newUser: "/projects",
  },

  callbacks: {
    async jwt({ token, user, account }) {
      // Initial sign in
      if (user) {
        token.id = user.id;
        token.email = user.email;
      }

      // Add project access to token (for API authorization)
      if (token.id) {
        const memberships = await prisma.projectMember.findMany({
          where: { userId: token.id as string },
          select: { projectId: true, role: true },
        });
        token.projects = memberships.map((m) => ({
          id: m.projectId,
          role: m.role,
        }));
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.projects = token.projects as Array<{
          id: string;
          role: string;
        }>;
      }
      return session;
    },

    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/login") ||
                         nextUrl.pathname.startsWith("/register");
      const isPublicPage = nextUrl.pathname === "/" ||
                           nextUrl.pathname.startsWith("/api/auth");

      if (isAuthPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/projects", nextUrl));
        }
        return true;
      }

      if (isPublicPage) {
        return true;
      }

      return isLoggedIn;
    },
  },

  events: {
    async signIn({ user, isNewUser }) {
      if (isNewUser && user.id) {
        // Create default project for new users
        const project = await prisma.project.create({
          data: {
            name: "My First Project",
            members: {
              create: {
                userId: user.id,
                role: "OWNER",
              },
            },
          },
        });
        console.log(`Created default project ${project.id} for user ${user.id}`);
      }
    },
  },

  debug: process.env.NODE_ENV === "development",
};
```

---

## 6. API Routes

### 6.1 NextAuth Handler

Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

const handler = NextAuth(authConfig);

export { handler as GET, handler as POST };
```

### 6.2 Root Auth Export

Create `apps/web/auth.ts`:

```typescript
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth(authConfig);
```

### 6.3 User Registration API

Create `apps/web/src/app/api/auth/register/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@ducsigr/db";
import { z } from "zod";

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
      return NextResponse.json(
        { error: "User already exists" },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create user with default project
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        projects: {
          create: {
            role: "OWNER",
            project: {
              create: {
                name: "My First Project",
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.errors },
        { status: 400 }
      );
    }

    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

### 6.4 Token Endpoint (For External Services)

Create `apps/web/src/app/api/auth/token/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { SignJWT } from "jose";

/**
 * Returns a bearer token for use with external services (Ingest, etc.)
 * This token is signed with the shared secret for cross-service validation.
 */
export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const secret = new TextEncoder().encode(process.env.JWT_SHARED_SECRET);

  const token = await new SignJWT({
    sub: session.user.id,
    email: session.user.email,
    projects: session.user.projects,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .setIssuer("ducsigr")
    .setAudience("ducsigr-api")
    .sign(secret);

  return NextResponse.json({
    token,
    expiresIn: 900, // 15 minutes
  });
}
```

---

## 7. Middleware

### 7.1 Route Protection Middleware

Create `apps/web/src/middleware.ts`:

```typescript
import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  // Define route patterns
  const publicRoutes = ["/", "/login", "/register"];
  const authRoutes = ["/login", "/register"];
  const apiAuthRoutes = ["/api/auth"];

  const isPublicRoute = publicRoutes.includes(nextUrl.pathname);
  const isAuthRoute = authRoutes.includes(nextUrl.pathname);
  const isApiAuthRoute = apiAuthRoutes.some((route) =>
    nextUrl.pathname.startsWith(route)
  );
  const isApiRoute = nextUrl.pathname.startsWith("/api");

  // Allow auth API routes
  if (isApiAuthRoute) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/projects", nextUrl));
  }

  // Allow public routes
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // Protect API routes
  if (isApiRoute && !isLoggedIn) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Protect dashboard routes
  if (!isLoggedIn) {
    const callbackUrl = encodeURIComponent(nextUrl.pathname);
    return NextResponse.redirect(
      new URL(`/login?callbackUrl=${callbackUrl}`, nextUrl)
    );
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
};
```

---

## 8. Token Strategy

### 8.1 JWT Structure

```typescript
interface DucsigrJWT {
  // Standard claims
  sub: string;        // User ID
  iat: number;        // Issued at
  exp: number;        // Expiration
  iss: string;        // Issuer: "ducsigr"
  aud: string;        // Audience: "ducsigr-api"

  // Custom claims
  email: string;
  projects: Array<{
    id: string;
    role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  }>;
}
```

### 8.2 Token Validation (Shared Package)

Create `packages/shared/src/auth/jwt.ts`:

```typescript
import { jwtVerify, type JWTPayload } from "jose";

export interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
  projects: Array<{
    id: string;
    role: string;
  }>;
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<TokenPayload> {
  const secretKey = new TextEncoder().encode(secret);

  const { payload } = await jwtVerify(token, secretKey, {
    issuer: "ducsigr",
    audience: "ducsigr-api",
  });

  return payload as TokenPayload;
}

export function hasProjectAccess(
  payload: TokenPayload,
  projectId: string,
  requiredRoles?: string[]
): boolean {
  const project = payload.projects?.find((p) => p.id === projectId);

  if (!project) {
    return false;
  }

  if (requiredRoles && requiredRoles.length > 0) {
    return requiredRoles.includes(project.role);
  }

  return true;
}
```

### 8.3 Frontend Token Helper

Create `apps/web/src/lib/auth/token.ts`:

```typescript
"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

interface TokenState {
  token: string | null;
  expiresAt: number | null;
  isLoading: boolean;
  error: Error | null;
}

export function useAuthToken() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<TokenState>({
    token: null,
    expiresAt: null,
    isLoading: true,
    error: null,
  });

  const fetchToken = useCallback(async () => {
    if (status !== "authenticated") {
      setState({
        token: null,
        expiresAt: null,
        isLoading: false,
        error: null,
      });
      return;
    }

    try {
      const response = await fetch("/api/auth/token");
      if (!response.ok) {
        throw new Error("Failed to fetch token");
      }

      const data = await response.json();
      setState({
        token: data.token,
        expiresAt: Date.now() + data.expiresIn * 1000,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState({
        token: null,
        expiresAt: null,
        isLoading: false,
        error: error as Error,
      });
    }
  }, [status]);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!state.expiresAt) return;

    const refreshBuffer = 60 * 1000; // 1 minute before expiry
    const timeUntilRefresh = state.expiresAt - Date.now() - refreshBuffer;

    if (timeUntilRefresh <= 0) {
      fetchToken();
      return;
    }

    const timer = setTimeout(fetchToken, timeUntilRefresh);
    return () => clearTimeout(timer);
  }, [state.expiresAt, fetchToken]);

  return {
    token: state.token,
    isLoading: state.isLoading,
    error: state.error,
    refreshToken: fetchToken,
  };
}

/**
 * Get auth headers for API requests
 */
export function getAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}
```

---

## 9. Integration with Services

### 9.1 Go Ingest Service Auth Middleware

Create `apps/ingest/internal/middleware/auth.go`:

```go
package middleware

import (
	"context"
	"net/http"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type contextKey string

const (
	UserContextKey     contextKey = "user"
	ProjectsContextKey contextKey = "projects"
)

type ProjectAccess struct {
	ID   string `json:"id"`
	Role string `json:"role"`
}

type UserClaims struct {
	jwt.RegisteredClaims
	Email    string          `json:"email"`
	Projects []ProjectAccess `json:"projects"`
}

// JWTAuth validates Bearer tokens from NextAuth
func JWTAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Missing authorization header", http.StatusUnauthorized)
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, "Invalid authorization header format", http.StatusUnauthorized)
			return
		}

		tokenString := parts[1]

		// Parse and validate token
		secret := []byte(os.Getenv("JWT_SHARED_SECRET"))
		token, err := jwt.ParseWithClaims(tokenString, &UserClaims{}, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, jwt.ErrSignatureInvalid
			}
			return secret, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		claims, ok := token.Claims.(*UserClaims)
		if !ok {
			http.Error(w, "Invalid token claims", http.StatusUnauthorized)
			return
		}

		// Add claims to context
		ctx := context.WithValue(r.Context(), UserContextKey, claims.Subject)
		ctx = context.WithValue(ctx, ProjectsContextKey, claims.Projects)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireProjectAccess checks if user has access to the specified project
func RequireProjectAccess(projectIDHeader string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			projectID := r.Header.Get(projectIDHeader)
			if projectID == "" {
				http.Error(w, "Missing project ID", http.StatusBadRequest)
				return
			}

			projects, ok := r.Context().Value(ProjectsContextKey).([]ProjectAccess)
			if !ok {
				http.Error(w, "Invalid context", http.StatusInternalServerError)
				return
			}

			// Check if user has access to this project
			hasAccess := false
			for _, p := range projects {
				if p.ID == projectID {
					hasAccess = true
					break
				}
			}

			if !hasAccess {
				http.Error(w, "Access denied to project", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
```

### 9.2 Update Go Server Routes

Update `apps/ingest/internal/server/server.go`:

```go
package server

import (
	"github.com/go-chi/chi/v5"
	"github.com/ducsigr/ingest/internal/middleware"
	"github.com/ducsigr/ingest/internal/handler"
)

func (s *Server) setupRoutes() {
	r := chi.NewRouter()

	// Public routes
	r.Get("/health", handler.HealthCheck)

	// Protected API routes
	r.Route("/v1", func(r chi.Router) {
		// Apply JWT auth middleware
		r.Use(middleware.JWTAuth)

		// Trace endpoints (require project access)
		r.Route("/traces", func(r chi.Router) {
			r.Use(middleware.RequireProjectAccess("X-Project-ID"))
			r.Post("/", s.traceHandler.IngestTrace)
		})
	})

	s.router = r
}
```

### 9.3 API Key Authentication (Alternative)

For SDK/CLI access, support API key authentication alongside JWT:

Create `apps/ingest/internal/middleware/apikey.go`:

```go
package middleware

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
)

// APIKeyAuth validates API keys for SDK/CLI access
func APIKeyAuth(validateKey func(hashedKey string) (projectID string, err error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			apiKey := r.Header.Get("X-API-Key")
			if apiKey == "" {
				// Fall through to next auth method
				next.ServeHTTP(w, r)
				return
			}

			// Hash the API key
			hash := sha256.Sum256([]byte(apiKey))
			hashedKey := hex.EncodeToString(hash[:])

			// Validate against database
			projectID, err := validateKey(hashedKey)
			if err != nil {
				http.Error(w, "Invalid API key", http.StatusUnauthorized)
				return
			}

			// Set project ID in context
			ctx := context.WithValue(r.Context(), "projectID", projectID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
```

---

## 10. Security Considerations

### 10.1 Password Security

| Requirement | Implementation |
|-------------|----------------|
| Hashing algorithm | bcrypt |
| Cost factor | 12 (configurable) |
| Minimum length | 8 characters |
| Maximum length | 100 characters |

### 10.2 Token Security

| Requirement | Implementation |
|-------------|----------------|
| Algorithm | HS256 (HMAC-SHA256) |
| Secret length | Minimum 32 bytes |
| Access token expiry | 15 minutes |
| Refresh mechanism | Session-based via NextAuth |
| Storage | HttpOnly cookies (session), Memory (bearer token) |

### 10.3 CORS Configuration

Update Ingest service CORS for production:

```go
cors.Options{
    AllowedOrigins:   []string{os.Getenv("WEB_URL")}, // e.g., "https://app.ducsigr.com"
    AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
    AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Project-ID", "X-API-Key"},
    ExposedHeaders:   []string{"Link"},
    AllowCredentials: true,
    MaxAge:           300,
}
```

### 10.4 Rate Limiting

Implement rate limiting for auth endpoints:

```typescript
// apps/web/src/lib/auth/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "15 m"), // 5 attempts per 15 minutes
  analytics: true,
});

export async function checkRateLimit(identifier: string) {
  const { success, limit, remaining, reset } = await ratelimit.limit(identifier);
  return { success, limit, remaining, reset };
}
```

### 10.5 Security Headers

Add to `apps/web/next.config.ts`:

```typescript
const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};
```

---

## 11. Testing

### 11.1 Unit Tests

Create `apps/web/src/lib/auth/__tests__/jwt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { verifyToken, hasProjectAccess } from "@ducsigr/shared/auth/jwt";

describe("JWT Verification", () => {
  const secret = "test-secret-with-minimum-32-chars";

  it("should verify a valid token", async () => {
    // Create a test token
    const token = await createTestToken(secret, {
      sub: "user-123",
      email: "test@example.com",
      projects: [{ id: "proj-1", role: "OWNER" }],
    });

    const payload = await verifyToken(token, secret);
    expect(payload.sub).toBe("user-123");
    expect(payload.email).toBe("test@example.com");
  });

  it("should reject an expired token", async () => {
    const expiredToken = await createTestToken(secret, {
      sub: "user-123",
      exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    });

    await expect(verifyToken(expiredToken, secret)).rejects.toThrow();
  });
});

describe("Project Access", () => {
  it("should allow access to owned project", () => {
    const payload = {
      sub: "user-123",
      projects: [
        { id: "proj-1", role: "OWNER" },
        { id: "proj-2", role: "MEMBER" },
      ],
    };

    expect(hasProjectAccess(payload, "proj-1")).toBe(true);
    expect(hasProjectAccess(payload, "proj-2")).toBe(true);
    expect(hasProjectAccess(payload, "proj-3")).toBe(false);
  });

  it("should enforce role requirements", () => {
    const payload = {
      sub: "user-123",
      projects: [{ id: "proj-1", role: "VIEWER" }],
    };

    expect(hasProjectAccess(payload, "proj-1", ["OWNER", "ADMIN"])).toBe(false);
    expect(hasProjectAccess(payload, "proj-1", ["VIEWER"])).toBe(true);
  });
});
```

### 11.2 Integration Tests

Create `apps/web/src/app/api/auth/__tests__/register.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "../register/route";
import { prisma } from "@ducsigr/db";

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it("should register a new user", async () => {
    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        password: "securepassword123",
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(201);
    expect(data.email).toBe("test@example.com");
    expect(data.password).toBeUndefined(); // Password should not be returned
  });

  it("should reject duplicate email", async () => {
    // Create existing user
    await prisma.user.create({
      data: {
        email: "existing@example.com",
        password: "hashedpassword",
      },
    });

    const request = new Request("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: "New User",
        email: "existing@example.com",
        password: "password123",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });
});
```

### 11.3 E2E Tests

Create `apps/web/e2e/auth.spec.ts`:

```typescript
import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should register and login", async ({ page }) => {
    // Register
    await page.goto("/register");
    await page.fill('input[name="name"]', "E2E Test User");
    await page.fill('input[name="email"]', `e2e-${Date.now()}@test.com`);
    await page.fill('input[name="password"]', "securepassword123");
    await page.click('button[type="submit"]');

    // Should redirect to projects
    await expect(page).toHaveURL("/projects");

    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout"]');

    // Should be on login page
    await expect(page).toHaveURL("/login");
  });

  test("should protect dashboard routes", async ({ page }) => {
    await page.goto("/projects");

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });
});
```

---

## 12. Migration Path

### 12.1 Step-by-Step Migration

```bash
# Step 1: Update dependencies
cd apps/web
pnpm add next-auth@5.0.0-beta.25 @auth/prisma-adapter bcryptjs zod
pnpm add -D @types/bcryptjs

# Step 2: Update shared package
cd packages/shared
pnpm add jose

# Step 3: Run database migration
cd packages/db
pnpm prisma migrate dev --name add_auth_models

# Step 4: Update Go dependencies
cd apps/ingest
go get github.com/golang-jwt/jwt/v5

# Step 5: Generate clients
pnpm db:generate

# Step 6: Set environment variables
# Add to .env (see section 5.2)

# Step 7: Start development
pnpm dev
```

### 12.2 Rollback Plan

If issues arise:

1. Revert Prisma migration: `pnpm prisma migrate reset`
2. Remove auth dependencies from package.json
3. Delete auth-related files
4. Restore original routes

### 12.3 Feature Flags (Optional)

For gradual rollout:

```typescript
// apps/web/src/lib/feature-flags.ts
export const FEATURES = {
  AUTH_ENABLED: process.env.FEATURE_AUTH_ENABLED === "true",
  OAUTH_GOOGLE: process.env.FEATURE_OAUTH_GOOGLE === "true",
  OAUTH_GITHUB: process.env.FEATURE_OAUTH_GITHUB === "true",
};
```

---

## Appendix A: Type Definitions

### A.1 NextAuth Type Extensions

Create `apps/web/src/types/next-auth.d.ts`:

```typescript
import { DefaultSession, DefaultUser } from "next-auth";
import { JWT, DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      projects: Array<{
        id: string;
        role: string;
      }>;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    projects: Array<{
      id: string;
      role: string;
    }>;
  }
}
```

---

## Appendix B: OAuth Provider Setup

### B.1 Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to APIs & Services > Credentials
4. Create OAuth 2.0 Client ID
5. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Secret to `.env`

### B.2 GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Create a new OAuth App
3. Set Homepage URL: `http://localhost:3000`
4. Set Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
5. Copy Client ID and Secret to `.env`

---

## Appendix C: Providers Configuration

Create `apps/web/src/lib/auth/providers.ts`:

```typescript
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { compare } from "bcryptjs";
import { prisma } from "@ducsigr/db";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const providers = [
  Credentials({
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

  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
  }),

  GitHub({
    clientId: process.env.AUTH_GITHUB_ID,
    clientSecret: process.env.AUTH_GITHUB_SECRET,
  }),
];
```

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-11-27 | Claude | Initial specification |
