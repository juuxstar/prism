<template>
	<section class="screen">
		<div v-if="!isDraftMode" class="pr-columns u-grid u-gap-4 u-py-4 u-px-6 u-m-auto u-w-full u-flex-1 u-min-h-0 u-content-stretch">
			<div class="pr-column pr-column-split">
				<create-pr-section v-if="branches.length > 0" :branches="branches" @create-pr="$emit('create-pr', $event)" />
				<div v-if="orderedOther.length" class="pr-subcolumn">
					<pr-column
						title="Other PRs"
						:prs="orderedOther"
						:hidden-labels="emptySet"
						section="other"
						:show-repo="showRepo"
						:async-version="asyncVersion"
						:checkout-status="checkoutStatus"
						@drop="handleDrop"
						@open-pr="$emit('open-pr', $event)"
					/>
				</div>
				<div class="pr-subcolumn">
					<pr-column
						title="Alpha Review"
						:prs="orderedAlpha"
						:hidden-labels="alphaHidden"
						section="alpha"
						:show-repo="showRepo"
						:async-version="asyncVersion"
						:checkout-status="checkoutStatus"
						@drop="handleDrop"
						@open-pr="$emit('open-pr', $event)"
					/>
				</div>
				<div class="pr-subcolumn">
					<pr-column
						title="Beta Review"
						:prs="orderedBeta"
						:hidden-labels="betaHidden"
						section="beta"
						:show-repo="showRepo"
						:async-version="asyncVersion"
						:checkout-status="checkoutStatus"
						@drop="handleDrop"
						@open-pr="$emit('open-pr', $event)"
					/>
				</div>
			</div>
			<div class="pr-column">
				<pr-column
					title="Your Review"
					:prs="orderedGamma"
					:hidden-labels="gammaHiddenLabels"
					section="gamma"
					:show-repo="showRepo"
					:async-version="asyncVersion"
					:checkout-status="checkoutStatus"
					@drop="handleDrop"
					@open-pr="$emit('open-pr', $event)"
				/>
			</div>
			<div class="pr-column pr-column-split">
				<div class="pr-subcolumn">
					<pr-column
						title="Waiting on Checks"
						:prs="waitingOnChecks"
						:hidden-labels="mergeHidden"
						section="merge"
						:show-repo="showRepo"
						:async-version="asyncVersion"
						:checkout-status="checkoutStatus"
						@drop="handleDrop"
						@open-pr="$emit('open-pr', $event)"
					/>
				</div>
				<div class="pr-subcolumn">
					<pr-column
						title="Ready to Merge"
						:prs="readyMerge"
						:hidden-labels="mergeHidden"
						section="merge"
						:show-repo="showRepo"
						:async-version="asyncVersion"
						:checkout-status="checkoutStatus"
						@drop="handleDrop"
						@open-pr="$emit('open-pr', $event)"
					/>
				</div>
			</div>
		</div>
		<div v-if="isDraftMode" class="drafts-view u-py-4 u-px-6 u-m-auto u-w-full">
			<div class="pr-column drafts-column">
				<pr-column
					title="Drafts"
					:prs="filteredPRs"
					:hidden-labels="emptySet"
					section="drafts"
					:show-repo="showRepo"
					:async-version="asyncVersion"
					:checkout-status="checkoutStatus"
					@drop="handleDrop"
					@open-pr="$emit('open-pr', $event)"
				/>
			</div>
		</div>
		<div v-if="isEmpty" class="empty-state u-flex u-flex-col u-items-center u-justify-center u-text-center u-gap-3-5 u-fs-15 u-text-tertiary u-py-25 u-px-8">
			<span class="u-opacity-30" v-html="$icon('gitBranch', 32)"></span>
			<p class="u-m-0">No pull requests found</p>
		</div>
	</section>
</template>

<script lang="ts">
import type { GitWorkspaceStatus } from '@/lib/api/gitCheckoutClient';
import GitHubClient                from '@/lib/api/githubClient';

import { Component, Prop, Vue } from 'vue-facing-decorator';

const ALPHA_HIDDEN_LABELS = new Set([ 'α: review requested' ]);
const BETA_HIDDEN_LABELS  = new Set([ 'β: review requested' ]);
const MERGE_HIDDEN_LABELS = new Set([ 'ready to merge' ]);

const TEAM_GREEK: Record<string, string> = { alpha : 'α', beta : 'β', gamma : 'γ' };

const SECTION_LABELS: Record<string, { add: string; remove: string[] }> = {
	alpha : { add : 'α: review requested', remove : [ 'β: review requested', 'γ: review requested', 'γ: changes requested', 'ready to merge' ] },
	beta  : { add : 'β: review requested', remove : [ 'α: review requested', 'γ: review requested', 'γ: changes requested', 'ready to merge' ] },
	gamma : { add : 'γ: review requested', remove : [ 'α: review requested', 'β: review requested', 'γ: changes requested', 'ready to merge' ] },
	merge : { add : 'ready to merge', remove : [ 'α: review requested', 'β: review requested', 'γ: review requested', 'γ: changes requested' ] },
};

