<template>
	<pr-modal-dialog
		:open="open"
		title="Merge pull request?"
		title-id="pr-merge-confirm-title"
		:close-disabled="merging"
		@close="$emit('close')"
	>
		<p class="pr-merge-confirm-body">
			This will squash all commits into one and merge
			<span class="pr-merge-confirm-repo">{{ owner }}/{{ repo }}</span>
			<strong>#{{ prNumber }}</strong> into <strong>{{ baseRef }}</strong>.
		</p>
		<p v-if="restoreWorktreeLabel" class="pr-merge-confirm-body">
			The <strong>{{ restoreWorktreeLabel }}</strong> worktree will then be restored to its <strong>{{ restoreWorktreeLabel }}</strong> branch
			at the latest origin/dev, discarding any uncommitted changes there.
		</p>
		<p v-if="unmetRequirements" class="pr-merge-confirm-warning">
			Not all merge requirements appear to be met (for example failing or pending checks, merge conflicts, or branch protection).
			You can still try to merge, or cancel and fix issues on GitHub.
		</p>
		<div class="pr-merge-confirm-actions u-flex u-justify-end u-gap-2-5 u-flex-wrap">
			<button type="button" class="btn btn-secondary" :disabled="merging" @click="$emit('close')">Cancel</button>
			<button type="button" class="btn pr-merge-confirm-submit" :disabled="merging" @click="$emit('confirm')">
				<span v-if="merging" class="async-loader"></span>
				<template v-else>Squash and merge</template>
			</button>
		</div>
	</pr-modal-dialog>
</template>

<script setup lang="ts">
import PrModalDialog from '@/components/pr/PrModalDialog.vue';

defineProps<{
	open: boolean;
	owner: string;
	repo: string;
	prNumber: number;
	baseRef: string;
	unmetRequirements: boolean;
	restoreWorktreeLabel: string;
	merging: boolean;
}>();

defineEmits<{ close: []; confirm: [] }>();
</script>
