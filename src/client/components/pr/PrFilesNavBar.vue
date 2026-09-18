<template>
	<nav class="pr-files-nav-bar u-flex u-items-center u-gap-2 u-fs-13 u-flex-shrink-0 u-sticky u-top-0 u-z-5">
		<button
			v-if="showViewedControls"
			class="pr-files-nav-btn pr-files-nav-btn-skip has-tooltip u-flex-shrink-0"
			:disabled="prevUnviewedIndex === -1"
			@click="currentIndex = prevUnviewedIndex"
			data-tooltip="Skip to previous unviewed file &#10;Shortcut: ←"
		>
			&laquo;
		</button>
		<button class="pr-files-nav-btn has-tooltip u-flex-shrink-0" :disabled="currentIndex <= 0" @click="currentIndex--" data-tooltip="Go to previous file">&lt;</button>
		<button
			v-if="showViewedControls"
			class="pr-files-nav-viewed-btn has-tooltip u-flex-shrink-0"
			:class="{ checked : isCurrentFileViewed }"
			@click="emit('toggleViewed')"
			data-tooltip="Mark file as viewed/unviewed &#10;Shortcut: Space"
		>
			✓
		</button>
		<div class="pr-files-dropdown u-relative u-flex-1 u-min-w-0" :class="{ 'file-viewed' : isCurrentFileViewed }">
			<button
				ref="dropdownTriggerRef"
				class="pr-files-dropdown-trigger has-tooltip u-flex u-items-center u-gap-1-5 u-w-full u-text-left u-fs-13 u-font-mono u-cursor-pointer"
				data-tooltip="Click to browse all changed files"
				@click="onDropdownTriggerClick"
			>
				<span class="file-status-icon u-flex-shrink-0" :class="'file-status-' + currentFile.status">{{ fileStatusSymbol(currentFile.status) }}</span>
				<span class="pr-files-dropdown-filename u-truncate u-flex-1 u-text-center">{{ currentFile.filename }}</span>
			</button>
			<ul v-if="dropdownOpen" class="pr-files-dropdown-list" :style="dropdownListMaxHeightPx != null ? { maxHeight : `${dropdownListMaxHeightPx}px` } : undefined">
				<li v-if="pairingSource" class="pr-files-pairing-hint u-flex u-items-center u-gap-2 u-fs-12">
					<span class="u-flex-1 u-min-w-0 u-truncate">Pick the file <strong>{{ pairingSource.filename }}</strong> pairs with</span>
					<button type="button" class="pr-files-pairing-cancel u-flex-shrink-0 u-fs-11 u-fw-600 u-cursor-pointer" @click.stop="pairingSource = null">Cancel</button>
				</li>
				<li
					v-for="{ file, index, pairButton, dimmed } in dropdownRows"
					:key="file.filename"
					class="pr-files-dropdown-item u-flex u-items-center u-gap-2 u-fs-13 u-font-mono u-text-primary u-cursor-pointer"
					:class="{ active : index === currentIndex, 'pairing-dimmed' : dimmed }"
					@click="onDropdownItemClick(file, index)"
				>
					<span v-if="showViewedControls" class="pr-files-dropdown-viewed u-flex-shrink-0" :class="{ checked : viewedFiles[file.filename] === 'VIEWED' }">✓</span>
					<span class="file-status-icon u-flex-shrink-0" :class="'file-status-' + file.status">{{ fileStatusSymbol(file.status) }}</span>
					<span class="pr-files-dropdown-item-name u-truncate u-flex-1 u-min-w-0">{{ file.previous_filename ? file.previous_filename + " → " : "" }}{{ file.filename }}</span>
					<button
						v-if="pairButton"
						type="button"
						class="pr-files-pair-btn u-flex-shrink-0 u-cursor-pointer"
						:class="{ armed : pairingSource?.filename === file.filename }"
						:title="pairButton.title"
						@click.stop="onPairButtonClick(file)"
					>{{ pairButton.symbol }}</button>
					<span class="pr-files-dropdown-item-stats u-flex u-gap-1-5 u-flex-shrink-0 u-ml-2">
						<span class="pr-files-dropdown-item-add">+{{ file.additions }}</span>
						<span class="pr-files-dropdown-item-del">&minus;{{ file.deletions }}</span>
					</span>
				</li>
			</ul>
		</div>
		<button
			v-if="showViewedControls"
			class="pr-files-nav-viewed-btn has-tooltip u-flex-shrink-0"
			:class="{ checked : isCurrentFileViewed }"
			@click="emit('toggleViewed')"
			data-tooltip="Mark file as viewed/unviewed &#10;Shortcut: Space"
		>
			✓
		</button>
		<button class="pr-files-nav-btn has-tooltip u-flex-shrink-0" :disabled="currentIndex >= files.length - 1" @click="currentIndex++" data-tooltip="Go to next file">&gt;</button>
		<button
			v-if="showViewedControls"
			class="pr-files-nav-btn pr-files-nav-btn-skip has-tooltip u-flex-shrink-0"
			:disabled="nextUnviewedIndex === -1"
			@click="currentIndex = nextUnviewedIndex"
			data-tooltip="Skip to next unviewed file &#10;Shortcut: →"
		>
			&raquo;
		</button>
		<div v-if="showRenderToggle" class="pr-files-render-toggle u-flex u-flex-shrink-0" role="group" aria-label="Markdown diff view">
			<button
				type="button"
				class="pr-files-render-btn has-tooltip"
				:class="{ active : !renderMarkdown }"
				:aria-pressed="!renderMarkdown"
				data-tooltip="Diff the markdown source"
				@click="renderMarkdown = false"
			>
				Source
			</button>
			<button
				type="button"
				class="pr-files-render-btn has-tooltip"
				:class="{ active : renderMarkdown }"
				:aria-pressed="renderMarkdown"
				data-tooltip="Diff the rendered markdown"
				@click="renderMarkdown = true"
			>
				Rendered
			</button>
		</div>
		<span class="pr-files-nav-counter u-text-tertiary u-whitespace-nowrap u-flex-shrink-0">{{ currentIndex + 1 }}/{{ files.length }}</span>
		<span class="pr-files-nav-stats u-flex u-gap-1-5 u-font-mono u-whitespace-nowrap u-flex-shrink-0">
			<span class="pr-files-nav-add">+{{ currentFile.additions }}</span>
			<span class="pr-files-nav-del">&minus;{{ currentFile.deletions }}</span>
		</span>
	</nav>
