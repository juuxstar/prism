<template>
	<div class="pr-detail-page u-flex u-flex-col u-overflow-hidden u-h-screen u-p-0 u-m-auto">
		<pr-detail-load-state v-if="loading || error" :loading="loading" :error="error" @retry="loadAll" />

		<template v-else-if="pr">
			<div class="pr-detail-main u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden">
				<header class="pr-detail-header u-flex u-items-center u-justify-between u-py-2-5 u-px-4 u-flex-shrink-0 u-sticky u-top-0 u-z-100 u-gap-4">
					<div class="pr-detail-header-left u-flex u-items-center u-gap-2-5 u-min-w-0 u-flex-1">
						<button v-if="embedded" type="button" class="pr-detail-back u-flex-shrink-0" title="Back to dashboard" aria-label="Back to dashboard" @click="$emit('close')">
							&larr;
						</button>
						<a v-else href="/" class="pr-detail-back u-flex-shrink-0" title="Back to dashboard">&larr;</a>
						<span
							class="pr-detail-badge u-flex-shrink-0"
							:class="prStatusBadgeClass"
							>{{ prStatusBadgeText }}</span>
						<div class="pr-detail-header-title-block u-flex u-items-center u-min-w-0 u-flex-grow-1 u-gap-2">
							<div class="pr-detail-title-edit-group u-flex u-items-center u-min-w-0 u-gap-1">
								<h1 class="pr-detail-title u-min-w-0 u-fs-15 u-fw-600 u-text-primary u-truncate u-m-0">
									{{ pr.title }}
								</h1>
								<button
									type="button"
									class="pr-detail-header-icon-btn u-inline-flex u-items-center u-justify-center u-flex-shrink-0 u-p-0 u-cursor-pointer"
									title="Edit title"
									aria-label="Edit title"
									@click="openTitleEdit"
								>
									<span class="u-flex u-items-center u-justify-center" aria-hidden="true" v-html="$icon('pencil', 14)"></span>
								</button>
							</div>
							<span
								v-if="checkoutBadgeText"
								class="pr-detail-checkout-badge u-flex-shrink-0 u-fs-11 u-fw-600 u-whitespace-nowrap"
								:class="checkoutBadgeClass"
								:title="checkoutBadgeTitle"
								>{{ checkoutBadgeText }}</span>
						</div>
					</div>
					<div class="pr-detail-header-center u-flex u-items-center u-justify-center u-flex-1">
						<pr-detail-tab-bar
							:active-tab="activeTab"
							:show-local-files-tab="hasLocalCheckout"
							:local-files-count="localFiles.length"
							:changed-files-count="pr.changed_files"
							:review-total="reviewTotal"
							:reviewed-count="reviewedCount"
							@switch-tab="switchTab"
						/>
						<button
							v-if="showMarkWhitespaceViewedButton"
							type="button"
							class="pr-whitespace-viewed-btn has-tooltip u-inline-flex u-items-center u-gap-1 u-ml-2 u-cursor-pointer u-whitespace-nowrap u-relative"
							:data-tooltip="whitespaceViewedBtnTooltip"
							:disabled="markingWhitespaceViewed"
							@click="openWhitespaceViewedConfirm"
						>
							Whitespace&rarr;viewed ({{ whitespaceOnlyUnviewedCount }})
						</button>
					</div>
					<div class="pr-detail-header-right u-flex u-items-center u-gap-3 u-flex-1 u-justify-end">
						<button
							type="button"
							class="pr-detail-pin-btn u-inline-flex u-items-center u-justify-center u-cursor-pointer"
							:class="{ pinned : prPinned }"
							:title="prPinned ? 'Unpin this pull request from the header' : 'Pin this pull request to the header'"
							:aria-label="prPinned ? 'Unpin pull request #' + routeBackedPrNumber + ' from the header' : 'Pin pull request #' + routeBackedPrNumber + ' to the header'"
							:aria-pressed="prPinned"
							@click="toggleCurrentPrPin"
						>
							<span class="u-flex u-items-center u-justify-center" aria-hidden="true" v-html="$icon('pin', 14)"></span>
						</button>
						<pinned-pr-bar align="right" @open-pr="openPinnedPr" />
						<a
							v-if="cursorCheckoutHref && activeTab !== 'overview'"
							:href="cursorCheckoutHref"
							class="pr-detail-open-cursor-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-whitespace-nowrap"
							:title="'Open ' + cursorTargetPath + ' in Cursor'"
						>
							<span class="u-flex u-items-center u-justify-center" aria-hidden="true" v-html="$icon('externalLink', 14)"></span>
							<span>Open in Cursor</span>
						</a>
						<button
							type="button"
							class="pr-detail-header-refresh-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-cursor-pointer u-whitespace-nowrap"
							:class="{ spinning : refreshing }"
							:disabled="refreshing"
							:title="refreshing ? 'Refreshing pull request data' : 'Refresh pull request data'"
							:aria-label="refreshing ? 'Refreshing pull request data' : 'Refresh pull request data'"
							@click="refreshDetail"
						>
							<span class="u-flex u-items-center u-justify-center" aria-hidden="true" v-html="$icon('refresh', 14)"></span>
							<span>{{ refreshing ? 'Refreshing' : 'Refresh' }}</span>
						</button>
						<template v-if="pendingComments.length">
							<button
								class="pr-review-discard-btn u-inline-flex u-items-center u-justify-center u-cursor-pointer"
								@click="discardAllPending"
								title="Discard all pending comments"
							>
								&times;
							</button>
							<button
								class="pr-review-submit-btn u-inline-flex u-items-center u-gap-1-5 u-cursor-pointer u-whitespace-nowrap"
								:disabled="submittingReview"
								@click="submitReview"
							>
								<span v-if="submittingReview" class="async-loader"></span>
								Submit Review ({{ pendingComments.length }})
							</button>
						</template>
						<settings-popup v-if="currentUser" :user="currentUser" @logout="handleLogout" />
					</div>
				</header>

				<div class="pr-detail-tab-shell u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden">
					<!-- Kept mounted behind the Files tabs, so a merge or checks poll it is running survives a tab switch. -->
					<pr-overview-tab
						v-show="activeTab === 'overview'"
						ref="overviewTab"
						:key="prRouteKey"
						:owner="owner"
						:repo="repo"
						:pr-number="routeBackedPrNumber"
						:checkout-status="checkoutStatus"
						@open-review-in-files="onOpenReviewInFiles"
						@worktree-changed="onWorktreeChanged"
						@pr-changed="loadAll"
						@merged="refreshMergedPullRequest"
					/>
					<pr-files-tab
						v-if="activeTab === 'local-files'"
						:files="localFiles"
						:files-loading="localFilesLoading"
						:owner="owner"
						:repo="repo"
						:base-ref="pr.head.sha"
						:head-ref="pr.head.sha"
						:initial-file-index="localFileIndex"
						:pr-number="routeBackedPrNumber"
						:viewed-files="localViewedFiles"
						:review-enabled="false"
						:viewed-enabled="true"
						:empty-message="localFilesEmptyMessage"
						:file-content-loader="loadLocalFileContent"
						@update:file-index="onLocalFileIndexChange"
						@update:viewed="onLocalViewedChange"
						@all-viewed="onAllFilesViewed"
					/>
					<pr-files-tab
						v-else-if="activeTab === 'pr-files'"
						:files="files"
						:files-loading="filesLoading"
						:owner="owner"
						:repo="repo"
						:base-ref="prFilesBaseRef"
						:head-ref="pr.head.sha"
						:initial-file-index="initialFileIndex"
						:thread-focus-request="pendingThreadFocus"
						:pr-number="routeBackedPrNumber"
						:viewed-files="viewedFiles"
						:pr-node-id="prNodeId"
						:pending-comments="pendingComments"
						@update:file-index="onFileIndexChange"
						@update:viewed="onViewedChange"
						@add-pending="onAddPending"
						@remove-pending="onRemovePending"
						@edit-pending="onEditPending"
						@thread-focus-handled="onThreadFocusHandled"
						@all-viewed="onAllFilesViewed"
						:pair-error="filePairError"
						@pair-files="forceFilePair"
						@unpair-files="unforceFilePair"
						@dismiss-pair-error="filePairError = ''"
					/>
				</div>
			</div>

			<Teleport to="body">
				<pr-whitespace-viewed-modal
					:open="whitespaceViewedConfirmOpen"
					:count="whitespaceOnlyUnviewedCount"
					:error="whitespaceViewedConfirmError"
					:marking="markingWhitespaceViewed"
					@close="closeWhitespaceViewedConfirm"
					@confirm="confirmMarkWhitespaceViewedFiles"
				/>
				<pr-title-edit-modal
					:open="titleEditOpen"
					:owner="owner"
					:repo="repo"
					:pr-number="routeBackedPrNumber"
					:title="pr.title"
					@close="titleEditOpen = false"
					@saved="onTitleSaved"
				/>
			</Teleport>
		</template>
	</div>
