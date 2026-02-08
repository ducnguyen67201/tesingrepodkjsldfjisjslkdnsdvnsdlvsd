// ============================================================
// MERKLE TREE - Change detection for incremental indexing
// ============================================================
// Pure functions (no side effects, no node:crypto) - safe for
// Temporal workflow sandbox import.
//
// Used by githubIndexWorkflow to detect which files actually changed
// between pushes. Only truly changed chunks get re-embedded.
//
// Uses a simple string-based hash for node computation. This is for
// change detection only (not security), so a fast pure-JS hash suffices.
// ============================================================

// ============================================================
// Types
// ============================================================

export interface MerkleNode {
  /** Hash of this node (leaf = contentHash, internal = FNV-1a hash of sorted children) */
  hash: string;
  /** File path segment or full path for leaf nodes */
  path: string;
  /** Child nodes (undefined for leaf nodes) */
  children?: MerkleNode[];
}

export interface MerkleTree {
  /** Root node of the tree */
  root: MerkleNode;
  /** Root hash (shorthand for root.hash) */
  rootHash: string;
}

export interface MerkleEntry {
  /** File path (e.g., "src/lib/utils.ts") */
  path: string;
  /** Content hash of the file/chunk */
  contentHash: string;
}

// ============================================================
// Public API
// ============================================================

/**
 * Build a Merkle tree from an array of { path, contentHash } entries.
 *
 * Tree structure mirrors the directory hierarchy:
 * - Leaf nodes = files, hash = contentHash
 * - Internal nodes = directories, hash = SHA-256 of sorted child hashes
 *
 * @param entries - Array of file entries with path and contentHash
 * @returns MerkleTree with root node and root hash
 */
export function buildMerkleTree(entries: MerkleEntry[]): MerkleTree {
  if (entries.length === 0) {
    const emptyHash = computeNodeHash([]);
    const root: MerkleNode = { hash: emptyHash, path: "/" };
    return { root, rootHash: emptyHash };
  }

  // Group entries by top-level path segment
  const root = buildNode("/", entries);
  return { root, rootHash: root.hash };
}

/**
 * Diff two Merkle trees and return paths that changed.
 *
 * Walks both trees in parallel. When a node hash differs,
 * collects all leaf paths under that subtree as "changed".
 *
 * @param oldTree - Previous tree (null = first index, all paths are "changed")
 * @param newTree - Current tree
 * @returns Array of file paths that changed
 */
export function diffMerkleTrees(
  oldTree: MerkleTree | null,
  newTree: MerkleTree
): string[] {
  if (!oldTree) {
    // First index - all paths are changed
    return collectLeafPaths(newTree.root);
  }

  if (oldTree.rootHash === newTree.rootHash) {
    // Trees are identical - no changes
    return [];
  }

  const changedPaths: string[] = [];
  diffNodes(oldTree.root, newTree.root, changedPaths);
  return changedPaths;
}

/**
 * Compute a hash from an array of child hashes.
 * Sorts hashes first to ensure deterministic output regardless of child order.
 *
 * Uses a fast pure-JS hash (no node:crypto dependency) since this is for
 * change detection, not security. The hash is deterministic and collision-resistant
 * enough for Merkle tree diff purposes.
 *
 * @param childHashes - Array of hash strings
 * @returns Hex-encoded hash string
 */
export function computeNodeHash(childHashes: string[]): string {
  const sorted = [...childHashes].sort();
  return simpleHash(sorted.join(":"));
}

// ============================================================
// Internal Helpers
// ============================================================

/**
 * Recursively build a MerkleNode from grouped entries.
 */
