-- Add foreign key constraint for feedbackUserId -> users.id
-- OnDelete: SetNull (if user is deleted, set feedbackUserId to NULL)
ALTER TABLE "alert_rcas"
ADD CONSTRAINT "alert_rcas_feedbackUserId_fkey"
FOREIGN KEY ("feedbackUserId") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
