<template>
	<div class="pr-file-search u-flex u-items-center u-gap-1-5 u-fs-13" role="search" aria-label="Find in file">
		<span class="pr-file-search-icon u-flex u-items-center u-flex-shrink-0" aria-hidden="true" v-html="$icon('search', 13)"></span>
		<input
			ref="inputEl"
			v-model="query"
			class="pr-file-search-input u-min-w-0 u-fs-13"
			:class="{ 'is-invalid' : invalidPattern }"
			type="text"
			placeholder="Find in file"
			spellcheck="false"
			autocomplete="off"
			aria-label="Search text"
			@keydown.enter.exact.prevent="emit('next')"
			@keydown.enter.shift.prevent="emit('previous')"
		/>
		<div class="pr-file-search-toggles u-flex u-items-center u-flex-shrink-0" role="group" aria-label="Search options">
			<button
				type="button"
				class="pr-file-search-toggle has-tooltip"
				:class="{ active : matchCase }"
				:aria-pressed="matchCase"
				data-tooltip="Match case"
				@click="matchCase = !matchCase"
			>
				Aa
			</button>
			<button
				type="button"
				class="pr-file-search-toggle has-tooltip"
				:class="{ active : wholeWord }"
				:aria-pressed="wholeWord"
				data-tooltip="Match whole word"
				@click="wholeWord = !wholeWord"
			>
				ab
			</button>
			<button
				type="button"
				class="pr-file-search-toggle has-tooltip"
				:class="{ active : regex }"
				:aria-pressed="regex"
				data-tooltip="Use a regular expression"
				@click="regex = !regex"
			>
				.*
			</button>
		</div>
		<span class="pr-file-search-count u-whitespace-nowrap u-flex-shrink-0" aria-live="polite">{{ countLabel }}</span>
		<button
			type="button"
			class="pr-file-search-btn has-tooltip u-flex-shrink-0"
			:disabled="!matchCount && !pending"
			data-tooltip="Previous match &#10;Shortcut: Shift+Enter"
			aria-label="Previous match"
			@click="emit('previous')"
		>
			<span class="u-flex u-items-center" aria-hidden="true" v-html="$icon('chevronUp', 13)"></span>
		</button>
		<button
			type="button"
			class="pr-file-search-btn has-tooltip u-flex-shrink-0"
			:disabled="!matchCount && !pending"
			data-tooltip="Next match &#10;Shortcut: Enter"
			aria-label="Next match"
			@click="emit('next')"
		>
			<span class="u-flex u-items-center" aria-hidden="true" v-html="$icon('chevronDown', 13)"></span>
		</button>
		<button type="button" class="pr-file-search-btn has-tooltip u-flex-shrink-0" data-tooltip="Close &#10;Shortcut: Esc" aria-label="Close search" @click="emit('close')">&times;</button>
	</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';

const props = defineProps<{
	matchCount: number;
	/** 1-based position of the highlighted match, or 0 when there is nothing to show. */
	matchPosition: number;
	invalidPattern: boolean;
	truncated: boolean;
	/** Typing has outrun the search — the counts describe an older query. */
	pending: boolean;
}>();

const query     = defineModel<string>('query', { required : true });
const matchCase = defineModel<boolean>('matchCase', { required : true });
const wholeWord = defineModel<boolean>('wholeWord', { required : true });
const regex     = defineModel<boolean>('regex', { required : true });

const emit    = defineEmits<{ next: []; previous: []; close: [] }>();
const inputEl = ref<HTMLInputElement | null>(null);

/** Re-opening over an existing query should let the reader type straight over it, as a browser's find does. */
function focusQuery() {
	inputEl.value?.focus();
	inputEl.value?.select();
}

const countLabel = computed(() => {
	if (!query.value) {
		return '';
	}
	if (props.pending) {
		return '\u2026';
	}
	if (props.invalidPattern) {
		return 'Bad pattern';
	}
	return props.matchCount ? `${props.matchPosition}/${props.matchCount}${props.truncated ? '+' : ''}` : 'No results';
});

defineExpose({ focusQuery });

onMounted(() => {
	void nextTick(focusQuery);
});
</script>

<style scoped>
.pr-file-search {
	padding: 5px 6px 5px 9px;
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	box-shadow: var(--shadow-lg);
}

.pr-file-search-icon {
	color: var(--text-secondary);
}

.pr-file-search-input {
	width: 190px;
	height: 24px;
	padding: 0 6px;
	color: var(--text-primary);
	background: var(--bg-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}

.pr-file-search-input:focus {
	outline: none;
	border-color: var(--focus-ring);
}

.pr-file-search-input.is-invalid {
	border-color: var(--accent-red);
}

.pr-file-search-toggle {
	width: 24px;
	height: 24px;
	padding: 0;
	color: var(--text-secondary);
	background: transparent;
	border: 1px solid transparent;
	border-radius: var(--radius-sm);
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
	font-size: 11px;
	cursor: pointer;
	transition:
		color var(--transition),
		background var(--transition);
}

.pr-file-search-toggle:hover {
	color: var(--text-primary);
	background: var(--bg-tertiary);
}

.pr-file-search-toggle.active {
	color: var(--accent-blue);
	background: var(--accent-blue-muted);
	border-color: var(--accent-blue-muted);
}

.pr-file-search-count {
	min-width: 62px;
	padding: 0 2px;
	color: var(--text-primary);
	font-size: 12px;
	text-align: right;
}

.pr-file-search-btn {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 24px;
	height: 24px;
	padding: 0;
	color: var(--text-primary);
	background: transparent;
	border: 1px solid transparent;
	border-radius: var(--radius-sm);
	font-size: 16px;
	line-height: 1;
	cursor: pointer;
	transition:
		color var(--transition),
		background var(--transition);
}

.pr-file-search-btn:hover:not(:disabled) {
	background: var(--bg-tertiary);
}

.pr-file-search-btn:disabled {
	opacity: 0.35;
	cursor: default;
}

@media (max-width: 760px) {
	.pr-file-search-input {
		width: 120px;
	}

	.pr-file-search-toggles {
		display: none;
	}
}
</style>
