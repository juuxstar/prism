/**
 * Block-level diff of *rendered* markdown.
 *
 * The line diff cannot describe rendered output: one source line is not one rendered line, and a reflowed
 * paragraph reads as a change even though it renders identically. So the two sides are split into their
 * top-level markdown blocks, rendered, and then diffed on the rendered HTML — which makes "same" mean
 * "looks the same". Blocks that pair up get the existing word-level highlighting applied to their prose.
 */

import { diffSequences }        from '@/lib/diff/myers';
import type { CharRange }       from '@/lib/diff/wordDiff';
import { applyHighlightMarks, computeInlineHighlights } from '@/lib/diff/wordDiff';
import { sanitizeMarkdownHtml } from '@/lib/githubMarkdown';

import type { Links, Token } from 'marked';
import { marked }            from 'marked';

/** Tokens that carry source lines but render to nothing, so they anchor lines without becoming blocks. */
const INVISIBLE_TOKEN_TYPES = new Set([ 'space', 'def' ]);

/**
 * Above this share of changed characters, a candidate pair is two unrelated blocks that merely landed
 * next to each other in the edit script — a deleted paragraph and an added table. Highlighting those
 * against each other produces noise, so they are reported as a separate removal and addition instead.
 */
const MAX_PAIRED_CHANGE_RATIO = 0.7;

/** Elements that drop whitespace at their edges when laid out, unlike inline elements. */
const BLOCK_TAGS = '(?:p|div|h[1-6]|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|th|td|blockquote|hr)';

const NAMED_ENTITY_CHARS: Record<string, string> = {
	'&amp;'  : '&',
	'&lt;'   : '<',
	'&gt;'   : '>',
	'&quot;' : '"',
	'&#39;'  : '\'',
	'&nbsp;' : ' ',
};

/**
 * Splits markdown into its top-level blocks, each carrying its sanitized HTML and the source lines it
 * came from. `marked` guarantees the tokens' `raw` strings rejoin into the exact source, so counting
 * newlines across them places every block back on a source line.
 */
export function buildMarkdownBlocks(source: string): MarkdownBlock[] {
	const tokens                  = marked.lexer(source);
	const blocks: MarkdownBlock[] = [];
	let line                      = 1;

	for (const token of tokens) {
		const raw      = token.raw ?? '';
		const srcStart = line;
		// A token's raw absorbs the blank lines that follow it, which belong to no block — so the range
		// ends on the block's own last line, while the cursor still advances over everything consumed.
		const srcEnd = srcStart + countNewlines(raw.replace(/\n+$/, ''));
		line         = srcStart + countNewlines(raw);

		if (INVISIBLE_TOKEN_TYPES.has(token.type)) {
			continue;
		}
		const html = renderToken(token, tokens.links);
		if (!html.trim()) {
			continue;
		}
		blocks.push({ srcStart, srcEnd, html, text : htmlPlainText(html) });
	}

	return blocks;
}

/**
 * Pairs the two sides' blocks into the rows a rendered diff shows. Either side may be null — an absent
 * left source means every block is an addition, which is how an added file renders.
 */
export function diffMarkdownBlocks(leftSource: string | null, rightSource: string | null): MarkdownBlockPair[] {
	const left  = leftSource == null ? [] : buildMarkdownBlocks(leftSource);
	const right = rightSource == null ? [] : buildMarkdownBlocks(rightSource);
	const edits = diffSequences(left.map(blockKey), right.map(blockKey));

	const pairs: MarkdownBlockPair[] = [];
	let i = 0;

	while (i < edits.length) {
		if (edits[i].type === 'keep') {
			pairs.push({ kind : 'same', left : left[edits[i].oldIdx!], right : right[edits[i].newIdx!] });
			i++;
			continue;
		}

		// One change run, collected regardless of whether the edit script emitted its deletions first.
		const removed: MarkdownBlock[] = [];
		const added: MarkdownBlock[]   = [];
		while (i < edits.length && edits[i].type !== 'keep') {
			const edit = edits[i++];
			if (edit.type === 'del') {
				removed.push(left[edit.oldIdx!]);
			}
			else {
				added.push(right[edit.newIdx!]);
			}
		}

		const candidates = Math.min(removed.length, added.length);
		for (let p = 0; p < candidates; p++) {
			pairs.push(...pairChangedBlocks(removed[p], added[p]));
		}
		for (let p = candidates; p < removed.length; p++) {
			pairs.push({ kind : 'removed', left : removed[p], right : null });
		}
		for (let p = candidates; p < added.length; p++) {
			pairs.push({ kind : 'added', left : null, right : added[p] });
		}
	}

	return pairs;
}

