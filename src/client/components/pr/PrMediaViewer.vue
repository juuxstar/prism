<template>
	<div class="pr-media-viewer" :class="{ 'pr-media-viewer-split' : split }">
		<template v-if="split">
			<div class="pr-media-panel">
				<div v-if="leftLabel" class="pr-media-panel-header">{{ leftLabel }}</div>
				<pr-media-asset v-if="leftSrc" :src="leftSrc" :mime-type="leftMime" />
				<div v-else class="pr-media-missing">Not available</div>
			</div>
			<div class="pr-diff-divider u-flex-shrink-0"></div>
			<div class="pr-media-panel">
				<div v-if="rightLabel" class="pr-media-panel-header">{{ rightLabel }}</div>
				<pr-media-asset v-if="rightSrc" :src="rightSrc" :mime-type="rightMime" />
				<div v-else class="pr-media-missing">Not available</div>
			</div>
		</template>
		<template v-else>
			<div class="pr-media-panel pr-media-panel-full">
				<pr-media-asset v-if="singleSrc" :src="singleSrc" :mime-type="singleMime" />
				<div v-else class="pr-media-missing">Not available</div>
			</div>
		</template>
	</div>
</template>

<script setup lang="ts">
import PrMediaAsset from '@/components/pr/PrMediaAsset.vue';

defineProps<{
	split?: boolean;
	leftSrc?: string | null;
	rightSrc?: string | null;
	leftMime?: string | null;
	rightMime?: string | null;
	singleSrc?: string | null;
	singleMime?: string | null;
	leftLabel?: string;
	rightLabel?: string;
}>();
</script>
