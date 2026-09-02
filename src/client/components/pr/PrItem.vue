<template>
	<div class="pr-item-wrap u-relative">
		<a
			class="pr-item u-flex u-gap-3-5"
			:href="detailUrl"
			:aria-label="'Open pull request #' + pr.number"
			:data-pr-id="pr.id"
			draggable="true"
			target="_blank"
			rel="noopener"
			@click="onRowClick"
			@auxclick="onRowAuxClick"
			@dragstart="onDragStart"
		>
			<div class="pr-number-col u-flex u-flex-col u-items-center u-flex-shrink-0 u-gap-1 u-pt-0-5">
				<span class="pr-number u-fs-13 u-fw-600 u-text-tertiary u-leading-1-4 u-whitespace-nowrap">#{{ pr.number }}</span>
				<span class="pr-author u-text-secondary u-fw-500 u-fs-11 u-whitespace-nowrap">{{ authorName }}</span>
			</div>
			<div class="pr-content u-flex-1 u-min-w-0">
				<div class="pr-title-row u-flex u-items-start u-gap-2 u-mb-1-5">
					<span class="pr-title u-fs-15 u-fw-600 u-text-primary u-leading-1-4">{{ pr.title }}</span>
					<span v-if="pr.draft" class="badge-draft u-inline-flex u-items-center u-fs-12 u-fw-500 u-flex-shrink-0">Draft</span>
				</div>
				<div v-if="visibleLabels.length" class="pr-labels u-flex u-flex-wrap u-gap-1-5 u-mb-1-5">
					<span v-for="label in visibleLabels" :key="label.id || label.name" class="pr-label" :style="labelStyle(label)">{{ label.name }}</span>
				</div>
				<div class="pr-meta u-flex u-items-center u-gap-2 u-fs-13 u-text-tertiary u-flex-wrap">
					<template v-if="showRepo">
						<span class="pr-repo u-text-secondary u-fw-500">{{ repo }}</span>
						<span class="pr-meta-sep">&middot;</span>
					</template>
					<span>opened {{ timeAgo(pr.created_at) }}</span>
					<span class="pr-meta-sep">&middot;</span>
					<span>updated {{ timeAgo(pr.updated_at) }}</span>
					<template v-if="checkoutState">
						<span class="pr-meta-sep">&middot;</span>
						<span class="checkout-badge u-fs-11 u-fw-600 u-whitespace-nowrap" :title="checkoutBadgeTitle">{{ checkoutBadgeText }}</span>
					</template>
					<template v-if="pr.comments > 0">
						<span class="pr-meta-sep">&middot;</span>
						<span class="pr-comments u-flex u-items-center u-gap-1"> <span v-html="$icon('comment', 12)"></span> {{ pr.comments }} </span>
					</template>
				</div>
				<div v-if="hasAsyncData" class="pr-status-row u-flex u-items-center u-gap-2-5 u-fs-13 u-text-tertiary u-mt-1">
					<span
						v-if="checks"
						class="pr-checks u-inline-flex u-items-center u-gap-0-5"
						:title="checks.passed + ' passed, ' + checks.failed + ' failed' + (checks.pending ? ', ' + checks.pending + ' pending' : '')"
					>
						<span v-for="n in checks.passed" :key="'p' + n" class="check-sq check-sq-passed"></span>
						<span v-for="n in checks.failed" :key="'f' + n" class="check-sq check-sq-failed"></span>
						<span v-for="n in checks.pending" :key="'k' + n" class="check-sq check-sq-pending"></span>
					</span>
					<span
						v-if="botTotal > 0"
						class="pr-bot-comments u-flex u-items-center u-gap-0-5"
						:title="'Cursor bot: ' + botComments!.high + ' high, ' + botComments!.medium + ' medium, ' + botComments!.low + ' low'"
					>
						<span v-for="n in botComments!.high" :key="'bh' + n" v-html="botIcon('high')"></span>
						<span v-for="n in botComments!.medium" :key="'bm' + n" v-html="botIcon('medium')"></span>
						<span v-for="n in botComments!.low" :key="'bl' + n" v-html="botIcon('low')"></span>
					</span>
					<span v-if="hasConflicts" class="conflict-badge u-fs-11 u-fw-600 u-whitespace-nowrap" title="Has conflicts">Conflicts</span>
				</div>
				<div v-else class="pr-status-row u-flex u-items-center u-gap-2-5 u-fs-13 u-text-tertiary u-mt-1">
					<span class="async-loader"></span>
				</div>
			</div>
			<div v-if="stats" class="pr-stats-col u-flex u-flex-col u-items-end u-flex-shrink-0 u-gap-0-5 u-fs-12 u-font-mono u-pt-0-5">
				<div v-if="sizeDots" class="size-dots u-flex u-gap-0-5" :title="'Size: ' + sizeDots + '/5'">
					<span v-for="n in sizeDots" :key="n" class="size-dot" :class="'size-dot-' + sizeDots"></span>
				</div>
				<span class="pr-stat pr-stat-files" title="Files changed">{{ stats.changedFiles }} files</span>
				<span class="pr-stat pr-additions" title="Lines added">+{{ stats.additions }}</span>
				<span class="pr-stat pr-deletions" title="Lines deleted">&minus;{{ stats.deletions }}</span>
			</div>
			<div v-else class="pr-stats-col u-flex u-flex-col u-items-end u-flex-shrink-0 u-gap-0-5 u-fs-12 u-font-mono u-pt-0-5">
				<div v-if="sizeDots" class="size-dots u-flex u-gap-0-5" :title="'Size: ' + sizeDots + '/5'">
					<span v-for="n in sizeDots" :key="n" class="size-dot" :class="'size-dot-' + sizeDots"></span>
				</div>
				<span class="async-loader"></span>
			</div>
		</a>
		<button
			type="button"
			class="pr-pin-btn u-absolute u-flex u-items-center u-justify-center u-cursor-pointer"
			:class="{ pinned : pinned }"
			:title="pinned ? 'Unpin from header' : 'Pin to header'"
			:aria-label="pinned ? 'Unpin pull request #' + pr.number + ' from header' : 'Pin pull request #' + pr.number + ' to header'"
			:aria-pressed="pinned"
			@click="togglePin"
		>
			<span class="u-flex u-items-center" aria-hidden="true" v-html="$icon('pin', 14)"></span>
		</button>
	</div>