/** Main board layout that categorizes PRs into columns and handles drag-and-drop reordering. */
@Component({ emits : [ 'create-pr', 'api-error', 'show-error', 'prs-changed', 'open-pr' ] })
export default class PrBoard extends Vue {

	@Prop({ required : true }) readonly allPrs!: any[];
	@Prop({ required : true }) readonly currentTypeFilter!: string;
	@Prop({ required : true }) readonly currentRepo!: string;
	@Prop({ required : true }) readonly selectedTeam!: string;
	@Prop({ required : true }) readonly asyncVersion!: number;
	@Prop({ required : true }) readonly branches!: any[];
	@Prop({ required : true }) readonly user!: any;
	@Prop({ default : null }) readonly checkoutStatus!: GitWorkspaceStatus | null;

	alphaHidden = ALPHA_HIDDEN_LABELS;
	betaHidden = BETA_HIDDEN_LABELS;
	mergeHidden = MERGE_HIDDEN_LABELS;
	emptySet = new Set<string>();

	get teamPrefix(): string {
		return TEAM_GREEK[this.selectedTeam] || 'α';
	}

	get gammaHiddenLabels(): Set<string> {
		return new Set([ `${this.teamPrefix}: review requested` ]);
	}

	get isDraftMode(): boolean {
		return this.currentTypeFilter === 'draft';
	}

	get filteredPRs(): any[] {
		let prs = this.allPrs;
		if (this.currentRepo) {
			prs = prs.filter(pr => {
				const m = pr.repository_url.match(/repos\/([^/]+\/[^/]+)/);
				return m && m[1] === this.currentRepo;
			});
		}
		if (this.currentTypeFilter === 'draft') {
			return prs.filter(pr => pr.draft);
		}
		return prs.filter(pr => !pr.draft);
	}

	get categorized(): { alpha: any[]; beta: any[]; gamma: any[]; readyToMerge: any[]; other: any[] } {
		const alpha: any[]        = [];
		const beta: any[]         = [];
		const gamma: any[]        = [];
		const readyToMerge: any[] = [];
		const other: any[]        = [];
		const currentLogin        = this.user?.login;
		const prefix              = this.teamPrefix;

		for (const pr of this.filteredPRs) {
			const isAuthor            = currentLogin && pr.user?.login === currentLogin;
			const hasChangesRequested = this.hasLabelIncluding(pr, 'changes requested');

			if (isAuthor && hasChangesRequested) {
				gamma.push(pr);
			}
			else if (this.hasLabelStartingWith(pr, 'α:')) {
				alpha.push(pr);
			}
			else if (this.hasLabelStartingWith(pr, 'β:')) {
				beta.push(pr);
			}
			else if (this.hasLabel(pr, 'ready to merge')) {
				readyToMerge.push(pr);
			}
			else {
				const hasTeamReview = pr.labels?.some((l: any) => l.name.startsWith(prefix) && l.name.toLowerCase().includes('review requested'));
				if (hasTeamReview) {
					gamma.push(pr);
				}
				else if (pr.state === 'open') {
					other.push(pr);
				}
			}
		}
		return { alpha, beta, gamma, readyToMerge, other };
	}

	get orderedOther() {
		return this.applySavedOrder('other', this.categorized.other);
	}
	get orderedAlpha() {
		return this.applySavedOrder('alpha', this.categorized.alpha);
	}
	get orderedBeta() {
		return this.applySavedOrder('beta', this.categorized.beta);
	}
	get orderedGamma() {
		return this.applySavedOrder('gamma', this.categorized.gamma);
	}
	get orderedMerge() {
		return this.applySavedOrder('merge', this.categorized.readyToMerge);
	}

	get waitingOnChecks(): any[] {
		void this.asyncVersion;
		return this.orderedMerge.filter(pr => {
			const checks = GitHubClient.getChecks(pr.id);
			return !(checks && checks.failed === 0 && checks.pending === 0);
		});
	}

	get readyMerge(): any[] {
		void this.asyncVersion;
		return this.orderedMerge.filter(pr => {
			const checks = GitHubClient.getChecks(pr.id);
			return checks && checks.failed === 0 && checks.pending === 0;
		});
	}

	get showRepo(): boolean {
		return !this.currentRepo;
	}

	get isEmpty(): boolean {
		return this.filteredPRs.length === 0;
	}

	// ─── helpers ──────────────────────────────────────────

	private hasLabelStartingWith(pr: any, prefix: string): boolean {
		return pr.labels?.some((l: any) => l.name.startsWith(prefix)) ?? false;
	}

	private hasLabel(pr: any, name: string): boolean {
		return pr.labels?.some((l: any) => l.name.toLowerCase() === name.toLowerCase()) ?? false;
	}

	private hasLabelIncluding(pr: any, sub: string): boolean {
		return pr.labels?.some((l: any) => l.name.toLowerCase().includes(sub.toLowerCase())) ?? false;
	}

	private getSectionOrder(section: string): number[] {
		try {
			const stored = localStorage.getItem(`prOrder_${section}`);
			return stored ? JSON.parse(stored) : [];
		}
		catch {
			return [];
		}
	}