</template>

<script lang="ts">
import PinnedPrBar                    from '@/components/pr/PinnedPrBar.vue';
import PrDetailLoadState              from '@/components/pr/PrDetailLoadState.vue';
import PrDetailTabBar                 from '@/components/pr/PrDetailTabBar.vue';
import PrTitleEditModal               from '@/components/pr/PrTitleEditModal.vue';
import PrWhitespaceViewedModal        from '@/components/pr/PrWhitespaceViewedModal.vue';
import SettingsPopup                  from '@/components/pr/SettingsPopup.vue';
import type PrOverviewTab             from '@/components/screens/PrOverviewTab.vue';
import { clearToken, getStoredToken } from '@/lib/api/auth';
import type { GitWorkspaceStatus, PullRequestCheckoutState } from '@/lib/api/gitCheckoutClient';
import {
	checkoutStateForPr, checkoutTargetForPr, fetchGitWorkspaceStatus, fetchLocalPullRequestFileContent, fetchLocalPullRequestFiles
} from '@/lib/api/gitCheckoutClient';
import type { PendingComment, PRFile, PullRequestLocation }             from '@/lib/api/githubClient';
import GitHubClient                             from '@/lib/api/githubClient';
import { isWhitespaceOnlyFileChange }           from '@/lib/diff/patchDiff';
import { detectRenamedFiles }                   from '@/lib/diff/renameDetection';
import type { ForcedFilePair, ForcedPairScope } from '@/lib/forcedFilePairs';
import { addForcedFilePair, loadForcedFilePairs, removeForcedFilePair } from '@/lib/forcedFilePairs';
import { loadLocalViewedFiles, setLocalFileViewed }                     from '@/lib/localViewedFiles';
import { loadPendingReview, savePendingReview } from '@/lib/pendingReviewStorage';
import { isPinned, syncPinnedPr, togglePinnedPr }                       from '@/lib/pinnedPrs';
import { diffVersion, prDetails, prKey }        from '@/lib/store/prStore';
import type { ResolvedScheme }                  from '@/lib/theme/colorScheme';
import { getResolvedScheme, subscribeColorScheme }                      from '@/lib/theme/colorScheme';
import { getStoredHljsThemeId, loadHljsTheme, setStoredHljsThemeId }    from '@/lib/theme/hljsTheme';
import { toCursorFileHref }                     from '@/lib/utils';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

type PrDetailTab = 'overview' | 'local-files' | 'pr-files';

@Component({
	components : {
		PrDetailLoadState,
		PrDetailTabBar,
		PinnedPrBar,
		SettingsPopup,
		PrTitleEditModal,
		PrWhitespaceViewedModal,
	},
	emits : [ 'update:fileIndex', 'close', 'logout', 'open-pr' ],
})
export default class PrDetailView extends Vue {

	/** Line break matches prior `data-tooltip` &#10; for multi-line has-tooltip text. */
	readonly whitespaceViewedBtnTooltip = 'Mark unviewed files whose patch changes only whitespace as viewed on GitHub (same as the PR Files tab checkbox).\nSkips files without a patch or with uneven diff blocks.';

	@Prop({ required : true }) readonly owner!: string;
	@Prop({ required : true }) readonly repo!: string;
	@Prop({ required : true }) readonly number!: string;
	@Prop({ required : true }) readonly tab!: string;
	@Prop({ default : false }) readonly embedded!: boolean;

	files: PRFile[]                          = [];
	localFiles: PRFile[]                     = [];
	localViewedFiles: Record<string, string> = {};
	/** Deletion/addition pairs the reader told PRism to compare, whatever its own detection concluded. */
	forcedFilePairs: ForcedFilePair[]        = [];
	/** Why the last pairing the reader asked for could not be built; shown above the diff until dismissed. */
	filePairError          = '';
	loading                = true;
	filesLoading           = false;
	localFilesLoading      = false;
	localFilesError        = '';
	error                  = '';
	activeTab: PrDetailTab = 'overview';

	resolvedScheme: ResolvedScheme = getResolvedScheme();
	hljsTheme                      = getStoredHljsThemeId(getResolvedScheme());
	currentUser: { login: string; avatar_url?: string } | null = null;
	viewedFiles: Record<string, string>                        = {};
	pendingComments: PendingComment[]                          = [];
	prNodeId                                                   = '';
	submittingReview                                           = false;
	titleEditOpen                                              = false;
	whitespaceViewedConfirmOpen                                = false;
	whitespaceViewedConfirmError                               = '';
	markingWhitespaceViewed                                    = false;
	checkoutStatus: GitWorkspaceStatus | null                  = null;
	refreshing                                                 = false;
	/** When set while the PR Files tab is shown, selects the diff file and focuses the comment thread there. Cleared after the tab handles it. */
	pendingThreadFocus: null | { path: string; line: number; side: 'LEFT' | 'RIGHT'; nonce: number } = null;

