/**
 * Re-pairs files GitHub reported as an unrelated deletion and addition when they are really one file that
 * was renamed and edited.
 *
 * Git only calls something a rename above a similarity threshold, so a file that moved *and* changed
 * substantially comes back as two entries, and the files API has no knob to loosen that. This pass
 * re-joins the obvious cases: a deletion and an addition sharing a filename, whose contents still look
 * like each other. The pair is replaced by one `renamed` entry carrying a patch PRism computes itself,
 * which is what lets every existing view — split panes, word diff, minimap, rendered markdown — treat it
 * as the single file it is, with no knowledge that GitHub disagreed.
 *
 * The reader can also pair two files by hand, for the ones this cannot reach on its own — a file that
 * changed extension, or was rewritten past recognition. A forced pair skips every test here, because the
 * only question those tests answer is whether the pair was a good guess, and a forced one is not a guess.
 */

import type { PRFile }           from '@/lib/api/githubClient';
import { buildUnifiedPatch }     from '@/lib/diff/patchDiff';
import type { ForcedFilePair }   from '@/lib/forcedFilePairs';
import { isRenderableMediaFile } from '@/lib/mediaFiles';

/**
 * Share of lines that must survive for a pair to be one file. Deliberately below git's own 50%, since
 * the pairs worth rescuing here are exactly the ones that threshold rejected.
 */
const MIN_SIMILARITY = 0.3;

/**
 * Pairs investigated per pull request. They are confirmed together, so this also bounds how many file
 * fetches are in flight at once — a pull request with more basename matches than this is a refactor
 * sweeping enough that git will have paired most of it up already.
 */
const MAX_CANDIDATES = 10;

/** Ceiling on the combined line count worth diffing, above which the patch is not worth the memory. */
const MAX_COMBINED_LINES = 12000;

/**
 * Ceiling on the edit distance of a merged pair. A pair that got this far is similar by line content, so
 * a script longer than this means the shared lines are scattered rather than aligned — not a rename.
 */
const MAX_EDIT_DISTANCE = 1500;

/**
 * The same ceiling for a pair the reader forced. It is higher because there is no longer a guess to
 * disprove — the two files are as far apart as the reader says they are, and the budget is only here to
 * keep Myers from taking the tab down with it.
 */
const MAX_FORCED_EDIT_DISTANCE = 6000;

/**
 * Replaces deletion/addition pairs that are really renames with a single file entry. Files GitHub already
 * paired up are untouched, as is anything this cannot confirm, so a failure here only ever leaves the
 * original list. `forcedPairs` are the reader's own pairings: they are merged first and take any file they
 * name out of the running for a detected pair.
 */
export async function detectRenamedFiles(
	files: PRFile[],
	loadContent: RenameContentLoader,
	forcedPairs: ForcedFilePair[] = [],
	onForcedPairFailed?: ForcedPairFailureReporter
): Promise<PRFile[]> {
	const forced     = resolveForcedPairs(files, forcedPairs);
	const claimed    = new Set(forced.flatMap(pair => [ pair.removed.filename, pair.added.filename ]));
	const candidates = [
		...forced,
		...findRenameCandidates(files).filter(pair => !claimed.has(pair.removed.filename) && !claimed.has(pair.added.filename)),
	];
	if (!candidates.length) {
		return files;
	}

	// Confirmed together: the file list is already waiting on this, so it costs one round trip, not one
	// per candidate. A pull request with no candidates at all fetches nothing and pays nothing.
	// A detected pair that does not work out is simply not a rename and says nothing. A forced one is a
	// request that failed, so its reason is reported rather than swallowed.
	const confirmed = await Promise.all(candidates.map(candidate => confirmRename(
		candidate,
		loadContent,
		!candidate.forced || !onForcedPairFailed
			? undefined
			: reason => onForcedPairFailed({ removed : candidate.removed.filename, added : candidate.added.filename }, reason)
	)));

	const merged  = new Map<string, PRFile>();
	const dropped = new Set<string>();

	confirmed.forEach((pair, index) => {
		if (pair) {
			merged.set(candidates[index].added.filename, pair);
			dropped.add(candidates[index].removed.filename);
		}
	});

	if (!merged.size) {
		return files;
	}

	// The merged entry takes the added file's place, so the list keeps the order GitHub returned it in.
	return files
		.filter(file => !(file.status === 'removed' && dropped.has(file.filename)))
		.map(file => merged.get(file.filename) ?? file);
}