	private saveSectionOrder(section: string, prs: any[]) {
		localStorage.setItem(`prOrder_${section}`, JSON.stringify(prs.map((pr: any) => pr.number)));
	}

	private applySavedOrder(section: string, prs: any[]): any[] {
		const order = this.getSectionOrder(section);
		if (order.length === 0) {
			return prs;
		}
		const orderMap = new Map<number, number>(order.map((num, idx) => [ num, idx ]));
		return [ ...prs ].sort((a, b) => {
			const ai = orderMap.has(a.number) ? orderMap.get(a.number)! : Infinity;
			const bi = orderMap.has(b.number) ? orderMap.get(b.number)! : Infinity;
			return ai - bi;
		});
	}

	private findSectionForPR(prId: string): string | null {
		const sections: Record<string, any[]> = { other : this.orderedOther, alpha : this.orderedAlpha, beta : this.orderedBeta, gamma : this.orderedGamma };
		for (const [ name, prs ] of Object.entries(sections)) {
			if (prs.some(p => String(p.id) === prId)) {
				return name;
			}
		}
		if (this.waitingOnChecks.some(p => String(p.id) === prId)) {
			return 'merge';
		}
		if (this.readyMerge.some(p => String(p.id) === prId)) {
			return 'merge';
		}
		return null;
	}

	private getSectionPRs(section: string): any[] {
		const key = section === 'merge' ? 'readyToMerge' : section;
		return this.applySavedOrder(section, (this.categorized as any)[key]);
	}

	async handleDrop({ prId, section, dropIdx }: { prId: string; section: string; dropIdx: number }) {
		const pr = this.allPrs.find(p => String(p.id) === prId);
		if (!pr) {
			return;
		}

		const sourceSection = this.findSectionForPR(prId);
		if (sourceSection === section) {
			const sectionPRs = this.getSectionPRs(section);
			const filtered   = sectionPRs.filter((p: any) => p.id !== pr.id);
			filtered.splice(dropIdx, 0, pr);
			this.saveSectionOrder(section, filtered);
			this.$emit('prs-changed');
			return;
		}

		const repo       = (pr.repository_url.match(/repos\/([^/]+\/[^/]+)/) || [])[1];
		const transition = SECTION_LABELS[section];
		if (!transition || !repo) {
			return;
		}

		try {
			const labelsToRemove = transition.remove.filter(name => pr.labels.some((l: any) => l.name.toLowerCase() === name.toLowerCase()));
			await Promise.all([ GitHubClient.addLabel(repo, pr.number, transition.add), ...labelsToRemove.map(name => GitHubClient.removeLabel(repo, pr.number, name)) ]);
			pr.labels = pr.labels.filter((l: any) => !labelsToRemove.some(name => l.name.toLowerCase() === name.toLowerCase()));
			if (!pr.labels.some((l: any) => l.name.toLowerCase() === transition.add.toLowerCase())) {
				pr.labels.push({ name : transition.add, color : '6e7681' });
			}
			const sectionPRs = this.getSectionPRs(section);
			sectionPRs.splice(dropIdx, 0, pr);
			this.saveSectionOrder(section, sectionPRs);
			this.$emit('prs-changed');
		}
		catch (error) {
			this.$emit('api-error', error);
		}
	}

}
</script>

<style>
.pr-columns {
	grid-template-columns: repeat(3, 1fr);
	grid-template-rows: 1fr;
	max-width: var(--content-max-width);
}

.drafts-view {
	max-width: var(--content-max-width);
}

.drafts-column {
	max-width: 600px;
}

.pr-column {
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	display: flex;
	flex-direction: column;
	min-height: 200px;
}

.pr-column-header {
	border-bottom: 1px solid var(--border);
	position: sticky;
	top: 0;
	background: var(--bg-secondary);
	border-radius: var(--radius-md) var(--radius-md) 0 0;
	z-index: 1;
}

html[data-color-scheme="light"] .pr-column-header {
	background: #eceef2;
}

.pr-column-split {
	display: flex;
	flex-direction: column;
	gap: 0;
	padding: 0;
	background: none;
	border: none;
	min-height: 0;
}

.pr-subcolumn {
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	display: flex;
	flex-direction: column;
	min-height: 0;

	&:first-child {
		flex: 0 0 auto;
	}

	&:last-child {
		flex: 1 1 0;

		.pr-list {
			flex: 1;
			min-height: 0;
			overflow-y: auto;
		}
	}

	& + & {
		margin-top: 16px;
	}

	.pr-column-header {
		border-radius: var(--radius-md) var(--radius-md) 0 0;
	}
}

.filters {
	padding: var(--u-3) var(--u-6);
	border-bottom: 1px solid var(--border);
	background: var(--bg-secondary);
	flex-shrink: 0;
	position: sticky;
	top: 57px;
	z-index: 90;
}

.filters-inner {
	max-width: var(--content-max-width);
}

.filter-btn {
	padding: var(--u-1-5) var(--u-3-5);
	border: none;
	background: transparent;
	color: var(--text-secondary);
	font-size: 14px;
	font-weight: 500;
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: all var(--transition);
	font-family: inherit;

	&:hover,
	&.active {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}
}
</style>