	_unsubColorScheme: (() => void) | null     = null;
	_onDocumentVisibility: (() => void) | null = null;
	_originalTitle                             = '';
	/** GitHub's own file list, before PRism merges renamed pairs into it. */
	_rawPrFiles: PRFile[]                        = [];
	/** Commit the pull request's diff is computed against; empty until resolved, and `base.sha` if it cannot be. */
	mergeBaseSha                                 = '';
	_mergeBaseShaPromise: Promise<string> | null  = null;
	_loadFilesPromise: Promise<void> | null       = null;
	_loadLocalFilesPromise: Promise<void> | null  = null;
	_loadViewedStatePromise: Promise<void> | null = null;
	embeddedFileIndex = 0;
	localFileIndex    = 0;

	@Watch('hljsTheme')
	onHljsThemeChanged(val: string) {
		setStoredHljsThemeId(this.resolvedScheme, val);
		loadHljsTheme(val);
	}

	/** Stable key for SPA navigation between PRs (owner/repo/number only). */
	get prRouteKey(): string {
		return `${this.owner}/${this.repo}/${this.number}`;
	}

	@Watch('prRouteKey')
	onPrRouteKeyChanged(_newKey: string, oldKey: string | undefined) {
		if (oldKey === undefined) {
			return;
		}
		// Everything the Overview tab held for the previous pull request goes with it: the tab is keyed by this route.
		const parts = oldKey.split('/');
		if (parts.length !== 3) {
			return;
		}
		const [ o, r, nStr ] = parts;
		const n              = parseInt(nStr, 10);
		if (!Number.isFinite(n)) {
			return;
		}
		const head = this.pr?.head?.sha;
		if (head) {
			savePendingReview(o, r, n, head, this.pendingComments);
		}
		this.pendingComments = [];
		void this.loadAll();
	}

	get prNumber(): number {
		return parseInt(this.number, 10);
	}

	/**
	 * The pull request itself, read from its record rather than copied into this component. Every view
	 * showing this pull request renders the same object, so a label added here, a title edited there or a
	 * poll that found a merge lands everywhere at once — and coming back to a PR already read renders it
	 * immediately, with the revalidation happening behind what is already on screen.
	 */
	get pr(): any {
		return prDetails.peek(prKey(this.owner, this.repo, this.prNumber))?.data ?? null;
	}

	/**
	 * PR # shown in the header badge, dialogs, tab title, and children: prefer the route param so it always
	 * matches `/pull-request/:owner/:repo/:number`, since `pr.number` from payloads can occasionally disagree.
	 */
	get routeBackedPrNumber(): number {
		const fromRoute = this.prNumber;
		if (Number.isInteger(fromRoute) && fromRoute > 0) {
			return fromRoute;
		}
		const fromApi = this.pr?.number;
		if (typeof fromApi === 'number' && Number.isFinite(fromApi)) {
			return fromApi;
		}
		const parsed = parseInt(String(fromApi ?? ''), 10);
		return Number.isFinite(parsed) ? parsed : 0;
	}

	/** Header badge: open PRs show # only; draft / merged / closed add an explicit status. */
	get prStatusBadgeText(): string {
		const n = this.routeBackedPrNumber;
		switch (true) {
			case !this.pr: return '';
			case this.pr.draft: return `#${n} · Draft`;
			case this.pr.merged: return `#${n} · Merged`;
			case this.pr.state === 'closed': return `#${n} · Closed`;
			default: return `#${n}`;
		}
	}

	get prStatusBadgeClass(): string {
		switch (true) {
			case this.pr?.draft: return 'pr-detail-badge-draft';
			case this.pr?.merged: return 'pr-detail-badge-merged';
			case this.pr?.state === 'closed': return 'pr-detail-badge-closed';
			default: return 'pr-detail-badge-open';
		}
	}

	/** First file index not marked VIEWED on GitHub; 0 if none or all viewed. */
	get firstNonViewedFileIndex(): number {
		for (let i = 0; i < this.files.length; i++) {
			if (this.viewedFiles[this.files[i].filename] !== 'VIEWED') {
				return i;
			}
		}
		return 0;
	}

	get initialFileIndex(): number {
		if (this.embedded) {
			return this.files.length && this.embeddedFileIndex >= 0 && this.embeddedFileIndex < this.files.length ? this.embeddedFileIndex : this.firstNonViewedFileIndex;
		}
		const q   = this.$route.query.file;
		const idx = typeof q === 'string' ? parseInt(q, 10) : NaN;
		if (!isNaN(idx)) {
			return this.files.length && idx >= 0 && idx < this.files.length ? idx : 0;
		}
		return this.firstNonViewedFileIndex;
	}

	get reviewedCount(): number {
		return Object.values(this.viewedFiles).filter(s => s === 'VIEWED').length;
	}

	/**
	 * Files the review progress is measured against; `changed_files` stands in on Overview, where the file list is not
	 * fetched. Stays 0 until the viewed state has loaded (`prNodeId` set) so the bar does not flash 0%.
	 */
	get reviewTotal(): number {
		if (this.files.length) {
			return this.files.length;
		}
		return this.prNodeId ? this.pr?.changed_files || 0 : 0;
	}

	get checkoutState(): PullRequestCheckoutState | null {
		return checkoutStateForPr(this.pr, this.checkoutStatus);
	}

	get checkoutWorkspaceReady(): boolean {
		return this.checkoutStatus?.mode === 'single' || this.checkoutStatus?.mode === 'worktree-parent';
	}

	/** Header badge: whether this PR is checked out locally and, when it is, which worktree holds it. */
	get checkoutBadgeText(): string {
		const state = this.checkoutState;
		if (state) {
			return state.isMain ? 'Checked out' : `Checked out: ${state.label}`;
		}
		// Without a configured workspace there is nothing to be checked out into, so say nothing at all.
		return this.checkoutWorkspaceReady ? 'Not checked out' : '';
	}

	get checkoutBadgeClass(): string {
		const state = this.checkoutState;
		if (!state) {
			return 'pr-detail-checkout-badge-none';
		}
		return state.shaMatches ? 'pr-detail-checkout-badge-current' : 'pr-detail-checkout-badge-stale';
	}

	get checkoutBadgeTitle(): string {
		const state = this.checkoutState;
		if (!state) {
			const dir = this.checkoutStatus?.hostWorkspaceDir || this.checkoutStatus?.workspaceDir;
			return dir ? `Not checked out in ${dir}` : 'Not checked out';
		}
		const freshness = state.shaMatches ? 'At PR head' : 'Branch is checked out but not at the latest PR head';
		return `${freshness} in ${state.hostPath || state.path}`;
	}

	get cursorCheckoutPath(): string {
		return this.checkoutState?.hostPath || this.checkoutState?.path || '';
	}

	/** On the Local Files tab the button deep-links to the file being reviewed instead of just the checkout root. */
	get cursorTargetPath(): string {
		const root = this.cursorCheckoutPath;
		if (!root || this.activeTab !== 'local-files') {
			return root;
		}
		// A deleted file no longer exists on disk, so fall back to opening the checkout itself.
		const file = this.localFiles[this.localFileIndex];
		return !file || file.status === 'removed' ? root : `${root.replace(/\/+$/, '')}/${file.filename}`;
	}