</template>

<script lang="ts">
import type { GitWorkspaceStatus, PullRequestCheckoutState } from '@/lib/api/gitCheckoutClient';
import { checkoutStateForPr }       from '@/lib/api/gitCheckoutClient';
import type { BotCounts, ChecksSummary, PRStats }            from '@/lib/api/githubClient';
import GitHubClient, { isPullRequestConflicted }             from '@/lib/api/githubClient';
import { isPwaDisplayMode }         from '@/lib/displayMode';
import { iconSvg }                  from '@/lib/icons';
import { isPinned, togglePinnedPr } from '@/lib/pinnedPrs';
import { timeAgo }                  from '@/lib/utils';

import { Component, Prop, Vue } from 'vue-facing-decorator';

const SIZE_LABELS: Record<string, number> = {
	'size/x-small' : 1,
	'size/small'   : 2,
	'size/medium'  : 3,
	'size/large'   : 4,
	'size/x-large' : 5,
};

/** Individual PR card displaying title, labels, metadata, checks, stats, and size indicator. */
@Component({ emits : [ 'open-pr' ] })
export default class PrItem extends Vue {

	@Prop({ required : true }) readonly pr!: any;
	@Prop({ default : () => new Set<string>() }) readonly hiddenLabels!: Set<string>;
	@Prop({ required : true }) readonly showRepo!: boolean;
	@Prop({ required : true }) readonly asyncVersion!: number;
	@Prop({ default : null }) readonly checkoutStatus!: GitWorkspaceStatus | null;

	readonly timeAgo = timeAgo;

	get authorName(): string {
		return GitHubClient.getFirstName(this.pr.user.login);
	}

	get repo(): string {
		const m = this.pr.repository_url.match(/repos\/([^/]+\/[^/]+)/);
		return m ? m[1] : '';
	}

	get detailParams(): { owner: string; repo: string; number: number } | null {
		const m = this.pr.repository_url.match(/repos\/([^/]+)\/([^/]+)/);
		return !m ? null : { owner : m[1], repo : m[2], number : this.pr.number };
	}

	get detailUrl(): string {
		const params = this.detailParams;
		return !params ? '' : `/pull-request/${params.owner}/${params.repo}/${params.number}`;
	}

