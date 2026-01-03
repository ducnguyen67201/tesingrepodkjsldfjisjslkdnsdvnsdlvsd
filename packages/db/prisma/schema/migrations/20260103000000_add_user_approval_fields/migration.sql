-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN     "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false;