	get cursorCheckoutHref(): string {
		const path = this.cursorTargetPath;
		return path ? toCursorFileHref(path) : '';
	}

	/** Without a local checkout of the PR branch there can be no local file changes, so the Local Files tab is hidden. */
	get hasLocalCheckout(): boolean {
		return Boolean(this.checkoutState);
	}

	get whitespaceOnlyUnviewedFiles(): PRFile[] {
		return this.files.filter(f => isWhitespaceOnlyFileChange(f) && this.viewedFiles[f.filename] !== 'VIEWED');
	}

	get whitespaceOnlyUnviewedCount(): number {
		return this.whitespaceOnlyUnviewedFiles.length;
	}

	get showMarkWhitespaceViewedButton(): boolean {
		return Boolean(this.activeTab === 'pr-files' && this.files.length && this.prNodeId && this.whitespaceOnlyUnviewedCount > 0);
	}

	get localFilesEmptyMessage(): string {
		return this.localFilesError || 'No local changes';
	}

	mounted() {
		this._originalTitle = document.title;
		if (!this.embedded && (this.tab === 'pr-files' || this.tab === 'local-files')) {
			this.activeTab = this.tab;
		}
		const token = getStoredToken();
		if (token) {
			GitHubClient.setToken(token);
		}
		void this.loadCurrentUser();
		this.resolvedScheme = getResolvedScheme();
		this.hljsTheme      = getStoredHljsThemeId(this.resolvedScheme);
		loadHljsTheme(this.hljsTheme);
		this._unsubColorScheme = subscribeColorScheme(() => {
			const next          = getResolvedScheme();
			this.resolvedScheme = next;
			this.hljsTheme      = getStoredHljsThemeId(next);
			loadHljsTheme(this.hljsTheme);
		});
		this._onDocumentVisibility = () => {
			if (document.visibilityState !== 'visible' || this.loading || this.error || !this.pr || this.overviewTab()?.mergingPr) {
				return;
			}
			void this.refreshPrWhenTabVisible();
		};
		document.addEventListener('visibilitychange', this._onDocumentVisibility);
		this.loadAll();
	}

	beforeUnmount() {
		if (this._onDocumentVisibility) {
			document.removeEventListener('visibilitychange', this._onDocumentVisibility);
			this._onDocumentVisibility = null;
		}
		this.persistPendingToStorage();
		this._unsubColorScheme?.();
		this._unsubColorScheme = null;
		document.title         = this._originalTitle;
	}

	private async loadCurrentUser(): Promise<void> {
		const cached = GitHubClient.getUser();
		if (cached?.login) {
			this.currentUser = { login : cached.login, avatar_url : cached.avatar_url };
			return;
		}
		if (!getStoredToken()) {
			return;
		}
		try {
			const user       = await GitHubClient.fetchCurrentUser();
			this.currentUser = { login : user.login, avatar_url : user.avatar_url };
		}
		catch {
			this.currentUser = null;
		}
	}

	handleLogout() {
		if (this.embedded) {
			this.$emit('logout');
			return;
		}
		clearToken();
		GitHubClient.clear();
		this.$router.push('/');
	}

	/** Always mounted while the pull request is shown, so the view can hand it the re-reads it takes part in. */
	private overviewTab(): PrOverviewTab | undefined {
		return this.$refs.overviewTab as PrOverviewTab | undefined;
	}

