<template>
	<div v-if="single" class="pr-md-diff-single u-flex-1 u-min-w-0">
		<div class="pr-md-stack" :class="'pr-md-stack-' + singleKind">
			<div v-for="row in singleRows" :key="row.key" class="pr-md-block" :class="'pr-md-block-' + row.kind">
				<span class="pr-md-block-lines u-fs-11 u-font-mono">{{ row.lines }}</span>
				<div class="markdown-body pr-md-block-body" v-html="row.html"></div>
			</div>
		</div>
	</div>

	<div v-else class="pr-md-diff-split u-flex-1 u-min-h-0" @wheel.prevent="onWheel">
		<div class="pr-diff-panel pr-md-diff-panel pr-md-diff-panel-left u-flex-grow-1 u-min-w-0" ref="leftPanel">
			<div class="pr-md-stack" ref="leftStack" :style="{ transform : `translateY(-${leftScrollTop}px)` }">
				<div v-for="row in leftRows" :key="row.key" class="pr-md-block" :class="'pr-md-block-' + row.kind">
					<span class="pr-md-block-lines u-fs-11 u-font-mono">{{ row.lines }}</span>
					<div class="markdown-body pr-md-block-body" v-html="row.html"></div>
				</div>
			</div>
		</div>

		<div class="pr-diff-connector-col u-flex-shrink-0" ref="connectorCol">
			<svg :width="connectorWidth" :height="viewportHeight">
				<path v-for="(d, i) in connectorPaths" :key="i" :d="d" fill="var(--diff-minimap-faint)" stroke="var(--border)" stroke-width="0.5" />
			</svg>
		</div>

		<div class="pr-diff-panel pr-md-diff-panel pr-md-diff-panel-right u-flex-grow-1 u-min-w-0" ref="rightPanel">
			<div class="pr-md-stack" ref="rightStack" :style="{ transform : `translateY(-${rightScrollTop}px)` }">
				<div v-for="row in rightRows" :key="row.key" class="pr-md-block" :class="'pr-md-block-' + row.kind">
					<span class="pr-md-block-lines u-fs-11 u-font-mono">{{ row.lines }}</span>
					<div class="markdown-body pr-md-block-body" v-html="row.html"></div>
				</div>
			</div>
		</div>

		<diff-minimap
			:left-lines="minimapLeftLines"
			:right-lines="minimapRightLines"
			:viewport-height="viewportHeight"
			:scroll-top="virtualScrollTop"
			:total-content-height="totalVirtualHeight"
			@scroll-to="onMinimapScrollTo"
		/>
	</div>
</template>

<script lang="ts">
import '@/styles/pr-diff.css';

import DiffMinimap                      from '@/components/pr/DiffMinimap.vue';
import type { MeasuredRow, PixelBlock } from '@/lib/diff/diffVirtualScroll';
import {
	buildConnectorPathsFromPixels, buildMeasuredGeometry, maxVirtualScrollTop, resolveScrollProportional
} from '@/lib/diff/diffVirtualScroll';
import type { MarkdownBlock, MarkdownBlockPair } from '@/lib/diff/markdownBlocks';
import { diffMarkdownBlocks }                    from '@/lib/diff/markdownBlocks';
import type { DiffLine, ScrollSegment }          from '@/lib/diff/prDiffTypes';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

const CONNECTOR_WIDTH = 48;

/** Pixels of virtual scroll per minimap slice — coarse enough that a long document stays cheap to draw. */
const MINIMAP_SLICE_HEIGHT = 4;
const MINIMAP_MAX_SLICES   = 2000;

/** Fallback overscroll allowance until a block has been measured. */
const FALLBACK_LINE_HEIGHT = 20;

/**
 * Side-by-side diff of *rendered* markdown.
 *
 * Rendered blocks have no common row height, so the panes cannot be aligned by padding one of them out.
 * Instead each pane is a plain stack of its own blocks and the two are scrolled at different rates: one
 * virtual scroll position resolves to a left and a right offset such that corresponding blocks meet on
 * the centre line. That is the same mechanism the source diff uses, driven by measured block heights
 * rather than a line count.
 */
@Component({ components : { DiffMinimap } })
export default class PrMarkdownDiff extends Vue {

	/** Base-side markdown source; null for an added file. */
	@Prop({ default : null }) readonly leftSource!: string | null;
	/** Head-side markdown source; null for a removed file. */
	@Prop({ default : null }) readonly rightSource!: string | null;

	leftScrollTop               = 0;
	rightScrollTop              = 0;
	virtualScrollTop            = 0;
	viewportHeight              = 0;
	lineHeight                  = FALLBACK_LINE_HEIGHT;
	measuredRows: MeasuredRow[] = [];