</template>

<script setup lang="ts">
import '@/styles/pr-diff.css';

import type { PRFile } from '@/lib/api/githubClient';

import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
	files: PRFile[];
	viewedFiles: Record<string, string>;
	showViewedControls?: boolean;
	/** Whether the current file can be shown rendered — markdown whose full contents loaded. */
	showRenderToggle?: boolean;
}>();

const currentIndex   = defineModel<number>('currentIndex', { required : true });
const renderMarkdown = defineModel<boolean>('renderMarkdown', { default : false });

const emit = defineEmits<{
	toggleViewed: [];
	pairFiles: [ { removed: string; added: string } ];
	unpairFiles: [ { removed: string; added: string } ];
}>();

/**
 * The file waiting for a partner, while the reader is choosing one. Only a deletion or an addition can
 * start this, and only the opposite kind can finish it, so the pair always has one of each.
 */
const pairingSource = ref<PRFile | null>(null);

const dropdownOpen       = ref(false);
const dropdownTriggerRef = ref<HTMLButtonElement | null>(null);
/** Measured space from list top to bottom of viewport (px); null while closed / before measure */
const dropdownListMaxHeightPx = ref<number | null>(null);

const DROPDOWN_LIST_BOTTOM_MARGIN = 8;
const DROPDOWN_LIST_MIN_HEIGHT    = 120;

