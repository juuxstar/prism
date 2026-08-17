<template>
	<div class="pr-detail-tabs u-flex u-items-center u-gap-0-5 u-p-0-5">
		<button class="pr-detail-tab" :class="{ active : activeTab === 'overview' }" type="button" @click="emit('switch-tab', 'overview')">
			<span>Overview</span>
		</button>
		<button v-if="showLocalFilesTab" class="pr-detail-tab" :class="{ active : activeTab === 'local-files' }" type="button" @click="emit('switch-tab', 'local-files')">
			<span>Local Files</span>
			<span class="pr-detail-tab-count">{{ localFilesCount }}</span>
		</button>
		<button class="pr-detail-tab" :class="{ active : activeTab === 'pr-files' }" type="button" @click="emit('switch-tab', 'pr-files')">
			<span>PR Files</span>
			<span class="pr-detail-tab-count">{{ changedFilesCount }}</span>
		</button>
	</div>
	<span v-if="showReviewProgress" class="pr-detail-review-progress u-flex u-items-center u-gap-2 u-ml-3 u-whitespace-nowrap" :class="reviewProgressStateClass">
		<span class="pr-detail-review-bar-track">
			<span class="pr-detail-review-bar-fill" :style="reviewBarFillStyle"></span>
		</span>
		<span class="pr-detail-review-pct">{{ reviewPct }}%</span>
	</span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
	activeTab: 'overview' | 'local-files' | 'pr-files';
	showLocalFilesTab: boolean;
	localFilesCount: number;
	changedFilesCount: number;
	reviewTotal: number;
	reviewPct: number;
}>();

const emit = defineEmits<{ 'switch-tab': [tab: 'overview' | 'local-files' | 'pr-files'] }>();

/** Review progress covers the PR files, so it shows on the Overview tab as well but never on the Local Files tab. */
const showReviewProgress = computed(() => Boolean(props.reviewTotal) && (props.activeTab === 'pr-files' || props.activeTab === 'overview'));

const reviewProgressStateClass = computed(() => ({
	complete : props.reviewPct >= 100,
	partial  : props.reviewPct >= 50 && props.reviewPct < 100,
	low      : props.reviewPct < 50,
}));

const reviewBarFillStyle = computed(() => ({ width : `${props.reviewPct}%` }));
</script>
