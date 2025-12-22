/**
 * Attachment Text Extraction Workflow
 *
 * Temporal workflow for extracting text from knowledge article attachments.
 * Uses LLM vision capabilities for OCR on images and PDFs.
 *
 * Steps:
 * 1. Fetch attachment metadata
 * 2. Download attachment from storage (S3/R2)
 * 3. Extract text using LLM Center (vision for images/scanned PDFs)
 * 4. Store extracted text
 * 5. Optionally trigger re-indexing of the parent article
 *
 * Triggered when:
 * - Attachment is uploaded (uploadAttachment)
 */

import { proxyActivities } from "@temporalio/workflow";
import { ACTIVITY_RETRY } from "@cognobserve/shared";
import type * as attachmentActivities from "../temporal/activities/attachment.activities";

// ============================================
// Activity Proxies
// ============================================

const { getAttachmentForExtraction, extractTextFromAttachment, storeAttachmentText } =
  proxyActivities<typeof attachmentActivities>({
    startToCloseTimeout: "10m", // Text extraction can be slow for large files
    retry: ACTIVITY_RETRY.DEFAULT,
  });

// ============================================
// Workflow Input/Output Types
// ============================================

export interface AttachmentExtractWorkflowInput {
  attachmentId: string;
  /** If true, re-index the parent article after extraction */
  reindexArticle?: boolean;
}

export interface AttachmentExtractWorkflowOutput {
  attachmentId: string;
  articleId: string;
  textLength: number;
  success: boolean;
  error?: string;
}

// ============================================
// Workflow Implementation
// ============================================

/**
 * Extract text from an attachment and optionally re-index the article.
 */
export async function attachmentExtractWorkflow(
  input: AttachmentExtractWorkflowInput
): Promise<AttachmentExtractWorkflowOutput> {
  const { attachmentId, reindexArticle = true } = input;

  console.log(`[AttachmentExtractWorkflow] Starting for attachment ${attachmentId}`);

  try {
    // Step 1: Fetch attachment metadata
    const attachment = await getAttachmentForExtraction(attachmentId);

    if (!attachment) {
      return {
        attachmentId,
        articleId: "",
        textLength: 0,
        success: false,
        error: "Attachment not found",
      };
    }

    console.log(
      `[AttachmentExtractWorkflow] Processing ${attachment.fileName} (${attachment.contentType})`
    );

    // Step 2: Extract text from attachment
    const extractResult = await extractTextFromAttachment({
      attachmentId,
      storageKey: attachment.storageKey,
      contentType: attachment.contentType,
      fileName: attachment.fileName,
    });

    if (!extractResult.success || !extractResult.text) {
      return {
        attachmentId,
        articleId: attachment.articleId,
        textLength: 0,
        success: false,
        error: extractResult.error || "Failed to extract text",
      };
    }

    console.log(
      `[AttachmentExtractWorkflow] Extracted ${extractResult.text.length} chars from ${attachment.fileName}`
    );

    // Step 3: Store extracted text
    await storeAttachmentText({
      attachmentId,
      extractedText: extractResult.text,
    });

    // Step 4: Optionally re-index the parent article
    if (reindexArticle) {
      console.log(
        `[AttachmentExtractWorkflow] Triggering re-index for article ${attachment.articleId}`
      );
      // Note: In a real implementation, this would start a child workflow
      // For now, we just log and let the caller handle re-indexing
    }

    return {
      attachmentId,
      articleId: attachment.articleId,
      textLength: extractResult.text.length,
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[AttachmentExtractWorkflow] Error: ${errorMessage}`);

    return {
      attachmentId,
      articleId: "",
      textLength: 0,
      success: false,
      error: errorMessage,
    };
  }
}