	get pinned(): boolean {
		return isPinned(this.pr.id);
	}

	get sizeDots(): number {
		const labels = this.pr.labels;
		if (!labels) {
			return 0;
		}
		for (const label of labels) {
			const dots = SIZE_LABELS[label.name.toLowerCase()];
			if (dots) {
				return dots;
			}
		}
		return 0;
	}

	get hasConflicts(): boolean {
		void this.asyncVersion;
		const mergeability = GitHubClient.getPRMergeability(this.pr.id);
		return isPullRequestConflicted(mergeability);
	}

	get visibleLabels(): any[] {
		const labels = this.pr.labels;
		if (!labels || labels.length === 0) {
			return [];
		}
		return labels
			.filter((l: any) => !(l.name.toLowerCase() in SIZE_LABELS))
			.filter((l: any) => l.name.toLowerCase() !== 'has conflicts')
			.filter((l: any) => !this.hiddenLabels.has(l.name.toLowerCase()))
			.slice(0, 3);
	}

	get botComments(): BotCounts | null {
		void this.asyncVersion;
		return GitHubClient.getBotComments(this.pr.id);
	}

	get botTotal(): number {
		const bc = this.botComments;
		return bc ? bc.low + bc.medium + bc.high : 0;
	}

	get stats(): PRStats | null {
		void this.asyncVersion;
		return GitHubClient.getPRStats(this.pr.id);
	}

	get checks(): ChecksSummary | null {
		void this.asyncVersion;
		return GitHubClient.getChecks(this.pr.id);
	}

	get hasAsyncData(): boolean {
		return this.checks !== null || this.botTotal > 0 || this.hasConflicts;
	}

	get checkoutState(): PullRequestCheckoutState | null {
		void this.asyncVersion;
		return checkoutStateForPr(this.pr, this.checkoutStatus);
	}

	get checkoutBadgeText(): string {
		const state = this.checkoutState;
		if (!state) {
			return '';
		}
		return state.isMain ? 'Checked out' : `Checked out: ${state.label}`;
	}

	get checkoutBadgeTitle(): string {
		const state = this.checkoutState;
		if (!state) {
			return '';
		}
		const freshness = state.shaMatches ? 'At PR head' : 'Branch is checked out but not at the latest PR head';
		return `${freshness} in ${state.path}`;
	}

	labelStyle(label: any): Record<string, string> {
		const c = `#${label.color}`;
		return { background : `${c}22`, color : c, borderColor : `${c}44` };
	}

	botIcon(severity: string): string {
		return iconSvg('botFace', 14, 14, `class="bot-icon bot-icon-${severity} u-flex-shrink-0"`);
	}

	onRowClick(e: MouseEvent) {
		const params = this.detailParams;
		if (!this.detailUrl || !params) {
			e.preventDefault();
			return;
		}
		if (e.button !== 0) {
			return;
		}
		e.preventDefault();
		if (isPwaDisplayMode()) {
			this.$emit('open-pr', params);
			return;
		}
		this.openInBrowserTab();
	}

	onRowAuxClick(e: MouseEvent) {
		const params = this.detailParams;
		if (e.button !== 1 || !this.detailUrl || !params) {
			return;
		}
		e.preventDefault();
		if (isPwaDisplayMode()) {
			this.$emit('open-pr', params);
			return;
		}
		this.openInBrowserTab();
	}

	private openInBrowserTab() {
		const tab = window.open('about:blank', '_blank');
		if (!tab) {
			window.open(this.detailUrl, '_blank');
			return;
		}
		tab.opener        = null;
		tab.location.href = this.detailUrl;
	}

	togglePin() {
		const params = this.detailParams;
		if (!params) {
			return;
		}
		togglePinnedPr({ id : this.pr.id, owner : params.owner, repo : params.repo, number : params.number, title : this.pr.title });
	}

	onDragStart(e: DragEvent) {
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', String(this.pr.id));
	}

}
</script>

<style>
/* The pin control has to sit beside the card link rather than inside it: a button nested in an anchor is not
   valid interactive content, and the link already owns click, middle-click and drag. */
.pr-item-wrap:last-child .pr-item {
	border-bottom: none;
}

