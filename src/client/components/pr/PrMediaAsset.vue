<template>
	<embed v-if="isPdf" class="pr-media-pdf" :src="src" type="application/pdf" />
	<img v-else class="pr-media-image" :src="src" :alt="alt" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
	src: string;
	mimeType?: string | null;
	alt?: string;
}>();

const isPdf = computed(() => props.mimeType === 'application/pdf' || props.src.startsWith('data:application/pdf'));
</script>