	/** Pick up merges or other GitHub-side updates when returning to this tab. */
	private async refreshPrWhenTabVisible(): Promise<void> {
		try {
			// Force refresh: without it GitHub's 60-second cache can return the pre-push head sha, and every
			// diff read below is keyed off that sha, so the whole tab would refresh back to the old commit.
			const pr = await GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber, true);
			syncPinnedPr(pr);
			void this.refreshCheckoutStatus();
			void this.overviewTab()?.refresh();
			document.title = `#${this.routeBackedPrNumber} ${this.pr.title}`;
		}
		catch (e: any) {
			console.error('Failed to refresh PR when tab became visible:', e);
		}
	}

	/**
	 * Reads the pull request itself and restores the pending review saved against its head commit. The tabs
	 * read everything else they show for themselves.
	 *
	 * A `mergedPr` already in hand is written into the record rather than read back out of GitHub — the view
	 * renders from that record, so this is what puts the merged state on screen.
	 */
	private async readPullRequest(force: boolean, mergedPr?: any): Promise<void> {
		if (mergedPr) {
			GitHubClient.recordPullRequest(this.owner, this.repo, this.prNumber, mergedPr);
		}
		const pr = mergedPr || await GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber, force);
		syncPinnedPr(pr);
		document.title       = `#${this.routeBackedPrNumber} ${this.pr.title}`;
		const headSha        = pr.head?.sha;
		this.pendingComments = headSha ? loadPendingReview(this.owner, this.repo, this.prNumber, headSha) ?? [] : [];
		if (pr.user?.login) {
			await GitHubClient.fetchUserFirstNames([ pr.user.login ]);
		}
	}

	/** Reload PR + related data without the full-page loading overlay, once the Overview tab reports a merge. */
	async refreshMergedPullRequest(mergedPr?: any): Promise<void> {
		try {
			await this.readPullRequest(true, mergedPr);
			void this.refreshCheckoutStatus();
			if (this.activeTab === 'pr-files') {
				// The file list is already loaded at this point, so it needs forcing to pick up the merge.
				this.loadFiles(true);
			}
			else if (this.activeTab === 'local-files') {
				this.loadLocalFiles();
			}
		}
		catch (e: any) {
			console.error('Failed to refresh PR after merge:', e);
		}
	}

	async loadAll() {
		// The overlay is for having nothing to show, not for being busy. Returning to a pull request whose
		// record is already held renders it at once and revalidates behind it.
		this.loading              = !this.pr;
		this.error                = '';
		this.forcedFilePairs      = loadForcedFilePairs(this.forcedPairScope);
		this._mergeBaseShaPromise = null;
		this.mergeBaseSha         = '';
		try {
			await this.readPullRequest(false);
			this.loading = false;
			void this.refreshCheckoutStatus();
			// Not there on a first load, which the Overview tab covers by reading its own panels when it mounts.
			void this.overviewTab()?.refresh();
			if (this.activeTab === 'pr-files') {
				this.loadFiles();
			}
			else if (this.activeTab === 'local-files') {
				this.loadLocalFiles();
			}
			else {
				void this.ensureViewedStateLoaded();
			}
		}
		catch (e: any) {
			this.error   = e.message || 'Failed to load PR';
			this.loading = false;
		}
	}

	/**
	 * The header Refresh button. Reloads the pull request itself plus whatever the active tab is showing —
	 * on PR Files that means re-reading the changed-file list and its diffs, not just the overview panels.
	 */
	async refreshDetail(): Promise<void> {
		if (this.refreshing) {
			return;
		}
		this.refreshing = true;
		this.error      = '';
		try {
			// Nothing is dropped here. Each read is told to revalidate, and its record keeps the data it
			// already had until GitHub hands back something different — so the screen is never emptied, and
			// anything that did not actually change is not re-fetched, re-parsed or re-rendered.
			await this.readPullRequest(true);
			await Promise.all([
				this.refreshCheckoutStatus(),
				this.overviewTab()?.refresh(true),
				...this.refreshActiveTabData(),
			]);
		}
		catch (e: any) {
			this.error = e.message || 'Failed to refresh PR';
		}
		finally {
			this.refreshing = false;
		}
	}

	/**
	 * Reloads for whichever tab is on screen, plus any other tab whose data is already loaded and would
	 * otherwise go stale behind the user. loadFiles(true) refetches viewed state itself, so the standalone
	 * viewed-state read is only needed when the file list is not being reloaded.
	 */
	private refreshActiveTabData(): Promise<unknown>[] {
		const reloads: Promise<unknown>[] = [];
		const reloadPrFiles               = this.activeTab === 'pr-files' || this.files.length > 0;
		const reloadLocalFiles            = this.activeTab === 'local-files' || this.localFiles.length > 0;

		if (reloadPrFiles) {
			reloads.push(this.loadFiles(true));
		}
		else {
			reloads.push(this.loadViewedState(true));
		}
		if (reloadLocalFiles) {
			reloads.push(this.loadLocalFiles());
		}
		return reloads;
	}

	async refreshCheckoutStatus(): Promise<void> {
		let status: GitWorkspaceStatus | null = null;
		try {
			status = await fetchGitWorkspaceStatus();
		}
		catch {
			/* No workspace to report on */
		}
		this.applyCheckoutStatus(status);
	}

	private applyCheckoutStatus(status: GitWorkspaceStatus | null): void {
		this.checkoutStatus = status;
		// The Local Files tab is gone once the checkout is, so do not leave it showing.
		if (!this.hasLocalCheckout && this.activeTab === 'local-files') {
			this.switchTab('overview');
		}
	}

	/**
	 * An Overview git action moved the worktree, so the local diff held for it and its viewed marks no longer
	 * apply. The checkout status comes with the event when the action returned one, and is re-read when not.
	 */
	onWorktreeChanged(status?: GitWorkspaceStatus): void {
		this.localFiles       = [];
		this.localViewedFiles = {};
		if (status) {
			this.applyCheckoutStatus(status);
		}
		else {
			void this.refreshCheckoutStatus();
		}
	}

	/**
	 * Load the PR's changed-file list plus its viewed state. Already-loaded files are kept unless `force` is
	 * set, which is what the Refresh button uses to pick up commits pushed since the tab was opened.
	 */
	async loadFiles(force = false): Promise<void> {
		if (!force && this.files.length) {
			return;
		}
		if (this._loadFilesPromise) {
			return this._loadFilesPromise;
		}
		this.filesLoading      = true;
		this._loadFilesPromise = (async () => {
			try {
				// Resolved with the list rather than after it: the base panes are read at this commit, so it
				// has to be in hand before the Files tab starts fetching them.
				const [ rawFiles, mergeBase ] = await Promise.all([
					GitHubClient.fetchPRFiles(this.owner, this.repo, this.prNumber, this.prDiffVersion, force),
					this.resolveMergeBaseSha(),
				]);
				this._rawPrFiles  = rawFiles;
				this.mergeBaseSha = mergeBase;
				await this.mergeAndApplyPrFiles(force);
			}
			catch (e: any) {
				// A failed refresh should leave the reader on the list they already had rather than
				// emptying the tab; only an initial load has nothing worth keeping.
				console.error('Failed to load PR files:', e);
				if (!force) {
					this.files = [];
				}
			}
			finally {
				this.filesLoading      = false;
				this._loadFilesPromise = null;
			}
		})();
		return this._loadFilesPromise;
	}

	async ensureFilesLoaded(): Promise<void> {
		await this.loadFiles();
	}

	/**
	 * Commit the PR Files tab reads its base panes from. GitHub diffs a pull request against the merge base,
	 * not against the base branch's current tip, so reading `base.sha` shows the wrong "before" for any file
	 * the base branch has touched since — and nothing at all for one it has already deleted.
	 */
	/** Which pull request a mutation acted on, so its result can be written into that record directly. */
	get prLocation(): PullRequestLocation {
		return { owner : this.owner, repo : this.repo, number : this.prNumber };
	}

	get prFilesBaseRef(): string {
		return this.mergeBaseSha || this.pr?.base?.sha || '';
	}

	/**
	 * What the pull request's diff is computed from, and so the version of everything derived from it. Both
	 * commits are in it: GitHub diffs against the merge base, so a base branch that moved can change the diff
	 * without the head commit moving at all. This is the base branch's tip rather than the merge base itself
	 * because it is known immediately — the merge base costs a request, and over-invalidating is safe where
	 * under-invalidating is the bug this replaces.
	 */
	get prDiffVersion(): string {
		return diffVersion(this.pr?.base?.sha || '', this.pr?.head?.sha || '');
	}

	get forcedPairScope(): ForcedPairScope {
		return { owner : this.owner, repo : this.repo, prNumber : this.routeBackedPrNumber };
	}

	/**
	 * Merge renamed pairs into GitHub's own file list and hand the result to the Files tab. A forced pair
	 * that cannot be built is dropped rather than kept as an invisible setting: it never becomes a merged
	 * entry, so nothing in the list could undo it, and the reader is told why instead.
	 */
	private async mergeAndApplyPrFiles(force = false): Promise<void> {
		const failed: ForcedFilePair[] = [];
		const fileList                 = await detectRenamedFiles(
			this._rawPrFiles,
			this.loadRenameCandidateContent,
			this.forcedFilePairs,
			(pair, reason) => {
				failed.push(pair);
				this.filePairError = reason;
			}
		);
		const result = await GitHubClient.fetchPRFilesViewedState(this.owner, this.repo, this.prNumber, this.prDiffVersion, force);
		this.applyViewedStateFromApi(fileList, result);
		this.files = fileList;
		for (const pair of failed) {
			this.forcedFilePairs = removeForcedFilePair(this.forcedPairScope, pair);
		}
	}

	/**
	 * Re-merge the file list around a pairing the reader just made or undid. The list is rebuilt from
	 * GitHub's own entries rather than patched in place, so an entry that was already merged comes apart
	 * again cleanly and the remaining pairs are re-detected against what is left — and since those entries
	 * are still in hand, nothing is refetched from GitHub.
	 */
	private async applyForcedFilePairs(pairs: ForcedFilePair[]): Promise<void> {
		this.forcedFilePairs = pairs;
		if (this._rawPrFiles.length) {
			await this.mergeAndApplyPrFiles();
		}
		else {
			await this.loadFiles(true);
		}
	}

	async forceFilePair(pair: ForcedFilePair): Promise<void> {
		this.filePairError = '';
		await this.applyForcedFilePairs(addForcedFilePair(this.forcedPairScope, pair));
	}

	async unforceFilePair(pair: ForcedFilePair): Promise<void> {
		this.filePairError = '';
		await this.applyForcedFilePairs(removeForcedFilePair(this.forcedPairScope, pair));
	}

	async loadLocalFiles(): Promise<void> {
		if (this._loadLocalFilesPromise) {
			return this._loadLocalFilesPromise;
		}
		const target = checkoutTargetForPr(this.pr);
		if (!target) {
			this.localFiles      = [];
			this.localFilesError = 'Reload this pull request so branch details are available.';
			return;
		}
		this.localFilesLoading      = true;
		this.localFilesError        = '';
		this._loadLocalFilesPromise = (async () => {
			try {
				this.localFiles       = await fetchLocalPullRequestFiles(target);
				this.localViewedFiles = this.loadLocalViewedState(this.localFiles);
				void this.overviewTab()?.refreshLocalPrStatus();
			}
			catch (error: any) {
				this.localFiles       = [];
				this.localViewedFiles = {};
				this.localFilesError  = error.message || 'Could not load local changes';
			}
			finally {
				this.localFilesLoading      = false;
				this._loadLocalFilesPromise = null;
			}
		})();
		return this._loadLocalFilesPromise;
	}

	async loadLocalFileContent(file: PRFile): Promise<{ base: string | null; head: string | null }> {
		const target = checkoutTargetForPr(this.pr);
		if (!target) {
			throw new Error('Reload this pull request so branch details are available.');
		}
		return fetchLocalPullRequestFileContent(target, file);
	}

	private loadLocalViewedState(files: PRFile[]): Record<string, string> {
		const headSha = this.pr?.head?.sha;
		if (!headSha) {
			return {};
		}
		return loadLocalViewedFiles({ owner : this.owner, repo : this.repo, prNumber : this.routeBackedPrNumber, headSha }, files);
	}

	/**
	 * One side of one candidate file, for the rename detector. Throwing abandons the pair, and says why for
	 * a pair the reader forced.
	 *
	 * The base side is read at the merge base, falling back to `base.sha`. The two are usually the same
	 * commit, but `base.sha` tracks the base branch's tip: once that branch moves on past the pull request —
	 * deleting or renaming the same file itself, say — the file this pull request deletes is no longer
	 * there, while the merge base, which is what the diff is actually against, still has it.
	 */
	private loadRenameCandidateContent = async (path: string, side: 'base' | 'head'): Promise<string | null> => {
		const refs = side === 'head'
			? [ this.pr?.head?.sha ]
			: [ await this.resolveMergeBaseSha(), this.pr?.base?.sha ];
		const tried = [ ...new Set(refs.filter((ref): ref is string => Boolean(ref))) ];
		if (!tried.length) {
			throw new Error(`no ${side} commit is known for this pull request`);
		}

		let lastError = '';
		for (const ref of tried) {
			try {
				return await GitHubClient.fetchFileContent(this.owner, this.repo, path, ref);
			}
			catch (error: any) {
				lastError = `${error?.message || 'the read failed'} (at ${ref.slice(0, 7)})`;
			}
		}
		throw new Error(lastError);
	};

	/** Resolved at most once per pull request; `base.sha` stands in when the comparison cannot be read. */
	private resolveMergeBaseSha(): Promise<string> {
		const base = this.pr?.base?.sha;
		const head = this.pr?.head?.sha;
		if (!base || !head) {
			return Promise.resolve('');
		}
		this._mergeBaseShaPromise ??= GitHubClient.fetchMergeBaseSha(this.owner, this.repo, base, head).catch(() => '');
		return this._mergeBaseShaPromise;
	}

	/** Apply GitHub viewed-file state for `fileList` so `files` and `viewedFiles` stay in sync for the child PR Files tab. */
	private applyViewedStateFromApi(fileList: PRFile[], result: { prNodeId: string; viewedFiles: Record<string, string> }) {
		this.prNodeId = result.prNodeId;
		const byPath  = result.viewedFiles;
		if (fileList.length) {
			const merged: Record<string, string> = {};
			for (const f of fileList) {
				let state = byPath[f.filename];
				if (f.synthesizedRename && f.previous_filename) {
					// GitHub tracks the two halves separately, so the merged file is only really viewed
					// once both are — otherwise marking it viewed would not survive a reload.
					state = state === 'VIEWED' && byPath[f.previous_filename] === 'VIEWED' ? 'VIEWED' : 'UNVIEWED';
				}
				else if (state === undefined && f.previous_filename) {
					state = byPath[f.previous_filename];
				}
				if (state !== undefined) {
					merged[f.filename] = state;
				}
			}
			this.viewedFiles = merged;
		}
		else {
			this.viewedFiles = byPath;
		}
	}

	async loadViewedState(force = false) {
		try {
			const result = await GitHubClient.fetchPRFilesViewedState(this.owner, this.repo, this.prNumber, this.prDiffVersion, force);
			this.applyViewedStateFromApi(this.files, result);
		}
		catch {
			this.viewedFiles = {};
		}
	}

	/** Viewed state on its own, so the review progress shows on Overview without fetching the whole PR file list. */
	async ensureViewedStateLoaded(): Promise<void> {
		if (this.files.length || this.prNodeId) {
			return;
		}
		if (this._loadViewedStatePromise) {
			return this._loadViewedStatePromise;
		}
		this._loadViewedStatePromise = (async () => {
			try {
				await this.loadViewedState();
			}
			finally {
				this._loadViewedStatePromise = null;
			}
		})();
		return this._loadViewedStatePromise;
	}

	switchTab(tab: PrDetailTab) {
		this.activeTab = tab;
		if (!this.embedded) {
			const base = `/pull-request/${this.owner}/${this.repo}/${this.number}/${tab}`;
			this.$router.replace({ path : base });
		}
		if (tab === 'pr-files') {
			void this.loadFiles();
		}
		else if (tab === 'local-files') {
			void this.loadLocalFiles();
		}
		else {
			void this.ensureViewedStateLoaded();
		}
	}

	async onOpenReviewInFiles(nav: { path: string; line: number; side: 'LEFT' | 'RIGHT' }) {
		await this.ensureFilesLoaded();
		const side = nav.side === 'LEFT' ? 'LEFT' : 'RIGHT';
		this.switchTab('pr-files');
		this.pendingThreadFocus = { path : nav.path, line : nav.line, side, nonce : Date.now() };
	}

	onThreadFocusHandled() {
		this.pendingThreadFocus = null;
	}

	onFileIndexChange(index: number) {
		if (this.embedded) {
			this.embeddedFileIndex = index;
			return;
		}
		this.$router.replace({
			path  : `/pull-request/${this.owner}/${this.repo}/${this.number}/pr-files`,
			query : { file : String(index) },
		});
	}

	onLocalFileIndexChange(index: number) {
		this.localFileIndex = index;
	}

	onLocalViewedChange(payload: { filename: string; state: string }) {
		const file    = this.localFiles.find(item => item.filename === payload.filename);
		const headSha = this.pr?.head?.sha;
		if (!file || !headSha) {
			return;
		}
		setLocalFileViewed({
			owner    : this.owner,
			repo     : this.repo,
			prNumber : this.routeBackedPrNumber,
			headSha,
		}, file, payload.state);
		if (payload.state === 'VIEWED') {
			this.localViewedFiles = { ...this.localViewedFiles, [payload.filename] : 'VIEWED' };
		}
		else {
			const next = { ...this.localViewedFiles };
			delete next[payload.filename];
			this.localViewedFiles = next;
		}
	}

	onViewedChange(payload: { filename: string; state: string }) {
		this.viewedFiles = { ...this.viewedFiles, [payload.filename] : payload.state };
	}

	/**
	 * A pinned chip navigates to that PR. Embedded in the dashboard's slide-over the host owns which PR is
	 * shown, so hand it up; standalone, this is a route change the view's own `prRouteKey` watcher picks up.
	 */
	get prPinned(): boolean {
		return Boolean(this.pr) && isPinned(this.pr.id);
	}

	toggleCurrentPrPin() {
		if (!this.pr) {
			return;
		}
		togglePinnedPr({ id : this.pr.id, owner : this.owner, repo : this.repo, number : this.routeBackedPrNumber, title : this.pr.title });
	}

	openPinnedPr(target: { owner: string; repo: string; number: number }) {
		if (this.embedded) {
			this.$emit('open-pr', target);
			return;
		}
		void this.$router.push(`/pull-request/${target.owner}/${target.repo}/${target.number}`);
	}

	onAllFilesViewed() {
		this.switchTab('overview');
	}

	onAddPending(comment: PendingComment) {
		this.pendingComments = [ ...this.pendingComments, comment ];
		this.persistPendingToStorage();
	}

	onRemovePending(id: string) {
		this.pendingComments = this.pendingComments.filter(c => c.id !== id);
		this.persistPendingToStorage();
	}

	onEditPending(updated: PendingComment) {
		this.pendingComments = this.pendingComments.map(c => (c.id === updated.id ? updated : c));
		this.persistPendingToStorage();
	}

	async submitReview() {
		if (!this.pendingComments.length || this.submittingReview) {
			return;
		}
		this.submittingReview = true;
		try {
			await GitHubClient.submitReview(this.owner, this.repo, this.prNumber, this.pr.head.sha, this.pendingComments);
			this.pendingComments = [];
			this.persistPendingToStorage();
			// A review adds several comments at once, which the record cannot fold in itself, so it is re-read.
			await GitHubClient.fetchPRReviewComments(this.owner, this.repo, this.prNumber, true);
		}
		catch (e: any) {
			console.error('Failed to submit review:', e);
		}
		finally {
			this.submittingReview = false;
		}
	}

	discardAllPending() {
		this.pendingComments = [];
		this.persistPendingToStorage();
	}

	private persistPendingToStorage() {
		if (!this.pr?.head?.sha) {
			return;
		}
		savePendingReview(this.owner, this.repo, this.prNumber, this.pr.head.sha, this.pendingComments);
	}

	openWhitespaceViewedConfirm() {
		if (this.markingWhitespaceViewed || !this.whitespaceOnlyUnviewedCount) {
			return;
		}
		this.whitespaceViewedConfirmError = '';
		this.whitespaceViewedConfirmOpen  = true;
	}

	closeWhitespaceViewedConfirm() {
		if (this.markingWhitespaceViewed) {
			return;
		}
		this.whitespaceViewedConfirmOpen  = false;
		this.whitespaceViewedConfirmError = '';
	}

	openTitleEdit() {
		this.titleEditOpen = Boolean(this.pr);
	}

	onTitleSaved(title: string) {
		this.pr.title      = title;
		document.title     = `#${this.routeBackedPrNumber} ${title}`;
		this.titleEditOpen = false;
	}

	async confirmMarkWhitespaceViewedFiles() {
		if (this.markingWhitespaceViewed || !this.prNodeId) {
			return;
		}
		const targets = this.whitespaceOnlyUnviewedFiles;
		if (!targets.length) {
			this.whitespaceViewedConfirmOpen = false;
			return;
		}
		this.whitespaceViewedConfirmError = '';
		this.markingWhitespaceViewed      = true;
		try {
			for (const f of targets) {
				await GitHubClient.markFileAsViewed(this.prNodeId, f.filename, this.prLocation);
				this.viewedFiles = { ...this.viewedFiles, [f.filename] : 'VIEWED' };
			}
			await this.loadViewedState();
			this.whitespaceViewedConfirmOpen = false;
		}
		catch (e: any) {
			console.error('Failed to mark whitespace-only files as viewed:', e);
			this.whitespaceViewedConfirmError = e.message || 'Failed to mark files as viewed';
		}
		finally {
			this.markingWhitespaceViewed = false;
		}
	}

}
</script>

