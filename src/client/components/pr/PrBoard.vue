<template>
	<section class="screen">
		<div v-if="!isDraftMode && !isWorktreesMode" class="pr-columns u-grid u-gap-4 u-py-4 u-px-6 u-m-auto u-w-full u-flex-1 u-min-h-0 u-content-stretch">
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
		<div v-if="isWorktreesMode" class="worktrees-view u-py-4 u-px-6 u-m-auto u-w-full">
			<section class="worktrees-panel">
				<div class="worktrees-panel-header u-flex u-items-center u-justify-between u-gap-3">
					<div>
						<h2 class="u-m-0 u-fs-16 u-fw-600 u-text-primary">Worktrees</h2>
						<p class="u-m-0 u-mt-1 u-fs-12 u-text-tertiary">
							Local checkouts in
							<span class="worktree-workspace-path u-font-mono" :title="worktreeWorkspacePath">{{ worktreeWorkspacePath || "the configured worktree directory" }}</span>
						</p>
					</div>
					<span v-if="hasWorktreeParent" class="u-fs-12 u-text-tertiary">{{ worktreeRows.length }}</span>
				</div>
				<div v-if="checkoutStatusLoading" class="worktrees-loading u-flex u-flex-col u-items-center u-justify-center u-gap-3 u-fs-14 u-text-tertiary" aria-busy="true">
					<span class="spinner" aria-hidden="true"></span>
					<span>Loading worktrees…</span>
				</div>
				<div v-else-if="hasWorktreeParent" class="worktree-list">
					<div v-for="row in worktreeRows" :key="row.checkout.path" class="worktree-row">
						<div class="u-min-w-0">
							<div class="u-fs-14 u-fw-600 u-text-primary u-truncate">{{ row.checkout.label }}</div>
							<div v-if="row.displayPath" class="worktree-path u-fs-12 u-font-mono u-text-tertiary u-truncate" :title="row.checkout.hostPath || row.checkout.path">
								{{ row.displayPath }}
							</div>
						</div>
						<div class="worktree-details">
							<div class="worktree-detail">
								<span class="worktree-detail-label worktree-branch-label">Branch:</span>
								<div class="worktree-branch-content u-flex u-items-center u-gap-2 u-flex-wrap">
									<span class="worktree-branch u-fs-12 u-font-mono" :title="row.checkout.branch">{{ row.checkout.branch || "Detached HEAD" }}</span>
									<span
										v-if="hasOriginCounterpart(row.checkout)"
										class="worktree-divergence u-fs-11 u-font-mono"
										:title="branchDivergenceText(row.checkout)"
									>{{ branchDivergenceText(row.checkout) }}</span>
									<span v-else class="worktree-divergence worktree-divergence-unavailable u-fs-11">No origin branch</span>
									<button
										v-if="row.checkout.behindCount"
										class="worktree-pull u-fs-11 u-fw-600"
										:disabled="pullingWorktreePath === row.checkout.path"
										@click="pullWorktree(row.checkout)"
									>
										<span v-if="pullingWorktreePath === row.checkout.path" class="async-loader"></span>
										<template v-else>Pull {{ row.checkout.behindCount }} commit{{ row.checkout.behindCount === 1 ? '' : 's' }}</template>
									</button>
									<button
										v-if="canRestoreWorktree(row.checkout)"
										class="worktree-reset u-fs-11 u-fw-600"
										:disabled="resettingWorktreePath === row.checkout.path"
										:title="`Restore ${row.checkout.label} from origin/dev`"
										@click="resetWorktree(row.checkout)"
									>
										<span v-if="resettingWorktreePath === row.checkout.path" class="async-loader"></span>
										<template v-else>Restore</template>
									</button>
								</div>
							</div>
							<div class="worktree-detail">
								<span class="worktree-detail-label worktree-pr-label">Pull request:</span>
								<div v-if="row.pr" class="worktree-pr-content u-flex u-items-center u-gap-2 u-flex-wrap">
									<button class="worktree-pr u-fs-12 u-fw-600" @click="openWorktreePullRequest(row.pr)">#{{ row.pr.number }} {{ row.pr.title }}</button>
									<span class="worktree-pr-status u-fs-11 u-fw-600" :class="`worktree-pr-status-${worktreePrStatus(row.pr).toLowerCase()}`">{{ worktreePrStatus(row.pr) }}</span>
								</div>
								<span v-else class="worktree-no-pr u-fs-12">No PR</span>
							</div>
						</div>
					</div>
				</div>
				<div v-else class="worktrees-empty u-text-center u-fs-14 u-text-tertiary">
					{{ checkoutStatus?.error || "No worktree directory is configured." }}
				</div>
			</section>
		</div>
		<div v-if="!isWorktreesMode && isEmpty" class="empty-state u-flex u-flex-col u-items-center u-justify-center u-text-center u-gap-3-5 u-fs-15 u-text-tertiary u-py-25 u-px-8">
			<span class="u-opacity-30" v-html="$icon('gitBranch', 32)"></span>
			<p class="u-m-0">No pull requests found</p>
		</div>
	</section>
