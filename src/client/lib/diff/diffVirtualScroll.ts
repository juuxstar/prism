import type { CommonBlock, ScrollSegment } from '@/lib/diff/prDiffTypes';

export function buildScrollSegments(blocks: CommonBlock[], baseLineCount: number, headLineCount: number, lineHeight: number): ScrollSegment[] {
	const lh                        = lineHeight;
	const segments: ScrollSegment[] = [];

	if (!blocks.length) {
		if (baseLineCount > 0 || headLineCount > 0) {
			const ll = baseLineCount * lh;
			const rl = headLineCount * lh;
			segments.push({ virtualLength : Math.max(ll, rl), leftLength : ll, rightLength : rl });
		}
		return segments;
	}

	let leftPos  = 1;
	let rightPos = 1;

	for (const block of blocks) {
		const leftGap  = block.leftStart - leftPos;
		const rightGap = block.rightStart - rightPos;
		if (leftGap > 0 || rightGap > 0) {
			const ll = leftGap * lh;
			const rl = rightGap * lh;
			segments.push({ virtualLength : Math.max(ll, rl), leftLength : ll, rightLength : rl });
		}

		const commonLines = block.leftEnd - block.leftStart + 1;
		const len         = commonLines * lh;
		segments.push({ virtualLength : len, leftLength : len, rightLength : len });

		leftPos  = block.leftEnd + 1;
		rightPos = block.rightEnd + 1;
	}

	const leftGap  = Math.max(0, baseLineCount - leftPos + 1);
	const rightGap = Math.max(0, headLineCount - rightPos + 1);
	if (leftGap > 0 || rightGap > 0) {
		const ll = leftGap * lh;
		const rl = rightGap * lh;
		segments.push({ virtualLength : Math.max(ll, rl), leftLength : ll, rightLength : rl });
	}

	return segments;
}

export function buildScrollSegmentsFromState(blocks: CommonBlock[], baseContent: string | null, headContent: string | null, lineHeight: number): ScrollSegment[] {
	const baseLineCount = baseContent?.split('\n').length ?? 0;
	const headLineCount = headContent?.split('\n').length ?? 0;
	return buildScrollSegments(blocks, baseLineCount, headLineCount, lineHeight);
}

export function resolveScroll(segments: ScrollSegment[], v: number): { left: number; right: number } {
	let virtualAcc = 0;
	let leftAcc    = 0;
	let rightAcc   = 0;

	for (const seg of segments) {
		if (virtualAcc + seg.virtualLength > v) {
			const progress  = v - virtualAcc;
			leftAcc        += Math.min(progress, seg.leftLength);
			rightAcc       += Math.min(progress, seg.rightLength);
			return { left : leftAcc, right : rightAcc };
		}
		virtualAcc += seg.virtualLength;
		leftAcc    += seg.leftLength;
		rightAcc   += seg.rightLength;
	}

	return { left : leftAcc, right : rightAcc };
}

/**
 * Like `resolveScroll`, but advances both panes proportionally through a segment rather than letting the
 * shorter side run out and wait. Rendered blocks routinely differ in height between the two sides, and
 * tracking proportionally keeps the midpoint of a corresponding pair on both panes' centre line the whole
 * way through it.
 */
export function resolveScrollProportional(segments: ScrollSegment[], v: number): { left: number; right: number } {
	let virtualAcc = 0;
	let leftAcc    = 0;
	let rightAcc   = 0;

	for (const seg of segments) {
		if (virtualAcc + seg.virtualLength > v) {
			const progress = seg.virtualLength <= 0 ? 0 : (v - virtualAcc) / seg.virtualLength;
			return { left : leftAcc + seg.leftLength * progress, right : rightAcc + seg.rightLength * progress };
		}
		virtualAcc += seg.virtualLength;
		leftAcc    += seg.leftLength;
		rightAcc   += seg.rightLength;
	}

	return { left : leftAcc, right : rightAcc };
}

export function maxVirtualScrollTop(segments: ScrollSegment[], viewportHeight: number, lineHeight: number): number {
	const totalVH    = segments.reduce((s, seg) => s + seg.virtualLength, 0);
	const overscroll = Math.max(0, viewportHeight - lineHeight);
	return Math.max(0, totalVH - viewportHeight + overscroll);
}

export function buildConnectorPaths(commonBlocks: CommonBlock[], leftScrollTop: number, rightScrollTop: number, viewportHeight: number, lineHeight: number, width: number): string[] {
	if (!viewportHeight || !commonBlocks.length) {
		return [];
	}
	const ribbons: PixelBlock[] = commonBlocks.map(block => ({
		leftTop     : (block.leftStart - 1) * lineHeight,
		leftBottom  : block.leftEnd * lineHeight,
		rightTop    : (block.rightStart - 1) * lineHeight,
		rightBottom : block.rightEnd * lineHeight,
	}));
	return buildConnectorPathsFromPixels(ribbons, leftScrollTop, rightScrollTop, viewportHeight, width);
}

/**
 * The connector ribbons, for panes whose corresponding regions are already known in pixels rather than as
 * line ranges — which is how the rendered markdown diff measures its blocks.
 */
export function buildConnectorPathsFromPixels(ribbons: PixelBlock[], leftScrollTop: number, rightScrollTop: number, viewportHeight: number, width: number): string[] {
	if (!viewportHeight || !ribbons.length) {
		return [];
	}
	const paths: string[] = [];

	for (const ribbon of ribbons) {
		const lTop = ribbon.leftTop - leftScrollTop;
		const lBot = ribbon.leftBottom - leftScrollTop;
		const rTop = ribbon.rightTop - rightScrollTop;
		const rBot = ribbon.rightBottom - rightScrollTop;

		if (lBot < 0 && rBot < 0) {
			continue;
		}
		if (lTop > viewportHeight && rTop > viewportHeight) {
			continue;
		}

		paths.push(`M 0 ${lTop} L ${width} ${rTop} L ${width} ${rBot} L 0 ${lBot} Z`);
	}
	return paths;
}

/**
 * Scroll segments and connector ribbons for panes built from measured rows instead of uniform lines. A row
 * is one pair of corresponding regions; a row with a zero-height side exists on one side only.
 */
export function buildMeasuredGeometry(rows: MeasuredRow[]): { segments: ScrollSegment[]; ribbons: PixelBlock[] } {
	const segments: ScrollSegment[] = [];
	const ribbons: PixelBlock[]     = [];
	let leftPos                     = 0;
	let rightPos                    = 0;

	for (const row of rows) {
		segments.push({
			virtualLength : Math.max(row.leftHeight, row.rightHeight),
			leftLength    : row.leftHeight,
			rightLength   : row.rightHeight,
		});
		if (row.linked && row.leftHeight > 0 && row.rightHeight > 0) {
			ribbons.push({
				leftTop     : leftPos,
				leftBottom  : leftPos + row.leftHeight,
				rightTop    : rightPos,
				rightBottom : rightPos + row.rightHeight,
			});
		}
		leftPos  += row.leftHeight;
		rightPos += row.rightHeight;
	}

	return { segments, ribbons };
}

export interface PixelBlock {
	leftTop: number;
	leftBottom: number;
	rightTop: number;
	rightBottom: number;
}

export interface MeasuredRow {
	leftHeight: number;
	rightHeight: number;
	/** Whether the two sides correspond, and so earn a connector ribbon between them. */
	linked: boolean;
}
