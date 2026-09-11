/**
 * Text search over whatever the files view currently has on screen.
 *
 * The diff panes are not ordinary scroll containers — the split views hold the whole file in the DOM and
 * move it with a transform — so the browser's own find cannot scroll a hit into view. Matches are therefore
 * collected from the rendered DOM (which keeps the syntax highlighting intact), painted with the CSS Custom
 * Highlight API so nothing in the tree is mutated, and handed back with enough context for the caller to
 * drive its own scrolling.
 */

/** Line numbers, the minimap and the connector ribbons are chrome, not file content. */
const SKIP_SELECTOR = '.pr-diff-gutter, .diff-minimap, .pr-diff-connector-col, .pr-md-block-lines';

/** The nearest of these around a text node bounds a match, so no match ever spans two lines or two paragraphs. */
const BLOCK_SELECTOR = 'td.pr-diff-code, pre, p, li, h1, h2, h3, h4, h5, h6, blockquote, td, th, div';

/** Panes are ordered by document position, and matches within a pane stay together. */
const PANE_SELECTOR = '.pr-diff-panel, .pr-diff-panel-full, .pr-diff-markdown-source, .pr-diff-markdown-preview-pane, .pr-md-diff-single';

const ROW_SELECTOR = 'tr[data-diff-line]';

const ALL_HIGHLIGHT     = 'prism-file-search';
const CURRENT_HIGHLIGHT = 'prism-file-search-current';

/** Painting every hit in a huge file costs more than it is worth, and nobody steps through 5000 of them. */
export const SEARCH_MATCH_LIMIT = 5000;

export function searchFileView(root: HTMLElement, query: string, options: FileSearchOptions, limit = SEARCH_MATCH_LIMIT): FileSearchResult {
	if (!query) {
		return { invalidPattern : false, matches : [], truncated : false };
	}

	const regex = buildSearchRegex(query, options);
	if (!regex) {
		return { invalidPattern : true, matches : [], truncated : false };
	}

	// Both halves of a split code diff show the same stretch of file, so stepping through one of them and
	// only then the other would read as random jumping; they are interleaved by row instead.
	const interleave             = !!root.querySelector('.pr-diff-panel-left') && !!root.querySelector('.pr-diff-panel-right');
	const paneOrder              = new Map<Element, number>();
	const found: SortableMatch[] = [];
	let truncated                = false;

	for (const block of collectTextBlocks(root)) {
		const pane = block.element.closest(PANE_SELECTOR) ?? root;
		if (!paneOrder.has(pane)) {
			paneOrder.set(pane, paneOrder.size);
		}

		const row  = block.element.closest(ROW_SELECTOR) as HTMLTableRowElement | null;
		const side = panelSide(block.element);

		regex.lastIndex = 0;
		for (let m = regex.exec(block.text); m; m = regex.exec(block.text)) {
			// A pattern that can match nothing (`a*`) would otherwise spin on the same offset forever.
			if (m[0] === '') {
				regex.lastIndex++;
				continue;
			}
			if (found.length >= limit) {
				truncated = true;
				break;
			}
			const range = rangeWithinBlock(block, m.index, m.index + m[0].length);
			if (!range) {
				continue;
			}
			found.push({
				docIndex : found.length,
				element  : row ?? block.element,
				lineNum  : row ? Number(row.dataset.diffLine) : null,
				paneKey  : interleave && side ? 0 : (paneOrder.get(pane) ?? 0) + 1,
				range,
				rowKey   : interleave ? (row?.rowIndex ?? 0) : 0,
				side,
				sideKey  : side === 'RIGHT' ? 1 : 0,
			});
		}
		if (truncated) {
			break;
		}
	}

	found.sort((a, b) => a.paneKey - b.paneKey || a.rowKey - b.rowKey || a.sideKey - b.sideKey || a.docIndex - b.docIndex);

	return { invalidPattern : false, matches : found, truncated };
}

/** Paints every match, with `currentIndex` on top in its own colour. A no-op where the browser lacks the API. */
export function paintSearchMatches(matches: FileSearchMatch[], currentIndex: number): void {
	const registry = highlightRegistry();
	if (!registry) {
		return;
	}

	registry.delete(ALL_HIGHLIGHT);
	registry.delete(CURRENT_HIGHLIGHT);
	if (!matches.length) {
		return;
	}

	const all    = new Highlight(...matches.map(match => match.range));
	all.priority = 0;
	registry.set(ALL_HIGHLIGHT, all);

	const current = matches[currentIndex];
	if (current) {
		const highlight    = new Highlight(current.range);
		highlight.priority = 1;
		registry.set(CURRENT_HIGHLIGHT, highlight);
	}
}

export function clearSearchMatches(): void {
	const registry = highlightRegistry();
	registry?.delete(ALL_HIGHLIGHT);
	registry?.delete(CURRENT_HIGHLIGHT);
}

/** Without the Highlight API the caller still scrolls, but has to mark the current row itself. */
export function supportsSearchPainting(): boolean {
	return highlightRegistry() !== null;
}

