import { describe, it, expect } from "vitest";
import {
  buildMerkleTree,
  diffMerkleTrees,
  computeNodeHash,
} from "../merkle/index";
import type { MerkleEntry } from "../merkle/index";

describe("computeNodeHash", () => {
  it("produces deterministic output for same input", () => {
    const hash1 = computeNodeHash(["abc", "def"]);
    const hash2 = computeNodeHash(["abc", "def"]);
    expect(hash1).toBe(hash2);
  });

  it("sorts child hashes before computing", () => {
    const hash1 = computeNodeHash(["abc", "def"]);
    const hash2 = computeNodeHash(["def", "abc"]);
    expect(hash1).toBe(hash2);
  });

  it("produces different output for different input", () => {
    const hash1 = computeNodeHash(["abc"]);
    const hash2 = computeNodeHash(["def"]);
    expect(hash1).not.toBe(hash2);
  });

  it("handles empty array", () => {
    const hash = computeNodeHash([]);
    expect(hash).toBeTruthy();
    expect(typeof hash).toBe("string");
  });
});

describe("buildMerkleTree", () => {
  it("builds tree from empty entries", () => {
    const tree = buildMerkleTree([]);
    expect(tree.rootHash).toBeTruthy();
    expect(tree.root.path).toBe("/");
  });

  it("builds tree from single file", () => {
    const entries: MerkleEntry[] = [
      { path: "src/index.ts", contentHash: "hash1" },
    ];
    const tree = buildMerkleTree(entries);

    expect(tree.rootHash).toBeTruthy();
    expect(tree.root.children).toBeDefined();
    expect(tree.root.children!.length).toBe(1);
  });

  it("builds tree from multiple files in same directory", () => {
    const entries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hashA" },
      { path: "src/b.ts", contentHash: "hashB" },
    ];
    const tree = buildMerkleTree(entries);

    expect(tree.root.children).toBeDefined();
    expect(tree.root.children!.length).toBe(1); // "src" directory
    const srcNode = tree.root.children![0]!;
    expect(srcNode.path).toBe("src");
    expect(srcNode.children).toBeDefined();
    expect(srcNode.children!.length).toBe(2);
  });

  it("builds tree from nested directory structure", () => {
    const entries: MerkleEntry[] = [
      { path: "src/lib/utils.ts", contentHash: "hash1" },
      { path: "src/lib/format.ts", contentHash: "hash2" },
      { path: "src/index.ts", contentHash: "hash3" },
      { path: "README.md", contentHash: "hash4" },
    ];
    const tree = buildMerkleTree(entries);

    expect(tree.root.children).toBeDefined();
    // Should have "src" and "README.md" at top level
    expect(tree.root.children!.length).toBe(2);
  });

  it("produces same hash for same content regardless of entry order", () => {
    const entries1: MerkleEntry[] = [
      { path: "a.ts", contentHash: "hash1" },
      { path: "b.ts", contentHash: "hash2" },
    ];
    const entries2: MerkleEntry[] = [
      { path: "b.ts", contentHash: "hash2" },
      { path: "a.ts", contentHash: "hash1" },
    ];

    const tree1 = buildMerkleTree(entries1);
    const tree2 = buildMerkleTree(entries2);
    expect(tree1.rootHash).toBe(tree2.rootHash);
  });

  it("produces different hash when content changes", () => {
    const entries1: MerkleEntry[] = [
      { path: "a.ts", contentHash: "hash1" },
    ];
    const entries2: MerkleEntry[] = [
      { path: "a.ts", contentHash: "hash2" },
    ];

    const tree1 = buildMerkleTree(entries1);
    const tree2 = buildMerkleTree(entries2);
    expect(tree1.rootHash).not.toBe(tree2.rootHash);
  });
});

describe("diffMerkleTrees", () => {
  it("returns all paths when oldTree is null (first index)", () => {
    const entries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
      { path: "src/b.ts", contentHash: "hash2" },
    ];
    const newTree = buildMerkleTree(entries);
    const changed = diffMerkleTrees(null, newTree);

    expect(changed).toHaveLength(2);
    expect(changed).toContain("src/a.ts");
    expect(changed).toContain("src/b.ts");
  });

  it("returns empty array when trees are identical", () => {
    const entries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
      { path: "src/b.ts", contentHash: "hash2" },
    ];
    const tree1 = buildMerkleTree(entries);
    const tree2 = buildMerkleTree(entries);
    const changed = diffMerkleTrees(tree1, tree2);

    expect(changed).toHaveLength(0);
  });

  it("detects single file change", () => {
    const oldEntries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
      { path: "src/b.ts", contentHash: "hash2" },
    ];
    const newEntries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1_changed" },
      { path: "src/b.ts", contentHash: "hash2" },
    ];

    const oldTree = buildMerkleTree(oldEntries);
    const newTree = buildMerkleTree(newEntries);
    const changed = diffMerkleTrees(oldTree, newTree);

    expect(changed).toContain("src/a.ts");
    expect(changed).not.toContain("src/b.ts");
  });

  it("detects new file addition", () => {
    const oldEntries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
    ];
    const newEntries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
      { path: "src/b.ts", contentHash: "hash2" },
    ];

    const oldTree = buildMerkleTree(oldEntries);
    const newTree = buildMerkleTree(newEntries);
    const changed = diffMerkleTrees(oldTree, newTree);

    expect(changed).toContain("src/b.ts");
    expect(changed).not.toContain("src/a.ts");
  });

  it("detects changes in deeply nested files", () => {
    const oldEntries: MerkleEntry[] = [
      { path: "src/lib/utils/format.ts", contentHash: "hash1" },
      { path: "src/lib/utils/date.ts", contentHash: "hash2" },
      { path: "src/index.ts", contentHash: "hash3" },
    ];
    const newEntries: MerkleEntry[] = [
      { path: "src/lib/utils/format.ts", contentHash: "hash1_changed" },
      { path: "src/lib/utils/date.ts", contentHash: "hash2" },
      { path: "src/index.ts", contentHash: "hash3" },
    ];

    const oldTree = buildMerkleTree(oldEntries);
    const newTree = buildMerkleTree(newEntries);
    const changed = diffMerkleTrees(oldTree, newTree);

    expect(changed).toContain("src/lib/utils/format.ts");
    expect(changed).not.toContain("src/lib/utils/date.ts");
    expect(changed).not.toContain("src/index.ts");
  });

  it("handles root-level files", () => {
    const oldEntries: MerkleEntry[] = [
      { path: "README.md", contentHash: "hash1" },
      { path: "package.json", contentHash: "hash2" },
    ];
    const newEntries: MerkleEntry[] = [
      { path: "README.md", contentHash: "hash1_changed" },
      { path: "package.json", contentHash: "hash2" },
    ];

    const oldTree = buildMerkleTree(oldEntries);
    const newTree = buildMerkleTree(newEntries);
    const changed = diffMerkleTrees(oldTree, newTree);

    expect(changed).toContain("README.md");
    expect(changed).not.toContain("package.json");
  });

  it("detects new directory with files", () => {
    const oldEntries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
    ];
    const newEntries: MerkleEntry[] = [
      { path: "src/a.ts", contentHash: "hash1" },
      { path: "tests/a.test.ts", contentHash: "hashTest" },
    ];

    const oldTree = buildMerkleTree(oldEntries);
    const newTree = buildMerkleTree(newEntries);
    const changed = diffMerkleTrees(oldTree, newTree);

    expect(changed).toContain("tests/a.test.ts");
    expect(changed).not.toContain("src/a.ts");
  });
});
