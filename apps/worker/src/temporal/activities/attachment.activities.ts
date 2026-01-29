/**
 * Attachment Activities
 *
 * Activities for handling knowledge article attachments.
 * Includes text extraction from PDFs and images using LLM vision.
 *
 * IMPORTANT: Follows READ-ONLY pattern - all storage via tRPC internal procedures.
 */

import { prisma } from "@ducsigr/db";
import { getInternalCaller } from "@/lib/trpc-caller";

// ============================================
// Types
// ============================================

export interface AttachmentMetadata {
  id: string;
  articleId: string;
  workspaceId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storageKey: string;
}

export interface ExtractTextInput {
  attachmentId: string;
  storageKey: string;
  contentType: string;
  fileName: string;
}

export interface ExtractTextOutput {
  success: boolean;
  text?: string;
  error?: string;
}

export interface StoreAttachmentTextInput {
  attachmentId: string;
  extractedText: string;
}

// ============================================
// Constants
// ============================================

/** Content types that support text extraction */
const EXTRACTABLE_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/markdown",
]);

// ============================================
// Activity: Get Attachment Metadata
// ============================================

/**
 * Fetch attachment metadata for extraction (READ-ONLY).
 */
export async function getAttachmentForExtraction(
  attachmentId: string
): Promise<AttachmentMetadata | null> {
  console.log(`[Attachment] Fetching attachment ${attachmentId}`);

  const attachment = await prisma.knowledgeAttachment.findUnique({
    where: { id: attachmentId },
    select: {
      id: true,
      articleId: true,
      workspaceId: true,
      fileName: true,
      contentType: true,
      sizeBytes: true,
      storageKey: true,
    },
  });

  if (!attachment) {
    console.log(`[Attachment] Attachment ${attachmentId} not found`);
    return null;
  }

  return attachment;
}

// ============================================
// Activity: Extract Text from Attachment
// ============================================

/**
 * Extract text from an attachment using LLM vision capabilities.
 *
 * Supports:
 * - Images (PNG, JPEG, GIF, WebP) - Uses LLM vision for OCR
 * - PDFs - Uses PDF parsing or LLM vision for scanned documents
 * - Plain text/markdown - Direct read
 *
 * Note: For production, this would download from S3/R2 first.
 * Currently uses a stub implementation.
 */
export async function extractTextFromAttachment(
  input: ExtractTextInput
): Promise<ExtractTextOutput> {
  const { contentType, fileName, storageKey } = input;

  console.log(`[Attachment] Extracting text from ${fileName} (${contentType})`);

  // Check if content type is extractable
  if (!EXTRACTABLE_CONTENT_TYPES.has(contentType)) {
    return {
      success: false,
      error: `Content type ${contentType} is not supported for text extraction`,
    };
  }

  try {
    // For plain text and markdown, we would read the file directly
    if (contentType.startsWith("text/")) {
      // TODO: Download file from storage and read content
      console.log(`[Attachment] Text file extraction (stub): ${storageKey}`);
      return {
        success: true,
        text: `[Text content from ${fileName}]`,
      };
    }

    // For images and PDFs, use LLM vision
    if (contentType.startsWith("image/") || contentType === "application/pdf") {
      console.log(`[Attachment] Using LLM vision for ${contentType}`);

      // TODO: Download file from storage
      // TODO: For PDFs, convert pages to images
      // TODO: Send to LLM vision API using getLLM()

      // In a real implementation, we would:
      // 1. Download the file from S3/R2
      // 2. Convert PDF pages to images if needed
      // 3. Send each image to LLM.chat with vision capability

      // For now, return a placeholder
      console.log(`[Attachment] Vision extraction (stub): ${storageKey}`);

      return {
        success: true,
        text: `[Extracted text from ${fileName} using vision]\n\nThis is a placeholder. In production, this would contain the actual extracted text from the ${contentType} file using LLM vision capabilities.`,
      };
    }

    return {
      success: false,
      error: `Unexpected content type: ${contentType}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Attachment] Extraction error: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================
// Activity: Store Extracted Text
// ============================================

/**
 * Store extracted text for an attachment via tRPC internal procedure.
 */
export async function storeAttachmentText(
  input: StoreAttachmentTextInput
): Promise<{ success: boolean }> {
  const { attachmentId, extractedText } = input;

  console.log(
    `[Attachment] Storing extracted text for ${attachmentId} (${extractedText.length} chars)`
  );

  const caller = getInternalCaller();
  await caller.internal.storeAttachmentExtractedText({
    attachmentId,
    extractedText,
  });

  return { success: true };
}