	private _resizeObserver: ResizeObserver | null = null;
	private _windowResize                          = () => this.remeasure();

	get connectorWidth(): number {
		return CONNECTOR_WIDTH;
	}

	/** One side missing means there is nothing to diff against, so the file renders in a single pane. */
	get single(): boolean {
		return this.leftSource == null || this.rightSource == null;
	}

	get singleKind(): 'add' | 'del' {
		return this.rightSource == null ? 'del' : 'add';
	}

	get pairs(): MarkdownBlockPair[] {
		return diffMarkdownBlocks(this.leftSource, this.rightSource);
	}

	get singleRows(): MarkdownRow[] {
		const kind = this.singleKind === 'del' ? 'removed' : 'added';
		return this.pairs.flatMap((pair, index) => {
			const block = pair.left ?? pair.right;
			return block ? [ buildRow(block, kind, index) ] : [];
		});
	}

	get leftRows(): MarkdownRow[] {
		return this.pairs.flatMap((pair, index) => (pair.left ? [ buildRow(pair.left, pair.kind, index) ] : []));
	}

	get rightRows(): MarkdownRow[] {
		return this.pairs.flatMap((pair, index) => (pair.right ? [ buildRow(pair.right, pair.kind, index) ] : []));
	}

	get geometry(): { segments: ScrollSegment[]; ribbons: PixelBlock[] } {
		return buildMeasuredGeometry(this.measuredRows);
	}

	get totalVirtualHeight(): number {
		return this.geometry.segments.reduce((sum, seg) => sum + seg.virtualLength, 0);
	}

	get maxScroll(): number {
		return maxVirtualScrollTop(this.geometry.segments, this.viewportHeight, this.lineHeight);
	}

	get connectorPaths(): string[] {
		return buildConnectorPathsFromPixels(this.geometry.ribbons, this.leftScrollTop, this.rightScrollTop, this.viewportHeight, CONNECTOR_WIDTH);
	}

	/**
	 * Minimap columns sliced along the *virtual* axis, so an index means the same scroll position on both
	 * sides — unlike the source diff's line-indexed columns, where the two sides drift apart.
	 */
	get minimapLines(): { left: DiffLine[]; right: DiffLine[] } {
		const left: DiffLine[]  = [];
		const right: DiffLine[] = [];
		const total             = this.totalVirtualHeight;
		if (total <= 0) {
			return { left, right };
		}
		const slice = Math.max(MINIMAP_SLICE_HEIGHT, total / MINIMAP_MAX_SLICES);

		this.pairs.forEach((pair, index) => {
			const row   = this.measuredRows[index];
			const count = Math.max(1, Math.round(Math.max(row?.leftHeight ?? 0, row?.rightHeight ?? 0) / slice));
			for (let i = 0; i < count; i++) {
				left.push(minimapLine(pair.left != null && pair.kind !== 'same' ? 'del' : 'context'));
				right.push(minimapLine(pair.right != null && pair.kind !== 'same' ? 'add' : 'context'));
			}
		});

		return { left, right };
	}

	get minimapLeftLines(): DiffLine[] {
		return this.minimapLines.left;
	}

	get minimapRightLines(): DiffLine[] {
		return this.minimapLines.right;
	}

	mounted() {
		window.addEventListener('resize', this._windowResize);
		// Block heights settle after layout and can change again when an image finishes loading, so the
		// stacks are watched rather than measured once.
		this._resizeObserver = new ResizeObserver(() => this.remeasure());
		for (const ref of [ 'leftStack', 'rightStack', 'connectorCol' ] as const) {
			const el = this.$refs[ref] as HTMLElement | undefined;
			if (el) {
				this._resizeObserver.observe(el);
			}
		}
		this.remeasure();
	}

	beforeUnmount() {
		window.removeEventListener('resize', this._windowResize);
		this._resizeObserver?.disconnect();
		this._resizeObserver = null;
	}

	@Watch('leftSource')
	onLeftSourceChanged() {
		this.resetScroll();
	}

	@Watch('rightSource')
	onRightSourceChanged() {
		this.resetScroll();
	}

	resetScroll() {
		this.virtualScrollTop = 0;
		this.leftScrollTop    = 0;
		this.rightScrollTop   = 0;
		void this.$nextTick(() => this.remeasure());
	}

