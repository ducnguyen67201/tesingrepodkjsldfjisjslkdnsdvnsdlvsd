-- Add manual RCA tracking fields to AlertHistory
ALTER TABLE "alert_history" ADD COLUMN "rcaRequestedAt" TIMESTAMP(3);
ALTER TABLE "alert_history" ADD COLUMN "rcaRequestedBy" TEXT;
