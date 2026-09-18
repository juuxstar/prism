/**
 * File contents, addressed by the commit they belong to.
 *
 * A blob at `(repo, commit, path)` is immutable — the commit names the exact bytes — so an entry here can
 * never go stale and is never dropped on a refresh. That is the difference between re-reading a pull request
 * and re-downloading it: pushing a commit invalidates the file *list*, but every file the commit did not
 * touch keeps the same sha in the tree and is still served from here.
 *
 * Eviction is therefore about memory, not correctness: least-recently-used first, once the byte budget is hit.
 * The cache is deliberately not reactive — its values are handed to component state, which is.
 */
const MAX_BYTES = 50 * 1024 * 1024;

/** Insertion order is the LRU order: a hit re-inserts, so the oldest live entry is always first. */
const entries = new Map<string, string>();
let heldBytes = 0;

export function peekBlob(target: BlobTarget): string | undefined {
	const key   = blobKey(target);
	const value = entries.get(key);
	if (value === undefined) {
		return undefined;
	}
	entries.delete(key);
	entries.set(key, value);
	return value;
}

export function storeBlob(target: BlobTarget, content: string): void {
	const key      = blobKey(target);
	const existing = entries.get(key);
	if (existing !== undefined) {
		heldBytes -= existing.length;
		entries.delete(key);
	}
	entries.set(key, content);
	heldBytes += content.length;
	evictToBudget();
}

/** Only for signing out — the cache is otherwise self-invalidating, because its keys name commits. */
export function clearBlobs(): void {
	entries.clear();
	heldBytes = 0;
}

function evictToBudget(): void {
	for (const [ key, value ] of entries) {
		if (heldBytes <= MAX_BYTES) {
			return;
		}
		entries.delete(key);
		heldBytes -= value.length;
	}
}

function blobKey(target: BlobTarget): string {
	// The encoding is part of the key: the same blob is held as text for the diff panes and as base64 for the
	// media ones, and neither is derivable from the other cheaply enough to be worth it.
	return `${target.encoding}:${target.owner}/${target.repo}:${target.ref}:${target.path}`;
}

export interface BlobTarget {
	owner: string;
	repo: string;
	/** A commit sha. Passing a branch name would make the key mutable and the cache wrong. */
	ref: string;
	path: string;
	encoding: 'text' | 'base64';
}
