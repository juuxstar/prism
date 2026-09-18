/**
 * Pairs the reader has forced together: a deletion and an addition PRism's own rename detection did not
 * join, usually because the two differ too much or no longer share a filename. The choice is the reader's
 * assertion that these are one file, so it outranks every heuristic and is remembered per pull request.
 */

const STORAGE_PREFIX = 'prism.forcedFilePairs.v1';

export function loadForcedFilePairs(scope: ForcedPairScope): ForcedFilePair[] {
	try {
		const raw = localStorage.getItem(storageKey(scope));
		return raw ? normalizePairs(JSON.parse(raw)) : [];
	}
	catch {
		return [];
	}
}

/**
 * Records one pair, dropping any existing pair that already claims either side — a file belongs to at most
 * one pair, and choosing a new partner replaces the old one rather than pairing twice.
 */
export function addForcedFilePair(scope: ForcedPairScope, pair: ForcedFilePair): ForcedFilePair[] {
	const kept = loadForcedFilePairs(scope).filter(existing => (
		existing.removed !== pair.removed && existing.added !== pair.added
	));
	return saveForcedFilePairs(scope, [ ...kept, pair ]);
}

export function removeForcedFilePair(scope: ForcedPairScope, pair: ForcedFilePair): ForcedFilePair[] {
	const kept = loadForcedFilePairs(scope).filter(existing => (
		existing.removed !== pair.removed || existing.added !== pair.added
	));
	return saveForcedFilePairs(scope, kept);
}

function saveForcedFilePairs(scope: ForcedPairScope, pairs: ForcedFilePair[]): ForcedFilePair[] {
	try {
		if (pairs.length) {
			localStorage.setItem(storageKey(scope), JSON.stringify(pairs));
		}
		else {
			localStorage.removeItem(storageKey(scope));
		}
	}
	catch {
		// A full or blocked store only costs the pair its memory across reloads, so carry on with it applied.
	}
	return pairs;
}

/** Stored pairs are read back as unknown: a hand-edited or outdated entry is dropped, not trusted. */
function normalizePairs(raw: unknown): ForcedFilePair[] {
	if (!Array.isArray(raw)) {
		return [];
	}
	return raw.filter((entry): entry is ForcedFilePair => (
		Boolean(entry)
		&& typeof entry === 'object'
		&& typeof (entry as ForcedFilePair).removed === 'string'
		&& typeof (entry as ForcedFilePair).added === 'string'
		&& Boolean((entry as ForcedFilePair).removed)
		&& Boolean((entry as ForcedFilePair).added)
	));
}

function storageKey(scope: ForcedPairScope): string {
	return [
		STORAGE_PREFIX,
		encodeURIComponent(scope.owner),
		encodeURIComponent(scope.repo),
		String(scope.prNumber),
	].join(':');
}

export interface ForcedPairScope {
	owner: string;
	repo: string;
	prNumber: number;
}

/** The deleted path and the added path the reader says are the same file. */
export interface ForcedFilePair {
	removed: string;
	added: string;
}