function updateDropdownListMaxHeight() {
	if (!dropdownOpen.value) {
		return;
	}
	const btn = dropdownTriggerRef.value;
	if (!btn) {
		return;
	}
	const rect                    = btn.getBoundingClientRect();
	const vv                      = window.visualViewport;
	const visibleBottom           = vv ? vv.offsetTop + vv.height : window.innerHeight;
	const available               = visibleBottom - rect.bottom - DROPDOWN_LIST_BOTTOM_MARGIN;
	dropdownListMaxHeightPx.value = Math.max(DROPDOWN_LIST_MIN_HEIGHT, available);
}

function onDropdownTriggerClick() {
	dropdownOpen.value = !dropdownOpen.value;
	if (dropdownOpen.value) {
		void nextTick(() => updateDropdownListMaxHeight());
	}
}

watch(dropdownOpen, open => {
	if (!open) {
		dropdownListMaxHeightPx.value = null;
		pairingSource.value           = null;
	}
});

function canPairWith(file: PRFile): boolean {
	const source = pairingSource.value;
	if (!source || file.filename === source.filename) {
		return false;
	}
	return source.status === 'removed' ? file.status === 'added' : file.status === 'removed';
}

/** The pair button this row gets, if any: one to start a pairing, or one to undo a forced pair. */
function pairButtonFor(file: PRFile): { symbol: string; title: string } | null {
	if (file.forcedRename) {
		return { symbol : '⇄', title : `Stop comparing ${file.previous_filename} with ${file.filename}` };
	}
	if (file.status !== 'added' && file.status !== 'removed') {
		return null;
	}
	if (pairingSource.value) {
		if (file.filename === pairingSource.value.filename) {
			return { symbol : '⇄', title : 'Cancel this pairing' };
		}
		return canPairWith(file) ? { symbol : '⇄', title : `Compare with ${pairingSource.value.filename}` } : null;
	}
	return { symbol : '⇄', title : 'Compare this file with another added or deleted file' };
}

function onPairButtonClick(file: PRFile) {
	if (pairingSource.value?.filename === file.filename) {
		pairingSource.value = null;
		return;
	}
	if (file.forcedRename && file.previous_filename) {
		emit('unpairFiles', { removed : file.previous_filename, added : file.filename });
		pairingSource.value = null;
		dropdownOpen.value  = false;
		return;
	}
	const source = pairingSource.value;
	if (!source) {
		pairingSource.value = file;
		return;
	}
	if (canPairWith(file)) {
		const removed = source.status === 'removed' ? source : file;
		const added   = source.status === 'removed' ? file : source;
		emit('pairFiles', { removed : removed.filename, added : added.filename });
		pairingSource.value = null;
		dropdownOpen.value  = false;
	}
}

/** While a partner is being chosen, clicking a row picks it rather than navigating to it. */
function onDropdownItemClick(file: PRFile, index: number) {
	if (pairingSource.value) {
		onPairButtonClick(file);
		return;
	}
	currentIndex.value = index;
	dropdownOpen.value = false;
}

/** One row per file, with its pairing affordances worked out once rather than per binding. */
const dropdownRows = computed(() => props.files.map((file, index) => ({
	file,
	index,
	pairButton : pairButtonFor(file),
	dimmed     : Boolean(pairingSource.value) && !canPairWith(file),
})));

const currentFile = computed(() => props.files[currentIndex.value] ?? props.files[0]);

const isCurrentFileViewed = computed(() => props.viewedFiles[currentFile.value?.filename] === 'VIEWED');

const showViewedControls = computed(() => props.showViewedControls !== false);

function fileStatusSymbol(status: string): string {
	const map: Record<string, string> = { added : '+', removed : '−', modified : '●', renamed : '→', copied : '⊕' };
	return map[status] || status[0]?.toUpperCase() || '?';
}

function findUnviewedFile(direction: 1 | -1): number {
	if (!showViewedControls.value) {
		const next = currentIndex.value + direction;
		return next >= 0 && next < props.files.length ? next : -1;
	}
	const len  = props.files.length;
	const idx0 = currentIndex.value;
	for (let offset = 1; offset < len; offset++) {
		const idx = (idx0 + direction * offset + len) % len;
		if (props.viewedFiles[props.files[idx].filename] !== 'VIEWED') {
			return idx;
		}
	}
	const next = idx0 + direction;
	return next >= 0 && next < len ? next : -1;
}

