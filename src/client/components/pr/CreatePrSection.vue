<template>
	<div class="create-pr-section u-mb-4 u-flex-none">
		<div class="pr-column-header u-flex u-flex-row u-items-center u-gap-2 u-py-2-5 u-px-4">
			<h2 class="pr-column-title u-m-0 u-fs-12 u-fw-600 u-text-secondary u-uppercase u-tracking-wide">Create PR</h2>
		</div>
		<div class="create-pr-body u-py-2 u-px-3">
			<div class="create-pr-list u-flex u-flex-col u-gap-1-5">
				<div v-for="b in branches" :key="b.name" class="create-pr-row u-flex u-items-center u-gap-2 u-py-1-5">
					<span class="create-pr-branch u-truncate u-flex-1 u-fs-13 u-fw-500" :title="b.name">{{ b.name }}</span>
					<input class="create-pr-title-input u-flex-2" type="text" v-model="titles[b.name]" />
					<button class="create-pr-btn u-flex-shrink-0" :disabled="creating[b.name]" @click="doCreate(b.name)">
						{{ creating[b.name] ? "Creating..." : "Create PR" }}
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

interface BranchEntry {
	name: string;
	message: string;
}

/** Lists recent branches and lets the user create a new PR from each one. */
@Component({ emits : [ 'create-pr' ] })
export default class CreatePrSection extends Vue {

	@Prop({ required : true }) readonly branches!: BranchEntry[];

	titles: Record<string, string>    = {};
	creating: Record<string, boolean> = {};

	@Watch('branches', { immediate : true })
	onBranchesChange(branches: BranchEntry[]) {
		const titles: Record<string, string> = {};
		for (const b of branches) {
			titles[b.name] = this.titles[b.name] || b.message || this.humanizeBranch(b.name);
		}
		this.titles   = titles;
		this.creating = {};
	}

	humanizeBranch(name: string): string {
		return name.replace(/[-_/]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
	}

	doCreate(branch: string) {
		const title = (this.titles[branch] || '').trim();
		if (!title) {
			return;
		}
		this.creating = { ...this.creating, [branch] : true };
		this.$emit('create-pr', { branch, title });
	}

}
</script>

<style>
.create-pr-section {
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
}

.create-pr-row {
	border-bottom: 1px solid var(--border);

	&:last-child {
		border-bottom: none;
	}
}

.create-pr-branch {
	color: var(--accent-blue);
}

.create-pr-title-input {
	padding: var(--u-1) var(--u-2);
	background: var(--bg-primary);
	color: var(--text-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-size: 13px;
	font-family: inherit;
	outline: none;
	transition: border-color var(--transition);

	&:focus {
		border-color: var(--accent-blue);
	}
}

.create-pr-btn {
	padding: var(--u-1) var(--u-2-5);
	background: var(--btn-primary-bg);
	color: var(--btn-primary-fg);
	border: none;
	border-radius: var(--radius-sm);
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	font-family: inherit;
	transition: background var(--transition);

	&:hover {
		background: var(--btn-primary-hover);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
}
</style>
