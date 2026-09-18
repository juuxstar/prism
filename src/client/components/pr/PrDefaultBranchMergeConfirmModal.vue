<template>
	<pr-modal-dialog
		:open="open"
		:title="'Merge origin/' + defaultBranch + '?'"
		title-id="pr-default-branch-merge-confirm-title"
		:close-disabled="merging"
		@close="$emit('close')"
	>
		<p class="pr-merge-confirm-body">
			This will pull the latest <strong>{{ headRef }}</strong> in the local checkout
			<span class="pr-merge-confirm-repo">{{ checkoutLabel }}</span>, then merge the latest
			<strong>origin/{{ defaultBranch }}</strong> into it.
		</p>
		<p class="pr-merge-confirm-body">
			The merge commit stays local until you push it. If the merge conflicts it is rolled back and the
			conflicts have to be resolved in the checkout itself.
		</p>
		<p v-if="error" class="pr-merge-confirm-error">{{ error }}</p>
		<div class="pr-merge-confirm-actions u-flex u-justify-end u-gap-2-5 u-flex-wrap">
			<button type="button" class="btn btn-secondary" :disabled="merging" @click="$emit('close')">Cancel</button>
			<button type="button" class="btn pr-merge-confirm-submit" :disabled="merging" @click="$emit('confirm')">
				<span v-if="merging" class="async-loader"></span>
				<template v-else>Merge origin/{{ defaultBranch }}</template>
			</button>
		</div>
	</pr-modal-dialog>
</template>

<script setup lang="ts">
import PrModalDialog from '@/components/pr/PrModalDialog.vue';

defineProps<{
	open: boolean;
	defaultBranch: string;
	headRef: string;
	checkoutLabel: string;
	error: string;
	merging: boolean;
}>();

defineEmits<{ close: []; confirm: [] }>();
</script>