const prevUnviewedIndex = computed(() => findUnviewedFile(-1));
const nextUnviewedIndex = computed(() => findUnviewedFile(1));

/** Don't steal ←/→ when the user is editing text (e.g. PR comment box). */
function activeElementIsTextEditing(): boolean {
	const el = document.activeElement;
	if (!el || !(el instanceof HTMLElement)) {
		return false;
	}
	const tag = el.tagName.toLowerCase();
	if (tag === 'textarea' || tag === 'select') {
		return true;
	}
	if (tag === 'input') {
		const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
		return type === 'checkbox' || type === 'radio' || type === 'range' || type === 'file' ? false : true;
	}
	return el.isContentEditable;
}

const _keyHandler = (e: KeyboardEvent) => {
	if (e.key === 'Escape') {
		if (dropdownOpen.value) {
			e.preventDefault();
			e.stopPropagation();
			dropdownOpen.value = false;
		}
		return;
	}
	if (dropdownOpen.value) {
		return;
	}
	if (activeElementIsTextEditing()) {
		return;
	}
	if (e.key === 'ArrowLeft') {
		e.preventDefault();
		const idx = findUnviewedFile(-1);
		if (idx !== -1) {
			currentIndex.value = idx;
		}
	}
	else if (e.key === 'ArrowRight') {
		e.preventDefault();
		const idx = findUnviewedFile(1);
		if (idx !== -1) {
			currentIndex.value = idx;
		}
	}
	else if (showViewedControls.value && e.key === ' ') {
		const tag = (document.activeElement?.tagName || '').toLowerCase();
		if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') {
			return;
		}
		e.preventDefault();
		emit('toggleViewed');
	}
};

const _clickOutsideHandler = (e: MouseEvent) => {
	if (!dropdownOpen.value) {
		return;
	}
	const target = e.target as HTMLElement | null;
	if (target && !target.closest('.pr-files-dropdown')) {
		dropdownOpen.value = false;
	}
};

const _resizeHandler = () => updateDropdownListMaxHeight();

onMounted(() => {
	window.addEventListener('keydown', _keyHandler);
	document.addEventListener('mousedown', _clickOutsideHandler);
	window.addEventListener('resize', _resizeHandler);
	window.visualViewport?.addEventListener('resize', _resizeHandler);
	window.visualViewport?.addEventListener('scroll', _resizeHandler);
});

onBeforeUnmount(() => {
	window.removeEventListener('keydown', _keyHandler);
	document.removeEventListener('mousedown', _clickOutsideHandler);
	window.removeEventListener('resize', _resizeHandler);
	window.visualViewport?.removeEventListener('resize', _resizeHandler);
	window.visualViewport?.removeEventListener('scroll', _resizeHandler);
});
</script>

<style scoped>
.pr-files-nav-bar {
	height: 40px;
	padding: 0 var(--u-2);
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
}

.pr-files-render-toggle {
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	overflow: hidden;
}

.pr-files-render-btn {
	height: 30px;
	padding: 0 10px;
	border: none;
	background: var(--bg-primary);
	color: var(--text-secondary);
	cursor: pointer;
	font-family: inherit;
	font-size: 12px;
	white-space: nowrap;
}

.pr-files-render-btn + .pr-files-render-btn {
	border-left: 1px solid var(--border);
}

.pr-files-render-btn:hover:not(.active) {
	background: var(--bg-tertiary);
}

.pr-files-render-btn.active {
	background: var(--accent-blue);
	color: #fff;
}

.pr-files-nav-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-primary);
	cursor: pointer;
	font-size: 15px;
	font-family: inherit;
	padding: 0;
}

.pr-files-nav-btn:hover:not(:disabled) {
	background: var(--bg-tertiary);
}

.pr-files-nav-btn:disabled {
	opacity: 0.3;
	cursor: default;
}