/**
 * Brings a match into view sideways. The diff panes scroll horizontally on their own, so a hit past the
 * right edge of a long line would otherwise be scrolled to vertically and still not be visible.
 */
export function scrollMatchIntoViewHorizontally(match: FileSearchMatch): void {
	const container = nearestHorizontalScroller(match.element);
	if (!container) {
		return;
	}

	const rect = match.range.getBoundingClientRect();
	if (!rect.width && !rect.height) {
		return;
	}

	const box = container.getBoundingClientRect();
	const pad = Math.min(80, box.width / 4);
	if (rect.left < box.left + pad) {
		container.scrollLeft -= box.left + pad - rect.left;
	}
	else if (rect.right > box.right - pad) {
		container.scrollLeft += rect.right - (box.right - pad);
	}
}

function buildSearchRegex(query: string, options: FileSearchOptions): RegExp | null {
	let source = options.regex ? query : escapeRegExp(query);
	if (options.wholeWord) {
		// `\b` is useless for patterns starting or ending on punctuation, which is most of what one searches
		// for in code, so the word edges are asserted explicitly instead.
		source = `(?<![A-Za-z0-9_])(?:${source})(?![A-Za-z0-9_])`;
	}
	try {
		return new RegExp(source, options.matchCase ? 'g' : 'gi');
	}
	catch {
		return null;
	}
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectTextBlocks(root: HTMLElement): TextBlock[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const parent = node.parentElement;
			return !node.nodeValue || !parent || parent.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
		},
	});

	const blocks: TextBlock[] = [];
	let current: TextBlock | undefined;

	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text    = node as Text;
		const element = (text.parentElement?.closest(BLOCK_SELECTOR) as HTMLElement | null) ?? root;
		if (!current || current.element !== element) {
			current = { element, nodes : [], text : '' };
			blocks.push(current);
		}
		current.nodes.push({ node : text, start : current.text.length });
		current.text += text.nodeValue;
	}

	return blocks;
}

/** Syntax highlighting splits a line across many spans, so a match commonly starts in one and ends in another. */
function rangeWithinBlock(block: TextBlock, start: number, end: number): Range | null {
	const startNode = nodeAtOffset(block, start, false);
	const endNode   = nodeAtOffset(block, end, true);
	if (!startNode || !endNode) {
		return null;
	}
	const range = document.createRange();
	range.setStart(startNode.node, start - startNode.start);
	range.setEnd(endNode.node, end - endNode.start);
	return range;
}

function nodeAtOffset(block: TextBlock, offset: number, isEnd: boolean): BlockTextNode | null {
	for (const entry of block.nodes) {
		const stop = entry.start + (entry.node.nodeValue?.length ?? 0);
		if (isEnd ? offset <= stop : offset < stop) {
			return entry;
		}
	}
	return block.nodes[block.nodes.length - 1] ?? null;
}

function panelSide(element: HTMLElement): 'LEFT' | 'RIGHT' | null {
	if (element.closest('.pr-diff-panel-left, .pr-md-diff-panel-left')) {
		return 'LEFT';
	}
	return element.closest('.pr-diff-panel-right, .pr-md-diff-panel-right') ? 'RIGHT' : null;
}

function nearestHorizontalScroller(element: HTMLElement): HTMLElement | null {
	for (let el: HTMLElement | null = element; el && el !== document.documentElement; el = el.parentElement) {
		const overflowX = getComputedStyle(el).overflowX;
		if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
			return el;
		}
	}
	return null;
}

/** The registry is not in every browser yet, and the typings do not carry its map members. */
function highlightRegistry(): HighlightRegistryLike | null {
	if (typeof Highlight !== 'function') {
		return null;
	}
	return (globalThis as { CSS?: { highlights?: HighlightRegistryLike } }).CSS?.highlights ?? null;
}

export interface FileSearchOptions {
	matchCase: boolean;
	wholeWord: boolean;
	regex: boolean;
}

export interface FileSearchMatch {
	/** Live range over the rendered text — used both for painting and for measuring where the match sits. */
	range: Range;
	/** Diff panel holding the match, when it is in one; drives which half of a split view gets scrolled. */
	side: 'LEFT' | 'RIGHT' | null;
	/** Line number of the diff row holding the match, for the line-addressed split scroll. */
	lineNum: number | null;
	/** The row, or the enclosing block for rendered content, to bring into view. */
	element: HTMLElement;
}

export interface FileSearchResult {
	matches: FileSearchMatch[];
	/** The query was meant as a regular expression and did not parse. */
	invalidPattern: boolean;
	/** The match limit was reached and the rest of the view was left unsearched. */
	truncated: boolean;
}

interface SortableMatch extends FileSearchMatch {
	paneKey: number;
	rowKey: number;
	sideKey: number;
	docIndex: number;
}

interface TextBlock {
	element: HTMLElement;
	nodes: BlockTextNode[];
	text: string;
}

interface BlockTextNode {
	node: Text;
	/** Offset of this node's text within the block's concatenated text. */
	start: number;
}

interface HighlightRegistryLike {
	set(name: string, highlight: Highlight): void;
	delete(name: string): void;
}
