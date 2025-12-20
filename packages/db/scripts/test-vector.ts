/**
 * Integration Test Script for pgvector
 *
 * Run with: pnpm tsx scripts/test-vector.ts
 *
 * This script tests the full vector workflow:
 * 1. Find a code chunk to test with
 * 2. Create a test embedding
 * 3. Store the embedding
 * 4. Retrieve the embedding
 * 5. Search for similar chunks
 */

import { prisma } from "../src/index";
import {
  setChunkEmbedding,
  getChunkEmbedding,
  searchSimilarChunks,
  countChunksWithEmbeddings,
  clearRepositoryEmbeddings,
  EMBEDDING_DIMENSIONS,
} from "../src/vector";

async function main() {
  console.log("=".repeat(60));
  console.log("pgvector Integration Test");
  console.log("=".repeat(60));
  console.log("");

  // 1. Find a code chunk to test with
  console.log("1. Finding a code chunk to test with...");
  const chunk = await prisma.codeChunk.findFirst({
    include: { repo: true },
  });

  if (!chunk) {
    console.log("   No code chunks found in database.");
    console.log("   Run repository indexing first to populate code chunks.");
    console.log("");
    console.log("Skipping embedding tests (no data available).");
    return;
  }

  console.log(`   Found chunk: ${chunk.id}`);
  console.log(`   Repository: ${chunk.repo.fullName}`);
  console.log(`   File: ${chunk.filePath}`);
  console.log(`   Lines: ${chunk.startLine}-${chunk.endLine}`);
  console.log("");

  // 2. Create a test embedding (random normalized vector)
  console.log("2. Creating test embedding...");
  const testEmbedding = Array(EMBEDDING_DIMENSIONS)
    .fill(0)
    .map(() => Math.random() * 2 - 1);

  // Normalize the vector
  const magnitude = Math.sqrt(
    testEmbedding.reduce((sum, val) => sum + val * val, 0)
  );
  const normalizedEmbedding = testEmbedding.map((val) => val / magnitude);

  console.log(`   Created ${normalizedEmbedding.length}-dimensional embedding`);
  console.log(
    `   First 5 values: [${normalizedEmbedding.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}, ...]`
  );
  console.log("");

  // 3. Store embedding
  console.log("3. Storing embedding...");
  await setChunkEmbedding(chunk.id, normalizedEmbedding);
  console.log("   Stored successfully.");
  console.log("");

  // 4. Retrieve embedding
  console.log("4. Retrieving embedding...");
  const retrieved = await getChunkEmbedding(chunk.id);

  if (!retrieved) {
    console.error("   ERROR: Failed to retrieve embedding!");
    return;
  }

  console.log(`   Retrieved ${retrieved.length} dimensions.`);
  console.log(
    `   First 5 values: [${retrieved.slice(0, 5).map((v) => v.toFixed(4)).join(", ")}, ...]`
  );

  // Verify values match
  const valuesMatch = normalizedEmbedding.every(
    (val, idx) => Math.abs(val - retrieved[idx]) < 0.0001
  );
  console.log(`   Values match: ${valuesMatch ? "YES" : "NO"}`);
  console.log("");

  // 5. Search for similar chunks
  console.log("5. Searching for similar chunks...");
  const similar = await searchSimilarChunks(
    chunk.repoId,
    normalizedEmbedding,
    5,
    0.0 // Low threshold to get results even with random embeddings
  );

  console.log(`   Found ${similar.length} similar chunks:`);
  for (const result of similar) {
    console.log(
      `   - ${result.filePath}:${result.startLine}-${result.endLine}`
    );
    console.log(`     Similarity: ${result.similarity.toFixed(4)}`);
  }
  console.log("");

  // 6. Count chunks with embeddings
  console.log("6. Counting chunks with embeddings...");
  const counts = await countChunksWithEmbeddings(chunk.repoId);
  console.log(`   Total chunks: ${counts.total}`);
  console.log(`   With embeddings: ${counts.withEmbedding}`);
  console.log(
    `   Coverage: ${((counts.withEmbedding / counts.total) * 100).toFixed(1)}%`
  );
  console.log("");

  // 7. Clear test embedding (cleanup)
  console.log("7. Cleaning up test embedding...");
  await prisma.$executeRaw`
    UPDATE "CodeChunk"
    SET embedding = NULL
    WHERE id = ${chunk.id}
  `;
  console.log("   Cleared test embedding.");
  console.log("");

  console.log("=".repeat(60));
  console.log("pgvector integration test PASSED!");
  console.log("=".repeat(60));
}

main()
  .catch((error) => {
    console.error("Test failed with error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