.pr-files-nav-btn-skip {
	font-size: 17px;
	font-weight: 700;
}

.pr-files-nav-viewed-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 28px;
	height: 28px;
	border-radius: var(--radius-sm);
	border: 2px solid var(--border);
	background: transparent;
	font-size: 18px;
	font-weight: 700;
	color: var(--text-tertiary);
	cursor: pointer;
	transition: all 0.15s ease;
}

.pr-files-nav-viewed-btn:hover {
	border-color: var(--accent-green);
	color: var(--accent-green);
	background: var(--accent-green-faint-bg);
}

.pr-files-nav-viewed-btn.checked {
	border-color: var(--accent-green);
	color: var(--accent-green);
	background: var(--accent-green-selected-bg);
}

.pr-files-dropdown.file-viewed {
	border: 2px solid var(--accent-green);
	border-radius: var(--radius-sm);
	background: var(--accent-green-selected-bg);
	box-sizing: border-box;
}

.pr-files-dropdown.file-viewed .pr-files-dropdown-trigger {
	border-color: transparent;
	background: var(--bg-primary);
}

.pr-files-dropdown-trigger {
	height: 26px;
	padding: 0 var(--u-2);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-primary);
}

.pr-files-dropdown-list {
	position: absolute;
	top: 100%;
	left: 0;
	right: 0;
	/* Fallback before first layout measure; inline maxHeight overrides when open */
	max-height: calc(100dvh - 120px);
	overflow-y: auto;
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	margin-top: 2px;
	padding: 4px 0;
	z-index: 50;
	list-style: none;
}

.pr-files-dropdown-item {
	padding: var(--u-1-5) var(--u-2-5);
}

.pr-files-dropdown-item:hover {
	background: var(--bg-tertiary);
}

.pr-files-dropdown-item.active {
	background: var(--bg-tertiary);
	font-weight: 600;
}

.pr-files-dropdown-viewed {
	font-size: 16px;
	width: 20px;
	text-align: center;
	color: transparent;
}

.pr-files-dropdown-viewed.checked {
	color: var(--accent-green);
}

.pr-files-dropdown-item.pairing-dimmed {
	opacity: 0.4;
}

.pr-files-pairing-hint {
	padding: var(--u-1-5) var(--u-2-5);
	margin-bottom: 4px;
	border-bottom: 1px solid var(--border);
	color: var(--text-secondary);
}

.pr-files-pairing-cancel {
	padding: 2px 8px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);

	&:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}
}

.pr-files-pair-btn {
	width: 22px;
	padding: 0;
	border: 1px solid transparent;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--text-tertiary);
	font-size: 13px;
	line-height: 20px;

	&:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	&.armed {
		border-color: var(--accent-blue);
		color: var(--accent-blue);
	}
}

.pr-files-dropdown-item-stats {
	font-variant-numeric: tabular-nums;
}

.pr-files-dropdown-item-add {
	color: var(--accent-green);
}

.pr-files-dropdown-item-del {
	color: var(--accent-red);
}

.file-status-icon {
	font-size: 14px;
	font-weight: 700;
	width: 20px;
	text-align: center;
}

.pr-files-nav-add {
	color: var(--accent-green);
}

.pr-files-nav-del {
	color: var(--accent-red);
}

.has-tooltip {
	position: relative;
}

.has-tooltip::after {
	content: attr(data-tooltip);
	position: absolute;
	top: calc(100% + 6px);
	left: 50%;
	transform: translateX(-50%);
	padding: 6px 10px;
	background: var(--bg-tertiary);
	color: var(--text-primary);
	font-size: 12px;
	font-family: inherit;
	font-weight: 400;
	line-height: 1.4;
	white-space: pre;
	border-radius: 6px;
	border: 1px solid var(--border);
	box-shadow: var(--shadow-lg);
	pointer-events: none;
	opacity: 0;
	transition: opacity 0.15s ease;
	z-index: 100;
}

.has-tooltip:hover::after {
	opacity: 1;
}

.has-tooltip:disabled::after {
	display: none;
}
</style>