<style>
.pr-detail-page {
	max-width: 100%;
}

.pr-detail-tab-shell > * {
	flex: 1;
	min-height: 0;
	min-width: 0;
	overflow: hidden;
}

.pr-detail-header {
	background: var(--bg-secondary);
	border-bottom: 1px solid var(--border);
}

html[data-color-scheme="light"] .pr-detail-header {
	background: #e4e7ec;
}

.pr-detail-back {
	border: 0;
	background: transparent;
	padding: 0;
	color: var(--text-secondary);
	text-decoration: none;
	font-size: 18px;
	line-height: 1;
	transition: color var(--transition);
	cursor: pointer;
	font-family: inherit;

	&:hover {
		color: var(--text-primary);
	}
}

.pr-detail-title {
	line-height: 1.2;
}

.pr-detail-header-icon-btn {
	width: 0;
	height: 28px;
	border: 1px solid var(--border);
	border-color: transparent;
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);
	overflow: hidden;
	transition:
		width var(--transition),
		opacity var(--transition),
		color var(--transition),
		border-color var(--transition),
		background var(--transition);
	opacity: 0;
	pointer-events: none;
}

.pr-detail-title-edit-group:hover .pr-detail-header-icon-btn,
.pr-detail-header-icon-btn:focus-visible {
	width: 28px;
	border-color: var(--border);
	opacity: 1;
	pointer-events: auto;
}

