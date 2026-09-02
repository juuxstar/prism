import { buildConnectorPaths, buildScrollSegmentsFromState, maxVirtualScrollTop, resolveScroll } from '@/lib/diff/diffVirtualScroll';
import type { CommonBlock } from '@/lib/diff/prDiffTypes';

import { computed, type Ref } from 'vue';

export {
	buildConnectorPaths,
	buildConnectorPathsFromPixels,
	buildMeasuredGeometry,
	buildScrollSegments,
	buildScrollSegmentsFromState,
	maxVirtualScrollTop,
	resolveScroll,
	resolveScrollProportional
} from '@/lib/diff/diffVirtualScroll';

/**
 * Composition API helper for synced virtual scroll + connector paths.
 * Class-based views (e.g. PrFilesTab) can import the same helpers from this module.
 */
export function usePrDiffVirtualScroll(
	commonBlocks: Ref<CommonBlock[]>,
	baseContent: Ref<string | null>,
	headContent: Ref<string | null>,
	lineHeight: Ref<number>,
	viewportHeight: Ref<number>,
	leftScrollTop: Ref<number>,
	rightScrollTop: Ref<number>
) {
	const connectorPaths = computed(() => buildConnectorPaths(commonBlocks.value, leftScrollTop.value, rightScrollTop.value, viewportHeight.value, lineHeight.value, 48));

	function segments() {
		return buildScrollSegmentsFromState(commonBlocks.value, baseContent.value, headContent.value, lineHeight.value);
	}

	function applyVirtualScroll(virtualScrollTop: Ref<number>) {
		const { left, right } = resolveScroll(segments(), virtualScrollTop.value);
		leftScrollTop.value   = left;
		rightScrollTop.value  = right;
	}

	function onWheelVertical(virtualScrollTop: Ref<number>, deltaY: number) {
		const segs             = segments();
		const maxScroll        = maxVirtualScrollTop(segs, viewportHeight.value, lineHeight.value);
		virtualScrollTop.value = Math.max(0, Math.min(maxScroll, virtualScrollTop.value + deltaY));
		const { left, right }  = resolveScroll(segs, virtualScrollTop.value);
		leftScrollTop.value    = left;
		rightScrollTop.value   = right;
	}

	function onMinimapScrollTo(virtualScrollTop: Ref<number>, fraction: number) {
		const segs             = segments();
		const maxScroll        = maxVirtualScrollTop(segs, viewportHeight.value, lineHeight.value);
		virtualScrollTop.value = maxScroll * fraction;
		const { left, right }  = resolveScroll(segs, virtualScrollTop.value);
		leftScrollTop.value    = left;
		rightScrollTop.value   = right;
	}

	return { connectorPaths, segments, applyVirtualScroll, onWheelVertical, onMinimapScrollTo };
}