/**
 * Deletions and additions that share a filename — the signal behind a file moved between directories,
 * which is the case git's threshold misses most often. A name claimed by more than one file on either
 * side is skipped rather than guessed at.
 */
export function findRenameCandidates(files: PRFile[]): RenameCandidate[] {
	const removed = groupByBasename(files.filter(file => file.status === 'removed'));
	const added   = groupByBasename(files.filter(file => file.status === 'added'));

	const candidates: RenameCandidate[] = [];
	for (const [ basename, removedFiles ] of removed) {
		const addedFiles = added.get(basename);
		if (!addedFiles || removedFiles.length !== 1 || addedFiles.length !== 1) {
			continue;
		}
		if (isRenderableMediaFile(basename)) {
			continue;
		}
		candidates.push({ removed : removedFiles[0], added : addedFiles[0] });
	}

	return candidates.slice(0, MAX_CANDIDATES);
}

/**
 * Fraction of lines the two sides still share, counted as a multiset so repeated lines cannot inflate the
 * score. Blank lines are ignored entirely — every source file is full of them, and counting them would
 * make any two files look alike.
 */
export function lineSimilarity(oldLines: string[], newLines: string[]): number {
	const remaining = new Map<string, number>();
	let oldCount    = 0;
	for (const line of oldLines) {
		if (!line.trim()) {
			continue;
		}
		oldCount++;
		remaining.set(line, (remaining.get(line) ?? 0) + 1);
	}

	let newCount = 0;
	let shared   = 0;
	for (const line of newLines) {
		if (!line.trim()) {
			continue;
		}
		newCount++;
		const left = remaining.get(line) ?? 0;
		if (left > 0) {
			remaining.set(line, left - 1);
			shared++;
		}
	}

	const longest = Math.max(oldCount, newCount);
	return longest === 0 ? 0 : shared / longest;
}

/** Fetches both sides and, if they still look like one file, builds the entry that says so. */
async function confirmRename(candidate: RenameCandidate, loadContent: RenameContentLoader, onFailure?: (reason: string) => void): Promise<PRFile | null> {
	// Each side is taken from its own patch where that holds the whole file, and fetched otherwise.
	const [ base, head ] = await Promise.all([
		readSide(candidate.removed, '-', 'base', loadContent),
		readSide(candidate.added, '+', 'head', loadContent),
	]);
	if (base.content === null) {
		onFailure?.(`Could not read ${candidate.removed.filename} from the base commit${base.error ? `: ${base.error}` : ''}`);
		return null;
	}
	if (head.content === null) {
		onFailure?.(`Could not read ${candidate.added.filename} from the head commit${head.error ? `: ${head.error}` : ''}`);
		return null;
	}

	// Split exactly as the split view does, so the patch's line numbers address the lines it renders.
	const oldLines = base.content.split('\n');
	const newLines = head.content.split('\n');
	if (oldLines.length + newLines.length > MAX_COMBINED_LINES) {
		onFailure?.(`${candidate.removed.filename} and ${candidate.added.filename} are too large to diff together (${oldLines.length + newLines.length} lines)`);
		return null;
	}

	// A forced pair has already been judged by the reader, so neither the resemblance test nor a null
	// patch can overrule it: the two are shown as one file whatever their contents turn out to be.
	if (!candidate.forced && lineSimilarity(oldLines, newLines) < MIN_SIMILARITY) {
		return null;
	}

	const budget = candidate.forced ? MAX_FORCED_EDIT_DISTANCE : MAX_EDIT_DISTANCE;
	const patch  = buildUnifiedPatch(oldLines, newLines, budget) ?? (candidate.forced ? buildReplacementPatch(oldLines, newLines) : null);
	if (patch === null) {
		return null;
	}

	const additions = countPatchLines(patch, '+');
	const deletions = countPatchLines(patch, '-');

	return {
		sha               : candidate.added.sha,
		filename          : candidate.added.filename,
		previous_filename : candidate.removed.filename,
		status            : 'renamed',
		additions,
		deletions,
		changes           : additions + deletions,
		synthesizedRename : true,
		...(candidate.forced ? { forcedRename : true } : {}),
		...(patch ? { patch } : {}),
	};
}