/* Hovering the pin must not read as leaving the card, so the lift hangs off the wrapper. */
.pr-item-wrap:hover .pr-item {
	background: var(--bg-tertiary);
	margin: 0 -12px;
	padding: var(--u-4) 38px var(--u-4) var(--u-3);
}

.pr-pin-btn {
	top: 50%;
	right: 0;
	transform: translateY(-50%);
	width: 24px;
	height: 24px;
	padding: 0;
	border: none;
	border-radius: var(--radius-sm);
	background: none;
	color: var(--text-tertiary);
	opacity: 0;
	transition: all var(--transition);
}

.pr-item-wrap:hover .pr-pin-btn,
.pr-pin-btn:focus-visible,
.pr-pin-btn.pinned {
	opacity: 1;
}

.pr-pin-btn:hover {
	background: var(--bg-secondary);
	color: var(--text-primary);
}

.pr-pin-btn.pinned {
	color: var(--accent-blue);
}

.pr-item {
	display: flex;
	/* Right padding reserves the pin's column so the stats never run under it. */
	padding: var(--u-4) 26px var(--u-4) 0;
	border-bottom: 1px solid var(--border);
	transition: background var(--transition);
	cursor: pointer;
	border-radius: var(--radius-sm);
	color: inherit;
	text-decoration: none;

	&[draggable="true"] {
		cursor: grab;
	}

	&.dragging {
		opacity: 0.4;
		cursor: grabbing;
	}
}

.pr-icon-open {
	color: var(--accent-green);
}
.pr-icon-draft {
	color: var(--text-tertiary);
}

.pr-label {
	display: inline-block;
	padding: 2px 10px;
	border-radius: 12px;
	font-size: 12px;
	font-weight: 500;
	border: 1px solid transparent;
	line-height: 1.6;
}

.pr-meta-sep {
	color: var(--border);
}

.pr-reviews {
	display: flex;
	align-items: center;
	gap: 4px;
}

.review-approved {
	color: var(--accent-green);
}
.review-changes {
	color: var(--accent-red);
}
.review-pending {
	color: var(--accent-orange);
}

/* A PR with 20+ checks would otherwise push a horizontal scrollbar onto the whole board. */
.pr-status-row,
.pr-checks {
	flex-wrap: wrap;
	row-gap: var(--u-1);
}

.pr-bot-comments {
	gap: 3px;
	flex-wrap: wrap;
}

.bot-icon-high {
	color: var(--accent-red, #f85149);
}
.bot-icon-medium {
	color: var(--accent-orange, #d29922);
}
.bot-icon-low {
	color: var(--text-tertiary);
}

.check-sq {
	width: 8px;
	height: 8px;
	border-radius: 1px;
}

.check-sq-passed {
	background: var(--accent-green);
}
.check-sq-failed {
	background: var(--accent-red, #f85149);
}

.check-sq-pending {
	background: var(--accent-orange, #d29922);
	animation: pulse-check 1.5s ease-in-out infinite;
}

@keyframes pulse-check {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.35;
	}
}

.pr-stat {
	white-space: nowrap;
}

.pr-stat-files {
	color: var(--text-tertiary);
}

.pr-additions {
	color: var(--accent-green);
	font-size: 12px;
}

.pr-deletions {
	color: var(--accent-red);
	font-size: 12px;
}

.badge-draft {
	padding: var(--u-0-5) var(--u-2);
	background: var(--bg-tertiary);
	color: var(--text-tertiary);
	border-radius: 12px;
}

.size-dot {
	width: 6px;
	height: 6px;
	border-radius: 50%;
}

.size-dot-1 {
	background: var(--size-heatmap-1);
}
.size-dot-2 {
	background: var(--size-heatmap-2);
}
.size-dot-3 {
	background: var(--size-heatmap-3);
}
.size-dot-4 {
	background: var(--size-heatmap-4);
}
.size-dot-5 {
	background: var(--size-heatmap-5);
}

.conflict-badge {
	color: var(--accent-red);
	background: var(--danger-bg-subtle);
	padding: 1px var(--u-1-5);
	border-radius: var(--radius-sm);
}

.checkout-badge {
	color: var(--accent-green);
	background: color-mix(in srgb, var(--accent-green) 12%, transparent);
	padding: 1px var(--u-1-5);
	border-radius: var(--radius-sm);
}
</style>