function buildNode(name: string, entries: MerkleEntry[]): MerkleNode {
  // Group entries by first path segment
  const groups = new Map<string, MerkleEntry[]>();

  for (const entry of entries) {
    const segments = entry.path.split("/");

    if (segments.length === 1) {
      // Leaf node - file at this level
      groups.set(entry.path, [entry]);
    } else {
      // Internal node - group by first segment
      const firstSegment = segments[0]!;
      const rest: MerkleEntry = {
        path: segments.slice(1).join("/"),
        contentHash: entry.contentHash,
      };

      const existing = groups.get(firstSegment);
      if (existing) {
        existing.push(rest);
      } else {
        groups.set(firstSegment, [rest]);
      }
    }
  }

  // Build children
  const children: MerkleNode[] = [];

  for (const [segment, groupEntries] of groups) {
    if (groupEntries.length === 1 && groupEntries[0]!.path === segment) {
      // Leaf node
      children.push({
        hash: groupEntries[0]!.contentHash,
        path: segment,
      });
    } else {
      // Internal node - recurse
      children.push(buildNode(segment, groupEntries));
    }
  }

  // Compute hash from sorted child hashes
  const hash = computeNodeHash(children.map((c) => c.hash));

  return { hash, path: name, children };
}

/**
 * Recursively diff two nodes, collecting changed leaf paths.
 */
function diffNodes(
  oldNode: MerkleNode,
  newNode: MerkleNode,
  changedPaths: string[],
  prefix = ""
): void {
  // Same hash = no changes in this subtree
  if (oldNode.hash === newNode.hash) {
    return;
  }

  // Both are leaf nodes with different hashes
  if (!oldNode.children && !newNode.children) {
    const fullPath = prefix ? `${prefix}/${newNode.path}` : newNode.path;
    changedPaths.push(fullPath);
    return;
  }

  // New node is a leaf but old was a directory (structural change)
  if (!newNode.children) {
    const fullPath = prefix ? `${prefix}/${newNode.path}` : newNode.path;
    changedPaths.push(fullPath);
    return;
  }

  // Old node is a leaf but new is a directory (structural change)
  if (!oldNode.children) {
    changedPaths.push(...collectLeafPaths(newNode, prefix));
    return;
  }

  // Both are directories - diff children
  const oldChildMap = new Map(
    oldNode.children.map((c) => [c.path, c])
  );

  const currentPrefix = buildPrefix(prefix, newNode.path);

  // Check children in new tree
  for (const child of newNode.children) {
    const oldChild = oldChildMap.get(child.path);

    if (!oldChild) {
      // New child - all its leaves are changed
      changedPaths.push(...collectLeafPaths(child, currentPrefix));
    } else {
      // Exists in both - recurse
      diffNodes(oldChild, child, changedPaths, currentPrefix);
    }
  }

  // Files in old tree but not in new tree are removed (not "changed" - we don't need to re-embed removed files)
}

/**
 * Build a path prefix, handling the root "/" case.
 */
function buildPrefix(prefix: string, segment: string): string {
  if (segment === "/") return prefix;
  return prefix ? `${prefix}/${segment}` : segment;
}

/**
 * Collect all leaf paths under a node.
 *
 * @param node - The node to collect from
 * @param prefix - Path prefix accumulated so far (does NOT include node.path)
 */
function collectLeafPaths(node: MerkleNode, prefix = ""): string[] {
  const currentPrefix = buildPrefix(prefix, node.path);

  if (!node.children) {
    // Leaf node - currentPrefix is the full path
    return [currentPrefix];
  }

  const paths: string[] = [];
  for (const child of node.children) {
    paths.push(...collectLeafPaths(child, currentPrefix));
  }
  return paths;
}

/**
 * Simple deterministic hash function (FNV-1a inspired, 64-bit output as hex).
 * Pure JS - no node:crypto dependency, safe for Temporal workflow sandbox.
 *
 * NOT for cryptographic use - only for Merkle tree change detection.
 */
function simpleHash(input: string): string {
  // Use two 32-bit FNV-1a hashes with different offsets for a 64-bit result
  let h1 = 0x811c9dc5; // FNV offset basis
  let h2 = 0x01000193; // Secondary seed

  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193); // FNV prime
    h2 ^= c;
    h2 = Math.imul(h2, 0x1000193b); // Different prime
  }

  // Convert to unsigned and format as hex
  const hex1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const hex2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return hex1 + hex2;
}