	remeasure() {
		if (this.single) {
			return;
		}
		const leftHeights  = blockHeights(this.$refs.leftStack as HTMLElement | undefined);
		const rightHeights = blockHeights(this.$refs.rightStack as HTMLElement | undefined);

		const rows: MeasuredRow[] = this.pairs.map(pair => ({
			leftHeight  : 0,
			rightHeight : 0,
			linked      : pair.left != null && pair.right != null,
		}));
		this.leftRows.forEach((row, i) => {
			rows[row.pairIndex].leftHeight = leftHeights[i] ?? 0;
		});
		this.rightRows.forEach((row, i) => {
			rows[row.pairIndex].rightHeight = rightHeights[i] ?? 0;
		});
		this.measuredRows = rows;

		this.viewportHeight = (this.$refs.connectorCol as HTMLElement | undefined)?.clientHeight
			?? (this.$refs.leftPanel as HTMLElement | undefined)?.clientHeight
			?? 0;
		this.lineHeight = measuredLineHeight(this.$refs.rightStack as HTMLElement | undefined) || FALLBACK_LINE_HEIGHT;

		this.applyScroll();
	}

	applyScroll() {
		this.virtualScrollTop = Math.max(0, Math.min(this.maxScroll, this.virtualScrollTop));
		const { left, right } = resolveScrollProportional(this.geometry.segments, this.virtualScrollTop);
		this.leftScrollTop    = left;
		this.rightScrollTop   = right;
	}

	onWheel(e: WheelEvent) {
		if (e.deltaY !== 0) {
			this.virtualScrollTop += e.deltaY;
			this.applyScroll();
		}

		if (e.deltaX !== 0) {
			// Horizontal scroll stays with the pane under the pointer; a wide block only overflows its own side.
			const target  = e.target as HTMLElement;
			const leftEl  = this.$refs.leftPanel as HTMLElement | undefined;
			const rightEl = this.$refs.rightPanel as HTMLElement | undefined;
			const hovered = [ leftEl, rightEl ].find(pane => pane?.contains(target));
			for (const pane of hovered ? [ hovered ] : [ leftEl, rightEl ]) {
				if (pane) {
					pane.scrollLeft += e.deltaX;
				}
			}
		}
	}

	onMinimapScrollTo(fraction: number) {
		this.virtualScrollTop = this.maxScroll * fraction;
		this.applyScroll();
	}

	/**
	 * Scrolls the split so `el` sits on the centre line. Returns false when there is nothing to drive — a
	 * single pane scrolls natively, so the caller can fall back to `scrollIntoView` there.
	 */
	revealElement(el: HTMLElement, rect?: DOMRect): boolean {
		if (this.single) {
			return false;
		}
		const leftStack  = this.$refs.leftStack as HTMLElement | undefined;
		const rightStack = this.$refs.rightStack as HTMLElement | undefined;
		const stack      = [ leftStack, rightStack ].find(candidate => candidate?.contains(el)) ?? null;
		if (!stack || this.maxScroll <= 0) {
			return false;
		}

		// The stack is moved by a transform, so its own rect already carries the current offset: the gap
		// between the two rects is the element's fixed position within the stack's content.
		const box    = rect ?? el.getBoundingClientRect();
		const offset = box.top - stack.getBoundingClientRect().top + box.height / 2 - this.viewportHeight / 2;
		const isLeft = stack === leftStack;

		// The two sides advance at different rates, so the virtual position that puts this side at `offset`
		// is found by bisection over the (monotonic) resolver rather than computed directly.
		let lo = 0;
		let hi = this.maxScroll;
		for (let i = 0; i < 40; i++) {
			const mid             = (lo + hi) / 2;
			const { left, right } = resolveScrollProportional(this.geometry.segments, mid);
			if ((isLeft ? left : right) < offset) {
				lo = mid;
			}
			else {
				hi = mid;
			}
		}

		this.virtualScrollTop = (lo + hi) / 2;
		this.applyScroll();
		return true;
	}

}

function buildRow(block: MarkdownBlock, kind: MarkdownBlockPair['kind'], pairIndex: number): MarkdownRow {
	return {
		key   : `${pairIndex}:${block.srcStart}`,
		kind,
		html  : block.html,
		lines : block.srcStart === block.srcEnd ? String(block.srcStart) : `${block.srcStart}–${block.srcEnd}`,
		pairIndex,
	};
}

function blockHeights(stack: HTMLElement | undefined): number[] {
	return !stack ? [] : Array.from(stack.children).map(child => (child as HTMLElement).getBoundingClientRect().height);
}

function measuredLineHeight(stack: HTMLElement | undefined): number {
	const body = stack?.querySelector('.pr-md-block-body');
	if (!body) {
		return 0;
	}
	const parsed = parseFloat(getComputedStyle(body).lineHeight);
	return Number.isFinite(parsed) ? parsed : 0;
}

function minimapLine(type: DiffLine['type']): DiffLine {
	return { num : null, content : '', type };
}

interface MarkdownRow {
	key: string;
	kind: MarkdownBlockPair['kind'];
	html: string;
	/** Source line or line range this block came from. */
	lines: string;
	/** Index of the pair this block belongs to, so measured heights land on the right row. */
	pairIndex: number;
}
</script>
