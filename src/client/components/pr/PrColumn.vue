<template>
	<div class="u-flex u-flex-col u-flex-1 u-min-h-0">
		<div class="pr-column-header u-flex u-flex-row u-items-center u-gap-2 u-py-2-5 u-px-4">
			<h2 class="pr-column-title u-m-0 u-fs-12 u-fw-600 u-text-secondary u-uppercase u-tracking-wide">{{ title }}</h2>
			<span class="pr-count u-fs-11 u-fw-600">{{ prs.length }}</span>
		</div>
		<div ref="list" class="pr-list u-w-full" :class="{ 'drop-over' : dropOver }" @dragstart="onDragStart" @dragend="onDragEnd" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
			<pr-item
				v-for="pr in prs"
				:key="pr.id"
				:pr="pr"
				:hidden-labels="hiddenLabels"
				:show-repo="showRepo"
				:checkout-status="checkoutStatus"
				@open-pr="$emit('open-pr', $event)"
			/>
		</div>
	</div>
</template>

<script lang="ts">
import type { GitWorkspaceStatus } from '@/lib/api/gitCheckoutClient';

import { Component, Prop, Vue } from 'vue-facing-decorator';

/** Single column of PR items with a header, count badge, and drag-and-drop support. */
@Component({ emits : [ 'drop', 'open-pr' ] })
export default class PrColumn extends Vue {

	@Prop({ required : true }) readonly title!: string;
	@Prop({ required : true }) readonly prs!: any[];
	@Prop({ default : () => new Set<string>() }) readonly hiddenLabels!: Set<string>;
	@Prop({ required : true }) readonly section!: string;
	@Prop({ required : true }) readonly showRepo!: boolean;
	@Prop({ default : null }) readonly checkoutStatus!: GitWorkspaceStatus | null;

	dropOver = false;

	get listEl(): HTMLElement {
		return this.$refs.list as HTMLElement;
	}

	onDragStart(e: DragEvent) {
		const item = (e.target as HTMLElement).closest('.pr-item');
		if (item) {
			item.classList.add('dragging');
		}
		document.querySelectorAll('.pr-list').forEach(el => el.classList.add('drop-target'));
	}

	onDragEnd(e: DragEvent) {
		const item = (e.target as HTMLElement).closest('.pr-item');
		if (item) {
			item.classList.remove('dragging');
		}
		document.querySelectorAll('.pr-list').forEach(el => {
			el.classList.remove('drop-target', 'drop-over');
		});
		document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
	}

	onDragOver(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
		this.dropOver              = true;
		this.updateDropIndicator(e.clientY);
	}

	onDragLeave(e: DragEvent) {
		if (!this.listEl.contains(e.relatedTarget as Node)) {
			this.dropOver = false;
			this.removeIndicator();
		}
	}

	onDrop(e: DragEvent) {
		e.preventDefault();
		this.dropOver = false;
		this.removeIndicator();
		document.querySelectorAll('.pr-list').forEach(el => {
			el.classList.remove('drop-target', 'drop-over');
		});
		const prId    = e.dataTransfer!.getData('text/plain');
		const dropIdx = this.getDropIndex(e.clientY);
		this.$emit('drop', { prId, section : this.section, dropIdx });
	}

	getDropIndex(y: number): number {
		const items = [ ...this.listEl.querySelectorAll('.pr-item:not(.dragging)') ];
		for (let i = 0; i < items.length; i++) {
			const rect = items[i].getBoundingClientRect();
			if (y < rect.top + rect.height / 2) {
				return i;
			}
		}
		return items.length;
	}

	updateDropIndicator(y: number) {
		this.removeIndicator();
		const list          = this.listEl;
		const items         = [ ...list.querySelectorAll('.pr-item:not(.dragging)') ];
		const indicator     = document.createElement('div');
		indicator.className = 'drop-indicator';
		const idx           = this.getDropIndex(y);
		if (idx < items.length) {
			items[idx].before(indicator);
		}
		else {
			list.appendChild(indicator);
		}
	}

	removeIndicator() {
		if (this.listEl) {
			this.listEl.querySelectorAll('.drop-indicator').forEach(el => el.remove());
		}
	}

}
</script>

<style>
.pr-list {
	padding: 0 12px;
	min-height: 60px;

	&.drop-target {
		min-height: 60px;
	}

	&.drop-over {
		background: var(--drop-target-bg);
		border-radius: var(--radius-sm);
		outline: 2px dashed var(--accent-blue);
		outline-offset: -2px;
	}

	&.drop-loading {
		opacity: 0.6;
		pointer-events: none;
	}
}

.drop-indicator {
	height: 2px;
	background: var(--accent-blue);
	border-radius: 1px;
	margin: 2px 0;
}

.pr-count {
	background: var(--bg-tertiary);
	color: var(--text-tertiary);
	padding: 1px var(--u-1-5);
	border-radius: 10px;
}
</style>
