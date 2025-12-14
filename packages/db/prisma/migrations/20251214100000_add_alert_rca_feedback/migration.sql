-- Add user feedback fields to AlertRCA
ALTER TABLE "alert_rcas" ADD COLUMN "helpful" BOOLEAN;
ALTER TABLE "alert_rcas" ADD COLUMN "feedback" TEXT;
ALTER TABLE "alert_rcas" ADD COLUMN "feedbackAt" TIMESTAMP(3);
ALTER TABLE "alert_rcas" ADD COLUMN "feedbackUserId" TEXT;
