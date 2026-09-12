import type { PRFile }                 from '@/lib/api/githubClient';
import type { SequenceEdit }           from '@/lib/diff/myers';
import { diffSequences }               from '@/lib/diff/myers';
import type { CommonBlock, PatchHunk } from '@/lib/diff/prDiffTypes';

/** Lines of unchanged context either side of a change, matching what GitHub's own patches carry. */
const PATCH_CONTEXT_LINES = 3;

/** Collapse runs of whitespace for ignore-all-whitespace line comparison (similar to `git diff -w` pairs). */
export function linesEqualIgnoringWhitespace(a: string, b: string): boolean {
	const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(' ');
	return norm(a) === norm(b);
}

function isGitPatchMetadataContext(line: { type: string; content: string }): boolean {
	return line.type === 'context' && line.content.startsWith('\\');
}

/**
 * True when the file's unified diff only contains line changes that differ in whitespace
 * (paired -/+ lines match after collapsing whitespace). Conservative: no patch, non-modified, or uneven blocks → false.
 */
export function isWhitespaceOnlyFileChange(file: PRFile): boolean {
	const st = file.status;
	if (st !== 'modified' && st !== 'renamed') {
		return false;
	}
	const raw = file.patch?.trim();
	if (!raw) {
		return false;
	}

	const hunks = parseHunks(raw);
	if (!hunks.length) {
		return false;
	}

	let sawChange = false;

	for (const hunk of hunks) {
		const lines = hunk.lines.filter(l => !isGitPatchMetadataContext(l));
		let i       = 0;
		while (i < lines.length) {
			if (lines[i].type === 'context') {
				i++;
				continue;
			}

			const dels: string[] = [];
			while (i < lines.length && lines[i].type === 'del') {
				dels.push(lines[i].content);
				i++;
			}
			const adds: string[] = [];
			while (i < lines.length && lines[i].type === 'add') {
				adds.push(lines[i].content);
				i++;
			}

			if (!dels.length && !adds.length) {
				continue;
			}
			if (dels.length !== adds.length) {
				return false;
			}
			sawChange = true;
			for (let j = 0; j < dels.length; j++) {
				if (!linesEqualIgnoringWhitespace(dels[j], adds[j])) {
					return false;
				}
			}
		}
	}

	return sawChange;
}

export function parseHunks(patch: string): PatchHunk[] {
	const hunks: PatchHunk[]      = [];
	let current: PatchHunk | null = null;
	for (const raw of patch.split('\n')) {
		if (raw.startsWith('@@')) {
			const m = raw.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
			if (m) {
				current = {
					oldStart : parseInt(m[1], 10),
					oldCount : parseInt(m[2] ?? '1', 10),
					newStart : parseInt(m[3], 10),
					newCount : parseInt(m[4] ?? '1', 10),
					lines    : [],
				};
				hunks.push(current);
			}
		}
		else if (current) {
			if (raw.startsWith('-')) {
				current.lines.push({ type : 'del', content : raw.slice(1) });
			}
			else if (raw.startsWith('+')) {
				current.lines.push({ type : 'add', content : raw.slice(1) });
			}
			else if (raw.length > 0 || current.lines.length > 0) {
				const content = raw.startsWith(' ') ? raw.slice(1) : raw;
				current.lines.push({ type : 'context', content });
			}
		}
	}
	return hunks;
}

export function computeCommonBlocks(patch: string | undefined, baseLineCount: number, headLineCount: number): CommonBlock[] {
	const blocks: CommonBlock[] = [];
	if (!patch || baseLineCount === 0 || headLineCount === 0) {
		if (baseLineCount > 0 && headLineCount > 0) {
			blocks.push({ leftStart : 1, leftEnd : baseLineCount, rightStart : 1, rightEnd : headLineCount });
		}
		return blocks;
	}

	const hunks = parseHunks(patch);
	if (!hunks.length) {
		blocks.push({ leftStart : 1, leftEnd : baseLineCount, rightStart : 1, rightEnd : headLineCount });
		return blocks;
	}

	let leftPos  = 1;
	let rightPos = 1;

	for (const hunk of hunks) {
		if (leftPos < hunk.oldStart) {
			const count = hunk.oldStart - leftPos;
			blocks.push({
				leftStart  : leftPos,
				leftEnd    : leftPos + count - 1,
				rightStart : rightPos,
				rightEnd   : rightPos + count - 1,
			});
		}
		leftPos  = hunk.oldStart;
		rightPos = hunk.newStart;

		let contextStart: { left: number; right: number } | null = null;

		for (const line of hunk.lines) {
			if (line.type === 'context') {
				if (!contextStart) {
					contextStart = { left : leftPos, right : rightPos };
				}
				leftPos++;
				rightPos++;
			}
			else {
				if (contextStart) {
					blocks.push({
						leftStart  : contextStart.left,
						leftEnd    : leftPos - 1,
						rightStart : contextStart.right,
						rightEnd   : rightPos - 1,
					});
					contextStart = null;
				}
				if (line.type === 'del') {
					leftPos++;
				}
				else {
					rightPos++;
				}
			}
		}
		if (contextStart) {
			blocks.push({
				leftStart  : contextStart.left,
				leftEnd    : leftPos - 1,
				rightStart : contextStart.right,
				rightEnd   : rightPos - 1,
			});
		}
	}

	if (leftPos <= baseLineCount && rightPos <= headLineCount) {
		blocks.push({ leftStart : leftPos, leftEnd : baseLineCount, rightStart : rightPos, rightEnd : headLineCount });
	}

	return blocks;
}