/**
 * Decides whether two blocks from the same change run are an edit of one another, and if so highlights
 * the words that moved. The word diff runs once and its result decides both questions.
 */
function pairChangedBlocks(left: MarkdownBlock, right: MarkdownBlock): MarkdownBlockPair[] {
	const { oldRanges, newRanges } = computeInlineHighlights(left.text, right.text);
	const total                    = left.text.length + right.text.length;
	const changed                  = rangesLength(oldRanges) + rangesLength(newRanges);

	if (total > 0 && changed / total > MAX_PAIRED_CHANGE_RATIO) {
		return [ { kind : 'removed', left, right : null }, { kind : 'added', left : null, right } ];
	}

	return [ {
		kind  : 'changed',
		left  : { ...left, html : applyHighlightMarks(left.html, left.text, oldRanges, 'wd-del') },
		right : { ...right, html : applyHighlightMarks(right.html, right.text, newRanges, 'wd-add') },
	} ];
}

/**
 * What "the same block" means to the diff: the HTML normalized the way a browser lays whitespace out, so
 * rewrapping a paragraph or stripping trailing spaces is not a change to the rendered document. Runs
 * collapse to one space, and whitespace against a block element's edges drops — but whitespace beside an
 * *inline* tag is kept, because `foo <em>bar</em>` and `foo<em>bar</em>` genuinely read differently.
 *
 * A block holding preformatted text is compared verbatim, since there whitespace is what the reader sees.
 */
function blockKey(block: MarkdownBlock): string {
	if (block.html.includes('<pre')) {
		return block.html;
	}
	return block.html
		.replace(/\s+/g, ' ')
		.replace(new RegExp(`(<${BLOCK_TAGS}[^>]*>) `, 'g'), '$1')
		.replace(new RegExp(` (</${BLOCK_TAGS}>)`, 'g'), '$1')
		.trim();
}

/** Renders one already-lexed block, passing the document's link map so reference-style links resolve. */
function renderToken(token: Token, links: Links): string {
	const single = [ token ] as Token[] & { links: Links };
	single.links = links;
	return sanitizeMarkdownHtml(marked.parser(single));
}

/**
 * The visible text of a block's HTML, positioned so that `applyHighlightMarks` can walk the same HTML and
 * land its marks on the right characters. That routine counts one entity as one text position, so each
 * entity here has to become exactly one character too.
 *
 * Note the text of a multi-element block (a list, a table) runs together with no separator, because any
 * separator would be a character the HTML has no text position for. Words either side of an internal
 * element boundary therefore read as one token to the word diff.
 */
function htmlPlainText(html: string): string {
	const out: string[] = [];
	let i               = 0;

	while (i < html.length) {
		if (html[i] === '<') {
			const close = html.indexOf('>', i);
			if (close === -1) {
				break;
			}
			i = close + 1;
			continue;
		}

		if (html[i] === '&') {
			const semi = html.indexOf(';', i);
			if (semi !== -1 && semi - i < 10) {
				out.push(entityChar(html.slice(i, semi + 1)));
				i = semi + 1;
				continue;
			}
		}

		out.push(html[i]);
		i++;
	}

	return out.join('');
}

/** One entity as the single character it occupies; anything wider stands in as a placeholder. */
function entityChar(entity: string): string {
	const named = NAMED_ENTITY_CHARS[entity];
	if (named) {
		return named;
	}

	const numeric = /^&#(x[0-9a-f]+|\d+);$/i.exec(entity);
	if (!numeric) {
		return '�';
	}
	const hex     = numeric[1][0].toLowerCase() === 'x';
	const code    = parseInt(hex ? numeric[1].slice(1) : numeric[1], hex ? 16 : 10);
	const decoded = Number.isFinite(code) && code <= 0x10FFFF ? String.fromCodePoint(code) : '';
	return decoded.length === 1 ? decoded : '�';
}

function rangesLength(ranges: CharRange[]): number {
	return ranges.reduce((sum, range) => sum + (range.end - range.start), 0);
}

function countNewlines(text: string): number {
	let count = 0;
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\n') {
			count++;
		}
	}
	return count;
}

export interface MarkdownBlock {
	/** First source line of the block, 1-based. */
	srcStart: number;
	/** Last source line of the block, 1-based and inclusive. */
	srcEnd: number;
	html: string;
	/** The block's visible text, aligned to `html` for word-level highlighting. */
	text: string;
}

export interface MarkdownBlockPair {
	kind: 'same' | 'changed' | 'added' | 'removed';
	left: MarkdownBlock | null;
	right: MarkdownBlock | null;
}