</template>

<script lang="ts">
import type { GitCheckout, GitWorkspaceStatus } from '@/lib/api/gitCheckoutClient';
import { checkoutMatchesPullRequest, pullWorktreeBranch, resetWorktreeToNaturalBranch } from '@/lib/api/gitCheckoutClient';
import GitHubClient                             from '@/lib/api/githubClient';

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
@Component({ emits : [ 'create-pr', 'api-error', 'show-error', 'prs-changed', 'open-pr', 'checkout-status-changed' ] })
export default class PrBoard extends Vue {

	@Prop({ required : true }) readonly allPrs!: any[];
	@Prop({ required : true }) readonly currentTypeFilter!: string;
	@Prop({ required : true }) readonly currentRepo!: string;
	@Prop({ required : true }) readonly selectedTeam!: string;
	@Prop({ required : true }) readonly asyncVersion!: number;
	@Prop({ required : true }) readonly branches!: any[];
	@Prop({ required : true }) readonly user!: any;
	@Prop({ default : null }) readonly checkoutStatus!: GitWorkspaceStatus | null;
	@Prop({ default : false }) readonly checkoutStatusLoading!: boolean;
	@Prop({ default : () => [] }) readonly worktreePrs!: any[];

	alphaHidden = ALPHA_HIDDEN_LABELS;
	betaHidden = BETA_HIDDEN_LABELS;
	mergeHidden = MERGE_HIDDEN_LABELS;
	emptySet = new Set<string>();
	resettingWorktreePath: string | null = null;
	pullingWorktreePath: string | null = null;

	get teamPrefix(): string {
		return TEAM_GREEK[this.selectedTeam] || 'α';
	}

	get gammaHiddenLabels(): Set<string> {
		return new Set([ `${this.teamPrefix}: review requested` ]);
	}

	get isDraftMode(): boolean {
		return this.currentTypeFilter === 'draft';
	}

	get isWorktreesMode(): boolean {
		return this.currentTypeFilter === 'worktrees';
	}

	get hasWorktreeParent(): boolean {
		return this.checkoutStatus?.mode === 'worktree-parent';
	}

	get worktreeWorkspacePath(): string {
		return this.checkoutStatus?.hostWorkspaceDir || this.checkoutStatus?.workspaceDir || '';
	}