export function parseChangedLines(patch: string | undefined): { deleted: Set<number>; added: Set<number> } {
	const deleted = new Set<number>();
	const added   = new Set<number>();
	if (!patch) {
		return { deleted, added };
	}

	let oldLine = 0;
	let newLine = 0;

	for (const raw of patch.split('\n')) {
		if (raw.startsWith('@@')) {
			const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
			if (m) {
				oldLine = parseInt(m[1], 10);
				newLine = parseInt(m[2], 10);
			}
		}
		else if (raw.startsWith('-')) {
			deleted.add(oldLine++);
		}
		else if (raw.startsWith('+')) {
			added.add(newLine++);
		}
		else {
			oldLine++;
			newLine++;
		}
	}
	return { deleted, added };
}

/**
 * Builds a GitHub-shaped unified patch from two file contents — the counterpart to the parsers above,
 * for a diff PRism computed itself rather than received. Starts at the first `@@` and omits the
 * `diff --git` header, exactly as the patches from the files API do.
 *
 * Returns null when the two are further apart than `maxEditDistance` edits, since the caller asking for a
 * patch that large has almost certainly paired up two unrelated files.
 */
export function buildUnifiedPatch(oldLines: string[], newLines: string[], maxEditDistance: number): string | null {
	const edits = diffSequences(oldLines, newLines, maxEditDistance);
	if (!edits) {
		return null;
	}

	const changedIndexes = edits.reduce<number[]>((indexes, edit, index) => {
		if (edit.type !== 'keep') {
			indexes.push(index);
		}
		return indexes;
	}, []);
	if (!changedIndexes.length) {
		return '';
	}

	const { oldNumbers, newNumbers } = lineNumbersPerEdit(edits);
	const out: string[]              = [];

	for (const [ first, last ] of groupChangedIndexes(changedIndexes)) {
		const start          = Math.max(0, first - PATCH_CONTEXT_LINES);
		const end            = Math.min(edits.length - 1, last + PATCH_CONTEXT_LINES);
		const body: string[] = [];
		let oldCount         = 0;
		let newCount         = 0;

		for (let i = start; i <= end; i++) {
			const edit = edits[i];
			if (edit.type === 'keep') {
				body.push(` ${oldLines[edit.oldIdx!]}`);
				oldCount++;
				newCount++;
			}
			else if (edit.type === 'del') {
				body.push(`-${oldLines[edit.oldIdx!]}`);
				oldCount++;
			}
			else {
				body.push(`+${newLines[edit.newIdx!]}`);
				newCount++;
			}
		}

		// An empty range is numbered from the line it follows, which is what `@@ -0,0 +1,3 @@` expresses.
		const oldStart = oldCount === 0 ? oldNumbers[start] - 1 : oldNumbers[start];
		const newStart = newCount === 0 ? newNumbers[start] - 1 : newNumbers[start];
		out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
		out.push(...body);
	}

	return out.join('\n');
}

/** The 1-based line number each side sits on as the edit script is walked. */
function lineNumbersPerEdit(edits: SequenceEdit[]): { oldNumbers: number[]; newNumbers: number[] } {
	const oldNumbers: number[] = [];
	const newNumbers: number[] = [];
	let oldLine                = 1;
	let newLine                = 1;

	for (const edit of edits) {
		oldNumbers.push(oldLine);
		newNumbers.push(newLine);
		if (edit.type !== 'add') {
			oldLine++;
		}
		if (edit.type !== 'del') {
			newLine++;
		}
	}

	return { oldNumbers, newNumbers };
}

/** Changes close enough that their context would overlap share one hunk. */
function groupChangedIndexes(changedIndexes: number[]): [number, number][] {
	const groups: [number, number][] = [];
	for (const index of changedIndexes) {
		const open = groups[groups.length - 1];
		if (open && index - open[1] <= PATCH_CONTEXT_LINES * 2 + 1) {
			open[1] = index;
		}
		else {
			groups.push([ index, index ]);
		}
	}
	return groups;
}
