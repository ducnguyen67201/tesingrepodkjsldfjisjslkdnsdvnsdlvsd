-- Extensions Hub Migration
-- This migration adds the Extensions Hub feature for managing workspace extensions

-- CreateEnum
CREATE TYPE "ExtensionType" AS ENUM ('THEME', 'INGESTION', 'POLICY', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "ExtensionVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'UNLISTED');

-- CreateTable
CREATE TABLE "Extension" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ExtensionType" NOT NULL,
    "visibility" "ExtensionVisibility" NOT NULL DEFAULT 'PRIVATE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Extension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionVersion" (
    "id" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "entry" TEXT,
    "changelog" TEXT,
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionInstall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "extensionVersionId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "approvedPermissions" TEXT[],
    "installedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtensionInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtensionAuditLog" (
    "id" TEXT NOT NULL,
    "installId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExtensionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Extension_slug_key" ON "Extension"("slug");

-- CreateIndex
CREATE INDEX "Extension_type_idx" ON "Extension"("type");

-- CreateIndex
CREATE INDEX "Extension_visibility_idx" ON "Extension"("visibility");

-- CreateIndex
CREATE INDEX "Extension_ownerId_idx" ON "Extension"("ownerId");

-- CreateIndex
CREATE INDEX "ExtensionVersion_extensionId_idx" ON "ExtensionVersion"("extensionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionVersion_extensionId_version_key" ON "ExtensionVersion"("extensionId", "version");

-- CreateIndex
CREATE INDEX "ExtensionInstall_workspaceId_idx" ON "ExtensionInstall"("workspaceId");

-- CreateIndex
CREATE INDEX "ExtensionInstall_extensionId_idx" ON "ExtensionInstall"("extensionId");

-- CreateIndex
CREATE INDEX "ExtensionInstall_enabled_idx" ON "ExtensionInstall"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ExtensionInstall_workspaceId_extensionId_key" ON "ExtensionInstall"("workspaceId", "extensionId");

-- CreateIndex
CREATE INDEX "ExtensionAuditLog_installId_idx" ON "ExtensionAuditLog"("installId");

-- CreateIndex
CREATE INDEX "ExtensionAuditLog_actorId_idx" ON "ExtensionAuditLog"("actorId");

-- CreateIndex
CREATE INDEX "ExtensionAuditLog_createdAt_idx" ON "ExtensionAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Extension" ADD CONSTRAINT "Extension_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionVersion" ADD CONSTRAINT "ExtensionVersion_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionInstall" ADD CONSTRAINT "ExtensionInstall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionInstall" ADD CONSTRAINT "ExtensionInstall_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "Extension"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionInstall" ADD CONSTRAINT "ExtensionInstall_extensionVersionId_fkey" FOREIGN KEY ("extensionVersionId") REFERENCES "ExtensionVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionInstall" ADD CONSTRAINT "ExtensionInstall_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionAuditLog" ADD CONSTRAINT "ExtensionAuditLog_installId_fkey" FOREIGN KEY ("installId") REFERENCES "ExtensionInstall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtensionAuditLog" ADD CONSTRAINT "ExtensionAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
