import type { Job } from "bullmq";
import type { EmailJobPayload } from "@t3/shared";

export async function emailProcessor(job: Job<EmailJobPayload>) {
  const { to, subject, body } = job.data;

  console.log(`[email] Processing job ${job.id}`);
  console.log(`  To: ${to}`);
  console.log(`  Subject: ${subject}`);

  // Simulate email sending
  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log(`[email] Email sent to ${to}`);

  return { sent: true, to, timestamp: new Date().toISOString() };
}
