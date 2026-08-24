<template>
	<div v-if="open" class="pr-merge-confirm-backdrop u-fixed u-inset-0 u-z-modal u-flex u-items-center u-justify-center u-p-6" @click.self="onBackdropClick">
		<div
			ref="dialogEl"
			class="pr-merge-confirm-dialog"
			:class="dialogClass"
			role="dialog"
			aria-modal="true"
			:aria-labelledby="titleId"
			tabindex="-1"
			@keydown.escape="emitClose"
		>
			<div v-if="showClose" class="pr-approve-error-dialog-head u-flex u-items-start u-justify-between u-gap-3 u-mb-1">
				<h2 :id="titleId" class="pr-merge-confirm-title u-m-0">{{ title }}</h2>
				<button
					type="button"
					class="pr-approve-error-close u-inline-flex u-items-center u-justify-center u-flex-shrink-0 u-p-0 u-cursor-pointer u-leading-1"
					aria-label="Dismiss"
					@click="emitClose"
				>
					&times;
				</button>
			</div>
			<h2 v-else :id="titleId" class="pr-merge-confirm-title">{{ title }}</h2>
			<slot />
		</div>
	</div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
	open: boolean;
	title: string;
	titleId: string;
	dialogClass?: string;
	closeOnBackdrop?: boolean;
	closeDisabled?: boolean;
	focusOnOpen?: boolean;
	showClose?: boolean;
}>(), { closeDisabled : false, closeOnBackdrop : true, dialogClass : '', focusOnOpen : true, showClose : false });

const emit     = defineEmits<{ close: [] }>();
const dialogEl = ref<HTMLElement | null>(null);

function emitClose() {
	if (!props.closeDisabled) {
		emit('close');
	}
}

function onBackdropClick() {
	if (props.closeOnBackdrop) {
		emitClose();
	}
}

watch(() => props.open, async open => {
	if (!open || !props.focusOnOpen) {
		return;
	}
	await nextTick();
	dialogEl.value?.focus();
});
</script>

<style>
.pr-merge-confirm-backdrop {
	background: var(--overlay-backdrop);
	backdrop-filter: blur(2px);
}

.pr-merge-confirm-dialog {
	width: 100%;
	max-width: 420px;
	padding: 22px 24px;
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	box-shadow: var(--shadow-lg);
}

.pr-approve-error-dialog {
	max-width: 480px;
}

.pr-approve-error-close {
	width: 32px;
	height: 32px;
	margin: -6px -8px 0 0;
	border: none;
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--text-tertiary);
	font-size: 22px;
	transition:
		color var(--transition),
		background var(--transition);
}

.pr-approve-error-close:hover {
	color: var(--text-primary);
	background: var(--bg-tertiary);
}

.pr-approve-error-message {
	max-height: min(240px, 50vh);
	overflow-y: auto;
	white-space: pre-wrap;
	word-break: break-word;
}

.pr-merge-confirm-title {
	font-size: 18px;
	font-weight: 600;
	margin: 0 0 12px;
	color: var(--text-primary);
}

.pr-merge-confirm-body {
	margin: 0 0 16px;
	font-size: 14px;
	line-height: 1.5;
	color: var(--text-secondary);
}

.pr-merge-confirm-repo {
	color: var(--text-tertiary);
	font-size: 13px;
}

.pr-merge-confirm-error {
	margin: 0 0 16px;
	padding: 10px 12px;
	font-size: 13px;
	line-height: 1.4;
	color: var(--accent-red);
	background: var(--danger-bg-subtle);
	border: 1px solid var(--danger-border);
	border-radius: var(--radius-sm);
}

.pr-merge-confirm-warning {
	margin: 0 0 16px;
	padding: 10px 12px;
	font-size: 13px;
	line-height: 1.45;
	color: var(--text-primary);
	background: var(--accent-orange-bg, rgba(210, 153, 34, 0.12));
	border: 1px solid var(--accent-orange, #d29922);
	border-radius: var(--radius-sm);
}

.pr-merge-confirm-submit {
	background: var(--accent-purple);
	color: var(--btn-primary-fg);
	border-color: transparent;
}

.pr-merge-confirm-submit:hover:not(:disabled) {
	filter: brightness(1.08);
}

.pr-merge-confirm-submit:disabled {
	opacity: 0.65;
	cursor: default;
}

.pr-merge-confirm-danger {
	background: var(--accent-red);
	color: var(--btn-primary-fg);
	border-color: transparent;
}

.pr-merge-confirm-danger:hover:not(:disabled) {
	filter: brightness(1.06);
}

.pr-merge-confirm-danger:disabled {
	opacity: 0.65;
	cursor: default;
}
</style>