.pr-detail-header-icon-btn:hover {
	color: var(--text-primary);
	border-color: var(--text-tertiary);
}

.pr-detail-checkout-badge {
	padding: 2px 8px;
	border-radius: 20px;
}

.pr-detail-checkout-badge-current {
	background: var(--accent-green-bg);
	color: var(--accent-green);
}

/* Checked out, but the worktree is not sitting on the latest PR head. */
.pr-detail-checkout-badge-stale {
	background: var(--chip-orange-bg);
	color: var(--accent-orange);
}

.pr-detail-checkout-badge-none {
	background: var(--muted-bg);
	color: var(--text-tertiary);
}

.pr-detail-pin-btn {
	width: 30px;
	min-height: 30px;
	padding: 0;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);
	transition:
		color var(--transition),
		border-color var(--transition),
		background var(--transition);
}

.pr-detail-pin-btn:hover {
	color: var(--text-primary);
	border-color: var(--text-tertiary);
}

.pr-detail-pin-btn.pinned {
	border-color: var(--accent-blue);
	background: var(--chip-blue-bg);
	color: var(--accent-blue);
}

.pr-detail-header-refresh-btn {
	min-height: 30px;
	padding: 5px 10px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);
	font: inherit;
	font-size: 12px;
	font-weight: 600;
	line-height: 1;
	transition:
		color var(--transition),
		border-color var(--transition),
		background var(--transition);
}