	get worktreeRows(): WorktreeRow[] {
		if (!this.hasWorktreeParent) {
			return [];
		}
		const pullRequests = [ ...this.allPrs, ...this.worktreePrs ];
		return this.checkoutStatus!.checkouts.map(checkout => ({
			checkout,
			displayPath : displayWorktreePath(checkout, this.worktreeWorkspacePath),
			pr          : pullRequests.find(pr => checkoutMatchesPullRequest(checkout, pr)) || null,
		}));
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

	openWorktreePullRequest(pr: any): void {
		const match  = pr?.repository_url?.match(/repos\/([^/]+)\/([^/]+)/);
		const number = Number(pr?.number);
		if (!match || !Number.isInteger(number)) {
			return;
		}
		this.$emit('open-pr', { owner : match[1], repo : match[2], number });
	}

	worktreePrStatus(pr: any): string {
		if (pr?.merged) {
			return 'Merged';
		}
		if (pr?.draft) {
			return 'Draft';
		}
		return pr?.state === 'open' ? 'Open' : 'Closed';
	}

	hasOriginCounterpart(checkout: GitCheckout): boolean {
		return checkout.aheadCount !== undefined && checkout.behindCount !== undefined;
	}

	branchDivergenceText(checkout: GitCheckout): string {
		return `↑ ${checkout.aheadCount} ahead · ↓ ${checkout.behindCount} behind`;
	}

	canRestoreWorktree(checkout: GitCheckout): boolean {
		return checkout.branch !== checkout.label;
	}

	async resetWorktree(checkout: GitCheckout): Promise<void> {
		if (!window.confirm(`Restore ${checkout.label} to its ${checkout.label} branch at the latest origin/dev? This permanently discards all uncommitted changes, including unstaged files.`)) {
			return;
		}

		this.resettingWorktreePath = checkout.path;
		try {
			this.$emit('checkout-status-changed', await resetWorktreeToNaturalBranch(checkout.path));
		}
		catch (error) {
			this.$emit('api-error', error);
		}
		finally {
			this.resettingWorktreePath = null;
		}
	}

	async pullWorktree(checkout: GitCheckout): Promise<void> {
		this.pullingWorktreePath = checkout.path;
		try {
			this.$emit('checkout-status-changed', await pullWorktreeBranch(checkout.path));
		}
		catch (error) {
			this.$emit('api-error', error);
		}
		finally {
			this.pullingWorktreePath = null;
		}
	}

}

function relativeWorktreePath(path: string, workspaceDir: string): string {
	const prefix = `${workspaceDir.replace(/\/+$/, '')}/`;
	return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function displayWorktreePath(checkout: GitCheckout, workspaceDir: string): string {
	const path = relativeWorktreePath(checkout.hostPath || checkout.path, workspaceDir);
	return path === checkout.label ? '' : path;
}

interface WorktreeRow {
	checkout: GitCheckout;
	displayPath: string;
	pr: any | null;
}
</script>

<style>
.pr-columns {
	grid-template-columns: repeat(3, 1fr);
	grid-template-rows: 1fr;
	max-width: var(--content-max-width);
	overflow-y: auto;
	overscroll-behavior: contain;
}

.drafts-view,
.worktrees-view {
	flex: 1;
	min-height: 0;
	max-width: var(--content-max-width);
	overflow-y: auto;
	overscroll-behavior: contain;
}

.drafts-column {
	max-width: 600px;
}

.worktrees-view {
	max-width: 1160px;
	font-size: 15px;
}

.worktrees-view .u-fs-12 {
	font-size: 13px;
}

.worktrees-view .u-fs-14 {
	font-size: 15px;
}

.worktrees-view .u-fs-16 {
	font-size: 17px;
}

.worktrees-panel {
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	overflow: hidden;
}

.worktrees-panel-header,
.worktree-row {
	padding: var(--u-4) var(--u-5);
}

.worktrees-panel-header {
	border-bottom: 1px solid var(--border);
}

.worktree-row + .worktree-row {
	border-top: 1px solid var(--border);
}

.worktree-row {
	display: grid;
	grid-template-columns: minmax(260px, 1fr) minmax(460px, 640px);
	align-items: center;
	gap: var(--u-4);
}

.worktree-workspace-path {
	color: var(--accent-purple);
}

.worktree-path {
	margin-top: var(--u-1);
	max-width: 620px;
}

.worktree-details {
	display: flex;
	flex-direction: column;
	gap: var(--u-1-5);
	min-width: 0;
	width: 100%;
}

.worktree-detail {
	display: grid;
	grid-template-columns: 104px minmax(0, 1fr);
	align-items: center;
	text-align: left;
	gap: var(--u-2);
}

.worktree-detail-label {
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.06em;
	text-transform: uppercase;
}

.worktree-branch-label {
	color: var(--accent-green);
}

.worktree-pr-label {
	color: var(--accent-blue);
}

.worktree-branch {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	text-align: left;
	padding: 3px var(--u-2);
	border-radius: var(--radius-sm);
	background: var(--chip-green-bg);
	color: var(--accent-green);
}

.worktree-divergence {
	color: var(--text-secondary);
}

.worktree-divergence-unavailable {
	color: var(--text-tertiary);
}

.worktree-pull {
	padding: 3px var(--u-2);
	border: 1px solid var(--accent-green);
	border-radius: var(--radius-sm);
	background: var(--accent-green-faint-bg);
	color: var(--accent-green);
	cursor: pointer;
	font-family: inherit;
}

.worktree-pull:hover:not(:disabled) {
	background: var(--accent-green-selected-bg);
}

.worktree-pull:disabled {
	cursor: wait;
	opacity: 0.7;
}

.worktree-pull .async-loader {
	width: 32px;
	height: 6px;
}

.worktree-pr {
	width: fit-content;
	max-width: 100%;
	text-align: left;
	white-space: normal;
	border: 1px solid var(--accent-blue);
	border-radius: var(--radius-sm);
	background: var(--chip-blue-bg);
	color: var(--accent-blue);
	cursor: pointer;
	font-family: inherit;
	padding: 3px var(--u-2);
}

.worktree-pr-status,
.worktree-reset {
	padding: 3px var(--u-2);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	white-space: nowrap;
}

.worktree-pr-status-open {
	border-color: var(--accent-blue);
	background: var(--chip-blue-bg);
	color: var(--accent-blue);
}

.worktree-pr-status-draft {
	border-color: var(--accent-orange);
	background: var(--chip-orange-bg);
	color: var(--accent-orange);
}

.worktree-pr-status-merged {
	border-color: var(--accent-purple);
	background: var(--chip-purple-bg);
	color: var(--accent-purple);
}

.worktree-pr-status-closed {
	background: var(--muted-bg);
	color: var(--text-tertiary);
}

.worktree-reset {
	background: var(--btn-secondary-bg);
	color: var(--text-secondary);
	cursor: pointer;
	font-family: inherit;
}

.worktree-reset:hover:not(:disabled) {
	border-color: var(--accent-green);
	color: var(--accent-green);
}

.worktree-reset:disabled {
	cursor: wait;
	opacity: 0.7;
}

.worktree-reset .async-loader {
	width: 32px;
	height: 6px;
}

.worktree-pr:hover {
	text-decoration: underline;
}

.worktree-no-pr {
	width: fit-content;
	padding: 3px var(--u-2);
	border-radius: var(--radius-sm);
	background: var(--muted-bg);
	color: var(--text-tertiary);
	text-align: left;
}

.worktrees-empty {
	padding: var(--u-8) var(--u-5);
}

.worktrees-loading {
	min-height: 220px;
	padding: var(--u-8) var(--u-5);
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
	align-self: start;
	height: max-content;
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
