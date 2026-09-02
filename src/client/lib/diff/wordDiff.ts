/**
 * Intra-line (word-level) diff highlighting.
 *
 * Computes which tokens within a paired del/add line differ, then injects
 * <mark> elements into existing syntax-highlighted HTML at the correct
 * text-character positions.
 */

import { diffSequences } from '@/lib/diff/myers';

export interface CharRange {
	start: number;
	end: number;
}

/** Split text into word and whitespace tokens, preserving every character. */
export function tokenize(text: string): string[] {
	return text.match(/\s+|[^\s]+/g) || [];
}

/**
 * Diffs two strings token by token and returns the character ranges that changed in each.
 */
export function computeInlineHighlights(oldText: string, newText: string): { oldRanges: CharRange[]; newRanges: CharRange[] } {
	const oldToks = tokenize(oldText);
	const newToks = tokenize(newText);

	const n = oldToks.length;
	const m = newToks.length;

	if (n === 0 && m === 0) {
		return { oldRanges : [], newRanges : [] };
	}
	if (n === 0) {
		return { oldRanges : [], newRanges : [ { start : 0, end : newText.length } ] };
	}
	if (m === 0) {
		return { oldRanges : [ { start : 0, end : oldText.length } ], newRanges : [] };
	}

	const edits = diffSequences(oldToks, newToks);

	const oldOffsets = cumulativeOffsets(oldToks);
	const newOffsets = cumulativeOffsets(newToks);

	const oldRanges = mergeConsecutiveRanges(edits.filter(e => e.type === 'del').map(e => ({
		start : oldOffsets[e.oldIdx!],
		end   : oldOffsets[e.oldIdx!] + oldToks[e.oldIdx!].length,
	})));
	const newRanges = mergeConsecutiveRanges(edits.filter(e => e.type === 'add').map(e => ({
		start : newOffsets[e.newIdx!],
		end   : newOffsets[e.newIdx!] + newToks[e.newIdx!].length,
	})));

	return { oldRanges, newRanges };
}

function cumulativeOffsets(tokens: string[]): number[] {
	const offsets: number[] = [];
	let pos                 = 0;
	for (const t of tokens) {
		offsets.push(pos);
		pos += t.length;
	}
	return offsets;
}

function mergeConsecutiveRanges(ranges: CharRange[]): CharRange[] {
	if (ranges.length === 0) {
		return [];
	}
	const merged: CharRange[] = [ { ...ranges[0] } ];
	for (let i = 1; i < ranges.length; i++) {
		const last = merged[merged.length - 1];
		if (ranges[i].start <= last.end) {
			last.end = Math.max(last.end, ranges[i].end);
		}
		else {
			merged.push({ ...ranges[i] });
		}
	}
	return merged;
}

/**
 * Inject <mark class="..."> tags into syntax-highlighted HTML at the
 * correct text-character positions.
 *
 * Walks through the HTML character by character, tracking a "text cursor"
 * that advances only over visible text (skipping HTML tags and entities).
 * When the text cursor enters a highlight range, we open a <mark>; when
 * it leaves, we close it.
 */
export function applyHighlightMarks(html: string, plainText: string, ranges: CharRange[], cssClass: string): string {
	if (!ranges.length || !html) {
		return html;
	}

	const out: string[] = [];
	let textPos         = 0;
	let rangeIdx        = 0;
	let insideMark      = false;
	let i               = 0;

	while (i < html.length) {
		if (rangeIdx >= ranges.length && !insideMark) {
			out.push(html.slice(i));
			break;
		}

		if (html[i] === '<') {
			if (insideMark) {
				out.push('</mark>');
				insideMark = false;
			}
			const closeIdx = html.indexOf('>', i);
			if (closeIdx === -1) {
				out.push(html.slice(i));
				break;
			}
			const tag = html.slice(i, closeIdx + 1);
			out.push(tag);
			i = closeIdx + 1;

			if (insideMarkNeeded()) {
				out.push(`<mark class="${cssClass}">`);
				insideMark = true;
			}
			continue;
		}

		if (html[i] === '&') {
			const semiIdx = html.indexOf(';', i);
			if (semiIdx !== -1 && semiIdx - i < 10) {
				const entity = html.slice(i, semiIdx + 1);

				handleTextChar(entity);
				i = semiIdx + 1;
				continue;
			}
		}

		handleTextChar(html[i]);
		i++;
	}

	if (insideMark) {
		out.push('</mark>');
	}

	return out.join('');

	function insideMarkNeeded(): boolean {
		if (rangeIdx >= ranges.length) {
			return false;
		}
		const r = ranges[rangeIdx];
		return textPos > r.start && textPos < r.end;
	}

	function handleTextChar(chunk: string) {
		if (rangeIdx < ranges.length) {
			const r = ranges[rangeIdx];

			if (textPos === r.start && !insideMark) {
				out.push(`<mark class="${cssClass}">`);
				insideMark = true;
			}
		}

		out.push(chunk);
		textPos++;

		if (insideMark && rangeIdx < ranges.length) {
			const r = ranges[rangeIdx];
			if (textPos >= r.end) {
				out.push('</mark>');
				insideMark = false;
				rangeIdx++;

				if (rangeIdx < ranges.length && textPos === ranges[rangeIdx].start) {
					out.push(`<mark class="${cssClass}">`);
					insideMark = true;
				}
			}
		}
	}
}

/**
 * Given paired del/add lines (from a hunk change group), compute and
 * apply word-diff highlights to their `html` fields.
 */
export function annotateLinePair(delLine: { content: string; html?: string }, addLine: { content: string; html?: string }): void {
	const { oldRanges, newRanges } = computeInlineHighlights(delLine.content, addLine.content);

	if (oldRanges.length && delLine.html) {
		delLine.html = applyHighlightMarks(delLine.html, delLine.content, oldRanges, 'wd-del');
	}
	if (newRanges.length && addLine.html) {
		addLine.html = applyHighlightMarks(addLine.html, addLine.content, newRanges, 'wd-add');
	}
}