.pr-detail-open-cursor-btn {
	min-height: 30px;
	padding: 5px 10px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);
	font: inherit;
	font-size: 12px;
	font-weight: 600;
	line-height: 1;
	text-decoration: none;
	transition:
		color var(--transition),
		border-color var(--transition),
		background var(--transition);
}

.pr-detail-open-cursor-btn:hover {
	color: var(--text-primary);
	border-color: var(--text-tertiary);
	background: var(--bg-tertiary);
}

.pr-detail-header-refresh-btn:hover:not(:disabled) {
	color: var(--text-primary);
	border-color: var(--text-tertiary);
	background: var(--bg-tertiary);
}

.pr-detail-header-refresh-btn:disabled {
	color: var(--text-tertiary);
	cursor: default;
	opacity: 0.72;
}

.pr-detail-header-refresh-btn.spinning svg {
	animation: spin 0.9s linear infinite;
}

.pr-detail-badge {
	font-size: 12px;
	font-weight: 600;
	padding: 2px 8px;
	border-radius: 20px;
	white-space: nowrap;
}

.pr-detail-badge-open {
	background: var(--accent-green-bg);
	color: var(--accent-green);
}

.pr-detail-badge-closed {
	background: var(--danger-bg-subtle);
	color: var(--accent-red);
}

.pr-detail-badge-merged {
	background: var(--accent-purple-bg);
	color: var(--accent-purple);
}

.pr-detail-badge-draft {
	background: var(--muted-bg);
	color: var(--text-secondary);
}

.pr-detail-avatar {
	width: 20px;
	height: 20px;
	border-radius: 50%;
}

.pr-detail-tabs {
	background: var(--bg-primary);
	border-radius: var(--radius-sm);
	border: 1px solid var(--border);
}

.pr-detail-tab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 28px;
	padding: 4px 10px;
	border: none;
	background: transparent;
	color: var(--text-secondary);
	font-size: 12px;
	font-weight: 600;
	line-height: 1;
	border-radius: 4px;
	cursor: pointer;
	transition: all var(--transition);
	font-family: inherit;
	white-space: nowrap;

	&:hover {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}

	&.active {
		color: var(--text-primary);
		background: var(--bg-tertiary);
	}
}

.pr-detail-tab-count {
	min-width: 16px;
	padding: 1px 4px;
	border-radius: 999px;
	background: var(--muted-bg);
	color: var(--text-secondary);
	font-size: 11px;
	font-variant-numeric: tabular-nums;
	font-weight: 600;
	line-height: 1.2;
	text-align: center;
}

.pr-detail-tab.active .pr-detail-tab-count {
	background: var(--bg-primary);
	color: var(--text-primary);
}

.pr-detail-review-bar-track {
	width: 60px;
	height: 6px;
	border-radius: 3px;
	background: var(--bg-tertiary);
	overflow: hidden;
}

.pr-detail-review-bar-fill {
	display: block;
	height: 100%;
	border-radius: 3px;
	transition:
		width 0.3s ease,
		background 0.3s ease;
}

.pr-detail-review-pct {
	font-size: 13px;
	font-weight: 700;
	min-width: 32px;
}

.pr-detail-review-progress.low {
	.pr-detail-review-bar-fill {
		background: var(--text-tertiary);
	}
	.pr-detail-review-pct {
		color: var(--text-secondary);
	}
}

.pr-detail-review-progress.partial {
	.pr-detail-review-bar-fill {
		background: var(--accent-orange);
	}
	.pr-detail-review-pct {
		color: var(--accent-orange);
	}
}

.pr-detail-review-progress.complete {
	.pr-detail-review-bar-fill {
		background: var(--accent-green);
	}
	.pr-detail-review-pct {
		color: var(--accent-green);
	}
}

.pr-whitespace-viewed-btn {
	padding: 3px 10px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);
	font-size: 12px;
	font-weight: 600;
	font-family: inherit;
	transition: all var(--transition);
}

.pr-whitespace-viewed-btn:hover:not(:disabled) {
	color: var(--text-primary);
	border-color: var(--text-tertiary);
}

.pr-whitespace-viewed-btn:disabled {
	opacity: 0.6;
	cursor: default;
}

.pr-detail-control-wrap {
	vertical-align: middle;
}

.pr-detail-control-wrap.has-tooltip::after {
	content: attr(data-tooltip);
	position: absolute;
	top: calc(100% + 6px);
	right: 0;
	left: auto;
	transform: none;
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
	z-index: 200;
	max-width: min(280px, 70vw);
	text-align: left;
}

.pr-detail-control-wrap.has-tooltip:hover::after {
	opacity: 1;
}

.pr-detail-tab-size {
	padding: 4px 24px 4px 8px;
	background: var(--bg-primary);
	color: var(--text-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-size: 12px;
	font-family: inherit;
	cursor: pointer;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='%238b949e'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 6px center;
	transition: all var(--transition);

	&:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	&:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 1px var(--focus-ring);
	}
}

.pr-review-submit-btn {
	padding: 5px 14px;
	border: none;
	border-radius: var(--radius-sm);
	background: var(--btn-primary-bg);
	color: var(--btn-primary-fg);
	font-size: 12px;
	font-weight: 600;
	font-family: inherit;
	transition: all var(--transition);

	&:hover:not(:disabled) {
		background: var(--btn-primary-hover);
	}
	&:disabled {
		opacity: 0.6;
		cursor: default;
	}
}

.pr-review-discard-btn {
	width: 26px;
	height: 26px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: transparent;
	color: var(--text-tertiary);
	font-size: 16px;
	transition: all var(--transition);

	&:hover {
		color: var(--accent-red);
		border-color: var(--accent-red);
		background: var(--danger-bg-subtle);
	}
}

.pr-detail-appearance :deep(.appearance-select) {
	padding: 4px 24px 4px 8px;
	font-size: 12px;
	max-width: 100px;
	background-position: right 6px center;
}

.pr-detail-appearance :deep(.appearance-select:focus) {
	border-color: var(--focus-ring);
	box-shadow: 0 0 0 1px var(--focus-ring);
}
</style>
