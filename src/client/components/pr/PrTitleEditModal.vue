<template>
	<pr-modal-dialog
		:open="open"
		title="Edit pull request title"
		title-id="pr-title-edit-title"
		:close-disabled="updating"
		:focus-on-open="false"
		@close="close"
	>
		<input
			ref="inputEl"
			v-model="value"
			type="text"
			class="pr-title-edit-input"
			maxlength="500"
			autocomplete="off"
			@keydown.enter.prevent="save"
		/>
		<p v-if="error" class="pr-merge-confirm-error">{{ error }}</p>
		<div class="pr-merge-confirm-actions u-flex u-justify-end u-gap-2-5 u-flex-wrap">
			<button type="button" class="btn btn-secondary" :disabled="updating" @click="close">Cancel</button>
			<button type="button" class="btn pr-merge-confirm-submit" :disabled="updating" @click="save">
				<span v-if="updating" class="async-loader"></span>
				<template v-else>Save</template>
			</button>
		</div>
	</pr-modal-dialog>
</template>

<script setup lang="ts">
import PrModalDialog from '@/components/pr/PrModalDialog.vue';
import GitHubClient  from '@/lib/api/githubClient';

import { nextTick, ref, watch } from 'vue';

/** Edits the title and saves it to GitHub itself; the view only learns the title that was saved. */
const props = defineProps<{
	open: boolean;
	owner: string;
	repo: string;
	prNumber: number;
	title: string;
}>();

const emit = defineEmits<{ close: []; saved: [title: string] }>();

const inputEl  = ref<HTMLInputElement | null>(null);
const value    = ref('');
const error    = ref('');
const updating = ref(false);

watch(() => props.open, async open => {
	if (!open) {
		return;
	}
	value.value = props.title || '';
	error.value = '';
	await nextTick();
	inputEl.value?.focus();
	inputEl.value?.select();
});

function close() {
	if (!updating.value) {
		emit('close');
	}
}

async function save() {
	if (updating.value) {
		return;
	}
	const next = value.value.trim();
	if (!next) {
		error.value = 'Title cannot be empty.';
		return;
	}
	if (next === props.title) {
		close();
		return;
	}
	error.value    = '';
	updating.value = true;
	try {
		const updated = await GitHubClient.updatePullRequest(props.owner, props.repo, props.prNumber, { title : next });
		emit('saved', updated.title ?? next);
	}
	catch (e: any) {
		error.value = e.message || 'Failed to update title';
	}
	finally {
		updating.value = false;
	}
}
</script>

<style>
.pr-title-edit-input {
	box-sizing: border-box;
	width: 100%;
	margin: 0 0 16px;
	padding: 8px 10px;
	font-size: 14px;
	font-family: inherit;
	color: var(--text-primary);
	background: var(--bg-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
}

.pr-title-edit-input:focus {
	outline: none;
	border-color: var(--accent-blue);
	box-shadow: 0 0 0 2px var(--accent-blue-bg, rgba(88, 166, 255, 0.2));
}
</style>