/**
 * Turns stored paths back into the pair of files they name. A pair whose halves are no longer in the pull
 * request — the commit that deleted the file was dropped, say — is skipped, leaving GitHub's own entries.
 */
function resolveForcedPairs(files: PRFile[], forcedPairs: ForcedFilePair[]): RenameCandidate[] {
	const byPath                   = new Map(files.map(file => [ file.filename, file ]));
	const pairs: RenameCandidate[] = [];
	for (const { removed : removedPath, added : addedPath } of forcedPairs) {
		const removed = byPath.get(removedPath);
		const added   = byPath.get(addedPath);
		if (removed?.status === 'removed' && added?.status === 'added') {
			pairs.push({ removed, added, forced : true });
		}
	}
	return pairs;
}

/**
 * The patch for two files with nothing worth aligning: every old line goes, every new line arrives. Only
 * reached on a forced pair whose edit script blew the budget, where showing the two side by side as a
 * wholesale rewrite still beats leaving the reader with two unconnected files.
 */
function buildReplacementPatch(oldLines: string[], newLines: string[]): string {
	return [
		`@@ -1,${oldLines.length} +1,${newLines.length} @@`,
		...oldLines.map(line => `-${line}`),
		...newLines.map(line => `+${line}`),
	].join('\n');
}

/**
 * One side's contents, preferring the file's own patch and falling back to a fetch. A read that throws is
 * reported rather than lost, since a forced pair failing for a reason nobody can see is worse than useless.
 */
async function readSide(file: PRFile, marker: '+' | '-', side: 'base' | 'head', loadContent: RenameContentLoader): Promise<{ content: string | null; error: string }> {
	const fromPatch = wholeFileFromPatch(file, marker);
	if (fromPatch !== null) {
		return { content : fromPatch, error : '' };
	}
	try {
		return { content : await loadContent(file.filename, side), error : '' };
	}
	catch (error: any) {
		return { content : null, error : error?.message || 'the read failed' };
	}
}

/**
 * A file GitHub reports as purely added or purely deleted carries its entire contents in its own patch, as
 * one unbroken run of + or - lines. Taking it from there costs no request and cannot be defeated by a ref
 * the contents API will not resolve — which is most of what a deletion/addition pair runs into. Anything
 * that does not match that shape exactly, including a patch GitHub truncated, falls through to a fetch.
 */
function wholeFileFromPatch(file: PRFile, marker: '+' | '-'): string | null {
	const lines = file.patch?.split('\n');
	if (!lines?.length || !lines[0].startsWith('@@')) {
		return null;
	}
	const body     = lines.slice(1);
	const expected = marker === '+' ? file.additions : file.deletions;
	if (!body.length || body.length !== expected || body.some(line => !line.startsWith(marker))) {
		return null;
	}
	return body.map(line => line.slice(1)).join('\n');
}

function groupByBasename(files: PRFile[]): Map<string, PRFile[]> {
	const groups = new Map<string, PRFile[]>();
	for (const file of files) {
		const basename = file.filename.split('/').pop() ?? file.filename;
		const existing = groups.get(basename);
		if (existing) {
			existing.push(file);
		}
		else {
			groups.set(basename, [ file ]);
		}
	}
	return groups;
}

function countPatchLines(patch: string, marker: '+' | '-'): number {
	let count = 0;
	for (const line of patch.split('\n')) {
		if (line.startsWith(marker)) {
			count++;
		}
	}
	return count;
}

/** Reads one side of one file. Returning null abandons the pair, leaving GitHub's own entries in place. */
export type RenameContentLoader = (path: string, side: 'base' | 'head') => Promise<string | null>;

/** Told why a pair the reader forced could not be built, so the UI can say so instead of quietly undoing it. */
export type ForcedPairFailureReporter = (pair: ForcedFilePair, reason: string) => void;

export interface RenameCandidate {
	removed: PRFile;
	added: PRFile;
	/** Set when the reader paired these by hand, which waives the checks that guess at a pair. */
	forced?: boolean;
}
