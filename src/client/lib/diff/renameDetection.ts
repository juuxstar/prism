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
 */

import type { PRFile }           from '@/lib/api/githubClient';
import { buildUnifiedPatch }     from '@/lib/diff/patchDiff';
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
 * Replaces deletion/addition pairs that are really renames with a single file entry. Files GitHub already
 * paired up are untouched, as is anything this cannot confirm, so a failure here only ever leaves the
 * original list.
 */
export async function detectRenamedFiles(files: PRFile[], loadContent: RenameContentLoader): Promise<PRFile[]> {
	const candidates = findRenameCandidates(files);
	if (!candidates.length) {
		return files;
	}

	// Confirmed together: the file list is already waiting on this, so it costs one round trip, not one
	// per candidate. A pull request with no candidates at all fetches nothing and pays nothing.
	const confirmed = await Promise.all(candidates.map(candidate => confirmRename(candidate, loadContent)));

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
async function confirmRename(candidate: RenameCandidate, loadContent: RenameContentLoader): Promise<PRFile | null> {
	const [ base, head ] = await Promise.all([
		loadContent(candidate.removed.filename, 'base'),
		loadContent(candidate.added.filename, 'head'),
	]);
	if (base === null || head === null) {
		return null;
	}

	// Split exactly as the split view does, so the patch's line numbers address the lines it renders.
	const oldLines = base.split('\n');
	const newLines = head.split('\n');
	if (oldLines.length + newLines.length > MAX_COMBINED_LINES) {
		return null;
	}
	if (lineSimilarity(oldLines, newLines) < MIN_SIMILARITY) {
		return null;
	}

	const patch = buildUnifiedPatch(oldLines, newLines, MAX_EDIT_DISTANCE);
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
		...(patch ? { patch } : {}),
	};
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

export interface RenameCandidate {
	removed: PRFile;
	added: PRFile;
}
