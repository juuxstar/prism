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
							:review-pct="reviewPct"
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
					<pr-overview-tab
						v-if="activeTab === 'overview'"
						:pr="pr"
						:owner="owner"
						:repo="repo"
						:pr-number="routeBackedPrNumber"
						:commit-id="pr.head?.sha || ''"
						:checks="checks"
						:checks-loading="checksLoading"
						:repo-labels="repoLabels"
						:review-comments="reviewComments"
						:issue-comments="issueComments"
						:comments-loading="reviewCommentsLoading"
						:review-decision="reviewDecision"
						:show-merge-action="showMergePrButton || mergingPr"
						:approving-pr="approvingPr"
						:merging-pr="mergingPr"
						:closing-pr="closingPr"
						:toggling-draft="togglingDraft"
						:checkout-status="checkoutStatus"
						:local-pr-status="localPrStatus"
						:committing-local-changes="committingLocalChanges"
						:pushing-local-changes="pushingLocalChanges"
						:merging-default-branch="mergingDefaultBranch"
						:checking-out-pr="checkingOutPr"
						:checkout-error="checkoutError"
						:local-git-error="localGitError"
						@add-label="addLabel"
						@remove-label="removeLabel"
						@comments-updated="onCommentsUpdated"
						@open-review-in-files="onOpenReviewInFiles"
						@approve-pr="approvePr"
						@merge-pr="openMergeConfirm"
						@close-pr="openCloseConfirm"
						@toggle-draft="togglePrDraft"
						@checkout-pr="checkoutPrBranch"
						@commit-local-changes="openLocalCommitModal"
						@push-local-changes="pushLocalChanges"
						@merge-default-branch="openDefaultBranchMergeConfirm"
					/>
					<pr-files-tab
						v-else-if="activeTab === 'local-files'"
						:files="localFiles"
						:files-loading="localFilesLoading"
						:owner="owner"
						:repo="repo"
						:base-ref="pr.head.sha"
						:head-ref="pr.head.sha"
						:initial-file-index="localFileIndex"
						:pr-title="pr.title"
						:pr-number="routeBackedPrNumber"
						:pr-author-login="pr.user.login"
						:tab-size="tabSize"
						:diff-font-size="diffFontSize"
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
						:pr-title="pr.title"
						:pr-number="routeBackedPrNumber"
						:pr-author-login="pr.user.login"
						:tab-size="tabSize"
						:diff-font-size="diffFontSize"
						:viewed-files="viewedFiles"
						:pr-node-id="prNodeId"
						:review-comments="reviewComments"
						:pending-comments="pendingComments"
						:commit-id="pr.head.sha"
						@update:file-index="onFileIndexChange"
						@update:viewed="onViewedChange"
						@add-pending="onAddPending"
						@remove-pending="onRemovePending"
						@edit-pending="onEditPending"
						@comments-updated="onCommentsUpdated"
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
				<pr-merge-confirm-modal
					v-if="pr"
					:open="mergeConfirmOpen"
					:owner="owner"
					:repo="repo"
					:pr-number="routeBackedPrNumber"
					:base-ref="pr.base.ref"
					:unmet-requirements="mergeConfirmUnmetRequirements"
					:restore-worktree-label="worktreeToRestoreOnMerge?.label || ''"
					:merging="mergingPr"
					@close="closeMergeConfirm"
					@confirm="confirmMergePr"
				/>
				<pr-whitespace-viewed-modal
					:open="whitespaceViewedConfirmOpen"
					:count="whitespaceOnlyUnviewedCount"
					:error="whitespaceViewedConfirmError"
					:marking="markingWhitespaceViewed"
					@close="closeWhitespaceViewedConfirm"
					@confirm="confirmMarkWhitespaceViewedFiles"
				/>
				<pr-close-confirm-modal
					:open="closeConfirmOpen"
					:owner="owner"
					:repo="repo"
					:pr-number="routeBackedPrNumber"
					:error="closeConfirmError"
					:closing="closingPr"
					@close="closeCloseConfirm"
					@confirm="confirmClosePr"
				/>
				<pr-default-branch-merge-confirm-modal
					v-if="pr"
					:open="defaultBranchMergeConfirmOpen"
					:default-branch="defaultBranch"
					:head-ref="pr.head?.ref || ''"
					:checkout-label="checkoutState?.label || ''"
					:error="defaultBranchMergeError"
					:merging="mergingDefaultBranch"
					@close="closeDefaultBranchMergeConfirm"
					@confirm="confirmMergeDefaultBranch"
				/>
				<pr-error-modal
					:open="Boolean(approvePrError)"
					title="Could not approve"
					title-id="pr-approve-error-title"
					:message="approvePrError"
					@close="dismissApproveError"
				/>
				<pr-error-modal
					:open="Boolean(mergePrError)"
					title="Could not merge"
					title-id="pr-merge-error-title"
					:message="mergePrError"
					@close="dismissMergeError"
				/>
				<pr-title-edit-modal
					v-model="titleEditValue"
					:open="titleEditOpen"
					:error="titleEditError"
					:updating="updatingTitle"
					@close="closeTitleEdit"
					@save="saveTitleEdit"
				/>
				<pr-modal-dialog
					:open="localCommitModalOpen"
					title="Commit local changes"
					title-id="local-commit-title"
					dialog-class="pr-local-commit-modal"
					:close-disabled="committingLocalChanges || pushingLocalChanges"
					:focus-on-open="false"
					@close="closeLocalCommitModal"
				>
					<label class="pr-local-commit-label u-flex u-flex-col u-gap-1 u-fs-13 u-fw-600">
						Commit message
						<textarea
							v-model="localCommitMessage"
							class="pr-local-commit-input u-fs-13"
							rows="4"
							:disabled="committingLocalChanges || pushingLocalChanges"
							@keydown.meta.enter.prevent="confirmLocalCommit"
							@keydown.ctrl.enter.prevent="confirmLocalCommit"
						></textarea>
					</label>
					<p v-if="localCommitError" class="pr-local-commit-error u-fs-13 u-mb-0">{{ localCommitError }}</p>
					<div class="pr-merge-confirm-actions pr-local-commit-actions u-flex u-justify-end u-gap-2-5 u-flex-wrap">
						<button type="button" class="btn btn-secondary" :disabled="committingLocalChanges || pushingLocalChanges" @click="closeLocalCommitModal">Cancel</button>
						<button type="button" class="btn btn-secondary" :disabled="localCommitActionDisabled" @click="confirmLocalCommit">
							<span v-if="committingLocalChanges && !commitAndPushRequested" class="async-loader"></span>
							<template v-else>Commit</template>
						</button>
						<button type="button" class="btn pr-merge-confirm-submit" :disabled="localCommitActionDisabled" @click="confirmLocalCommitAndPush">
							<span v-if="committingLocalChanges && commitAndPushRequested" class="async-loader"></span>
							<template v-else>Commit &amp; Push</template>
						</button>
					</div>
				</pr-modal-dialog>
			</Teleport>
		</template>
	</div>
</template>

<script lang="ts">
import PinnedPrBar                      from '@/components/pr/PinnedPrBar.vue';
import PrCloseConfirmModal              from '@/components/pr/PrCloseConfirmModal.vue';
import PrDefaultBranchMergeConfirmModal from '@/components/pr/PrDefaultBranchMergeConfirmModal.vue';
import PrDetailLoadState                from '@/components/pr/PrDetailLoadState.vue';
import PrDetailTabBar                   from '@/components/pr/PrDetailTabBar.vue';
import PrErrorModal                     from '@/components/pr/PrErrorModal.vue';
import PrMergeConfirmModal              from '@/components/pr/PrMergeConfirmModal.vue';
import PrModalDialog                    from '@/components/pr/PrModalDialog.vue';
import PrTitleEditModal                 from '@/components/pr/PrTitleEditModal.vue';
import PrWhitespaceViewedModal          from '@/components/pr/PrWhitespaceViewedModal.vue';
import SettingsPopup                    from '@/components/pr/SettingsPopup.vue';
import { clearToken, getStoredToken }   from '@/lib/api/auth';
import type { GitWorkspaceStatus, LocalPrStatus, PullRequestCheckoutState } from '@/lib/api/gitCheckoutClient';
import {
	checkoutPullRequestBranch, checkoutStateForPr, checkoutTargetForPr, commitLocalPullRequestChanges, defaultBranchForPr, fetchGitWorkspaceStatus,
	fetchLocalPullRequestFileContent, fetchLocalPullRequestFiles, fetchLocalPullRequestStatus, mergeDefaultBranchIntoPullRequest,
	pushLocalPullRequestChanges, resetWorktreeToNaturalBranch
} from '@/lib/api/gitCheckoutClient';
import type {
	AsyncMergeResult, CheckRunDetail, IssueComment, PendingComment, PRFile, PullRequestLocation, RepoLabel, ReviewComment
} from '@/lib/api/githubClient';
import GitHubClient                             from '@/lib/api/githubClient';
import { isWhitespaceOnlyFileChange }           from '@/lib/diff/patchDiff';
import { detectRenamedFiles }                   from '@/lib/diff/renameDetection';
import type { ForcedFilePair, ForcedPairScope } from '@/lib/forcedFilePairs';
import { addForcedFilePair, loadForcedFilePairs, removeForcedFilePair }                            from '@/lib/forcedFilePairs';
import { loadLocalViewedFiles, setLocalFileViewed } from '@/lib/localViewedFiles';
import { loadPendingReview, savePendingReview } from '@/lib/pendingReviewStorage';
import { isPinned, syncPinnedPr, togglePinnedPr } from '@/lib/pinnedPrs';
import { diffVersion, prDetails, prKey }        from '@/lib/store/prStore';
import type { ResolvedScheme }                  from '@/lib/theme/colorScheme';
import { getResolvedScheme, subscribeColorScheme } from '@/lib/theme/colorScheme';
import { getDiffFontSize, getDiffTabSize, setDiffFontSize, setDiffTabSize, subscribeDiffSettings } from '@/lib/theme/diffSettings';
import { getStoredHljsThemeId, loadHljsTheme, setStoredHljsThemeId } from '@/lib/theme/hljsTheme';
import { timeAgo, toCursorFileHref }            from '@/lib/utils';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

type PrDetailTab = 'overview' | 'local-files' | 'pr-files';

/** Review labels the Approve action clears, matching the board's `α/β/γ: review|changes requested` set. */
const TEAM_REQUESTED_LABEL = /^\s*[\u03b1\u03b2\u03b3]\s*:\s*(?:review|changes)[\s-]+requested\s*$/i;

/** Label the Approve action adds once the requested-review labels are gone. */
const READY_TO_MERGE_LABEL = 'ready to merge';

@Component({
	components : {
		PrCloseConfirmModal,
		PrDefaultBranchMergeConfirmModal,
		PrDetailLoadState,
		PrDetailTabBar,
		PrErrorModal,
		PrMergeConfirmModal,
		PrModalDialog,
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

	checks: CheckRunDetail[]                 = [];
	repoLabels: RepoLabel[]                  = [];
	files: PRFile[]                          = [];
	localFiles: PRFile[]                     = [];
	localViewedFiles: Record<string, string> = {};
	/** Deletion/addition pairs the reader told PRism to compare, whatever its own detection concluded. */
	forcedFilePairs: ForcedFilePair[]        = [];
	/** Why the last pairing the reader asked for could not be built; shown above the diff until dismissed. */
	filePairError          = '';
	loading                = true;
	checksLoading          = true;
	filesLoading           = false;
	localFilesLoading      = false;
	localFilesError        = '';
	error                  = '';
	activeTab: PrDetailTab = 'overview';
	tabSize                = getDiffTabSize();
	diffFontSize           = getDiffFontSize();

	resolvedScheme: ResolvedScheme = getResolvedScheme();
	hljsTheme                      = getStoredHljsThemeId(getResolvedScheme());
	currentUser: { login: string; avatar_url?: string } | null = null;
	viewedFiles: Record<string, string>                        = {};
	reviewComments: ReviewComment[]                            = [];
	issueComments: IssueComment[]                              = [];
	pendingComments: PendingComment[]                          = [];
	prNodeId                                                   = '';
	reviewCommentsLoading                                      = false;
	submittingReview                                           = false;
	approvingPr                                                = false;
	mergingPr                                                  = false;
	mergeConfirmOpen                                           = false;
	mergePrError                                               = '';
	titleEditOpen                                              = false;
	titleEditValue                                             = '';
	titleEditError                                             = '';
	updatingTitle                                              = false;
	togglingDraft                                              = false;
	whitespaceViewedConfirmOpen                                = false;
	whitespaceViewedConfirmError                               = '';
	markingWhitespaceViewed                                    = false;
	reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null = null;
	mergeConfirmUnmetRequirements = false;
	closeConfirmOpen              = false;
	closeConfirmError             = '';
	closingPr                     = false;
	approvePrError                = '';
	checkoutStatus: GitWorkspaceStatus | null = null;
	localPrStatus: LocalPrStatus | null       = null;
	checkingOutPr                             = false;
	committingLocalChanges                    = false;
	pushingLocalChanges                       = false;
	mergingDefaultBranch                      = false;
	defaultBranchMergeConfirmOpen             = false;
	defaultBranchMergeError                   = '';
	refreshing                                = false;
	checkoutError                             = '';
	localGitError                             = '';
	localCommitModalOpen                      = false;
	localCommitMessage                        = '';
	localCommitError                          = '';
	commitAndPushRequested                    = false;
	/** When set while the PR Files tab is shown, selects the diff file and focuses the comment thread there. Cleared after the tab handles it. */
	pendingThreadFocus: null | { path: string; line: number; side: 'LEFT' | 'RIGHT'; nonce: number } = null;

	_checksTimer: ReturnType<typeof setInterval> | null = null;
	_unsubColorScheme: (() => void) | null              = null;
	_unsubDiffSettings: (() => void) | null             = null;
	_onDocumentVisibility: (() => void) | null          = null;
	_originalTitle     = '';
	mergePollCancelled = false;
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

	readonly timeAgo = timeAgo;

	@Watch('tabSize')
	onTabSizeChanged(val: number) {
		this.tabSize = setDiffTabSize(val);
	}

	@Watch('diffFontSize')
	onDiffFontSizeChanged(val: number) {
		this.diffFontSize = setDiffFontSize(val);
	}

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
		this.mergePollCancelled = true;
		this.mergingPr          = false;
		this.approvePrError     = '';
		this.mergePrError       = '';
		this.checkoutError      = '';
		this.localGitError      = '';
		this.localPrStatus      = null;
		const parts             = oldKey.split('/');
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

	get reviewPct(): number {
		const total = this.reviewTotal;
		return !total ? 0 : Math.min(100, Math.round((this.reviewedCount / total) * 100));
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

	get localCommitActionDisabled(): boolean {
		return this.committingLocalChanges || this.pushingLocalChanges || !this.localCommitMessage.trim();
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

	/** Show merge for any non-draft PR that is not already merged (GitHub returns an error if merge is not allowed). */
	get showMergePrButton(): boolean {
		return Boolean(this.pr && !this.pr.draft && !this.pr.merged);
	}

	get canToggleDraft(): boolean {
		return Boolean(this.pr && this.pr.state === 'open' && !this.pr.merged);
	}

	/** True when GitHub merge state, review, and checks look ready to merge without warnings. */
	get mergeRequirementsMet(): boolean {
		if (!this.pr || this.pr.draft || this.pr.state !== 'open' || this.pr.merged) {
			return false;
		}
		if (this.reviewDecision !== 'APPROVED') {
			return false;
		}
		if (this.pr.mergeable === false || this.pr.mergeable === null) {
			return false;
		}
		const ms = this.pr.mergeable_state as string | undefined;
		if (ms && ms !== 'clean') {
			return false;
		}
		for (const check of this.checks) {
			const c      = check.conclusion;
			const passed = c === 'success' || c === 'neutral' || c === 'skipped';
			const failed = c === 'failure' || c === 'timed_out' || c === 'cancelled' || c === 'error';
			if (failed || !passed) {
				return false;
			}
		}
		return true;
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
		this._unsubDiffSettings    = subscribeDiffSettings(() => this.syncDiffSettings());
		this._onDocumentVisibility = () => {
			if (document.visibilityState !== 'visible' || this.loading || this.error || !this.pr || this.mergingPr) {
				return;
			}
			void this.refreshPrWhenTabVisible();
		};
		document.addEventListener('visibilitychange', this._onDocumentVisibility);
		this.loadAll();
	}

	beforeUnmount() {
		this.mergePollCancelled = true;
		this._unsubDiffSettings?.();
		this._unsubDiffSettings = null;
		if (this._onDocumentVisibility) {
			document.removeEventListener('visibilitychange', this._onDocumentVisibility);
			this._onDocumentVisibility = null;
		}
		this.persistPendingToStorage();
		this.stopChecksPolling();
		this._unsubColorScheme?.();
		this._unsubColorScheme = null;
		document.title         = this._originalTitle;
	}

	private syncDiffSettings(): void {
		this.tabSize      = getDiffTabSize();
		this.diffFontSize = getDiffFontSize();
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

	/** Pick up merges or other GitHub-side updates when returning to this tab. */
	private async refreshPrWhenTabVisible(): Promise<void> {
		try {
			const [ pr, decision ] = await Promise.all([
				// Force refresh: without it GitHub's 60-second cache can return the pre-push head sha, and every
				// diff read below is keyed off that sha, so the whole tab would refresh back to the old commit.
				GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber, true),
				GitHubClient.fetchPullRequestReviewDecision(this.owner, this.repo, this.prNumber),
			]);
			this.reviewDecision = decision;
			syncPinnedPr(pr);
			void this.refreshCheckoutStatus();
			void this.refreshLocalPrStatus();
			document.title = `#${this.routeBackedPrNumber} ${this.pr.title}`;
		}
		catch (e: any) {
			console.error('Failed to refresh PR when tab became visible:', e);
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/** A worktree parked on the PR branch is free again once merged, so it goes back to its directory-named branch. */
	get worktreeToRestoreOnMerge(): PullRequestCheckoutState | null {
		const checkout = this.checkoutState;
		return !checkout || checkout.isMain || checkout.branch === checkout.label ? null : checkout;
	}

	/** Merging retires the PR branch, so hand the worktree back to its own branch at the latest origin/dev. */
	private async restoreWorktreeAfterMerge(): Promise<void> {
		const checkout = this.worktreeToRestoreOnMerge;
		if (!checkout) {
			return;
		}
		try {
			this.checkoutStatus = await resetWorktreeToNaturalBranch(checkout.path);
		}
		catch (error: any) {
			this.checkoutError = `Merged, but ${checkout.label} could not be restored: ${error.message || 'reset failed'}`;
		}
	}

	/** Restore before reloading so the reloaded checkout status already reflects the freed worktree. */
	private async completeMerge(mergedPr?: any): Promise<void> {
		await this.restoreWorktreeAfterMerge();
		await this.refreshMergedPullRequest(mergedPr);
	}

	/** Reload PR + related data without the full-page loading overlay (e.g. after merge completes). */
	private async refreshMergedPullRequest(mergedPr?: any): Promise<void> {
		try {
			// A payload already in hand is written into the record rather than read back out of GitHub — the
			// view renders from that record, so this is what puts the merged state on screen.
			if (mergedPr) {
				GitHubClient.recordPullRequest(this.owner, this.repo, this.prNumber, mergedPr);
			}
			const [ pr, decision ] = await Promise.all([
				mergedPr || GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber, true),
				GitHubClient.fetchPullRequestReviewDecision(this.owner, this.repo, this.prNumber, true),
			]);
			this.reviewDecision = decision;
			syncPinnedPr(pr);
			document.title = `#${this.routeBackedPrNumber} ${this.pr.title}`;
			const headSha  = pr.head?.sha;
			if (headSha) {
				const restored       = loadPendingReview(this.owner, this.repo, this.prNumber, headSha);
				this.pendingComments = restored ?? [];
			}
			else {
				this.pendingComments = [];
			}
			if (pr.user?.login) {
				await GitHubClient.fetchUserFirstNames([ pr.user.login ]);
			}
			this.loadChecks(true);
			this.loadRepoLabels();
			void this.loadReviewComments(true);
			void this.refreshCheckoutStatus();
			void this.refreshLocalPrStatus();
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

	private async pollUntilMerged(): Promise<void> {
		const deadline = Date.now() + 120_000;
		while (Date.now() < deadline && !this.mergePollCancelled) {
			try {
				const detail = await GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber, true);
				if (this.mergePollCancelled) {
					return;
				}
				if (detail.merged) {
					await this.completeMerge(detail);
					return;
				}
			}
			catch {
				/* Keep polling until deadline */
			}
			await this.delay(2000);
		}
		if (!this.mergePollCancelled) {
			await this.refreshMergedPullRequest();
		}
	}

	/** Apply a definitive result from GitHub's async-merge endpoint. Returns true for a terminal result. */
	private async handleAsyncMergeResult(result: AsyncMergeResult): Promise<boolean> {
		if (result.status === 'merged') {
			await this.completeMerge({
				...this.pr,
				merged    : true,
				merged_at : this.pr?.merged_at || new Date().toISOString(),
				state     : 'closed',
			});
			return true;
		}
		if (result.status === 'failed') {
			this.mergePrError = result.details?.message || 'Merge failed';
			return true;
		}
		if (result.status === 'enqueued') {
			await this.refreshMergedPullRequest();
			return true;
		}
		return false;
	}

	/** Poll the merge request itself: GitHub recommends this endpoint over waiting for the PR record to change. */
	private async pollAsyncMergeResult(uuid: string): Promise<void> {
		const deadline = Date.now() + 120_000;
		while (Date.now() < deadline && !this.mergePollCancelled) {
			try {
				const result = await GitHubClient.fetchAsyncMergeResult(this.owner, this.repo, this.prNumber, uuid);
				if (this.mergePollCancelled || await this.handleAsyncMergeResult(result)) {
					return;
				}
			}
			catch {
				/* Fall back to the next result check while the merge request is still available. */
			}
			await this.delay(1000);
		}
		if (!this.mergePollCancelled) {
			await this.refreshMergedPullRequest();
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
			const [ pr, decision ] = await Promise.all([
				GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber),
				GitHubClient.fetchPullRequestReviewDecision(this.owner, this.repo, this.prNumber),
			]);
			this.reviewDecision = decision;
			syncPinnedPr(pr);
			document.title = `#${this.routeBackedPrNumber} ${this.pr.title}`;
			const headSha  = pr.head?.sha;
			if (headSha) {
				const restored       = loadPendingReview(this.owner, this.repo, this.prNumber, headSha);
				this.pendingComments = restored ?? [];
			}
			else {
				this.pendingComments = [];
			}
			if (pr.user?.login) {
				await GitHubClient.fetchUserFirstNames([ pr.user.login ]);
			}
			this.loading = false;
			this.loadChecks();
			this.loadRepoLabels();
			this.loadReviewComments();
			void this.refreshCheckoutStatus();
			void this.refreshLocalPrStatus();
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
			const [ pr, decision ] = await Promise.all([
				GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber, true),
				GitHubClient.fetchPullRequestReviewDecision(this.owner, this.repo, this.prNumber, true),
			]);
			this.reviewDecision = decision;
			syncPinnedPr(pr);
			document.title = `#${this.routeBackedPrNumber} ${this.pr.title}`;
			const headSha  = pr.head?.sha;
			if (headSha) {
				const restored       = loadPendingReview(this.owner, this.repo, this.prNumber, headSha);
				this.pendingComments = restored ?? [];
			}
			else {
				this.pendingComments = [];
			}
			if (pr.user?.login) {
				await GitHubClient.fetchUserFirstNames([ pr.user.login ]);
			}
			await Promise.all([
				this.loadChecks(true),
				this.loadRepoLabels(true),
				this.loadReviewComments(true),
				this.refreshCheckoutStatus(),
				this.refreshLocalPrStatus(),
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

	async loadChecks(force = false) {
		this.checksLoading = true;
		try {
			this.checks      = await GitHubClient.fetchDetailedChecks(this.owner, this.repo, this.prNumber, force);
			const hasPending = this.checks.some(check => {
				const passed = [ 'success', 'neutral', 'skipped' ].includes(check.conclusion ?? '');
				const failed = [ 'failure', 'timed_out', 'cancelled', 'error' ].includes(check.conclusion ?? '');
				return !passed && !failed;
			});
			if (hasPending) {
				this.startChecksPolling();
			}
		}
		catch {
			this.checks = [];
		}
		finally {
			this.checksLoading = false;
		}
	}

	async refreshCheckoutStatus(): Promise<void> {
		try {
			this.checkoutStatus = await fetchGitWorkspaceStatus();
		}
		catch {
			this.checkoutStatus = null;
		}
		// The Local Files tab is gone once the checkout is, so do not leave it showing.
		if (!this.hasLocalCheckout && this.activeTab === 'local-files') {
			this.switchTab('overview');
		}
	}

	async refreshLocalPrStatus(): Promise<void> {
		const target = checkoutTargetForPr(this.pr);
		if (!target) {
			this.localPrStatus = null;
			return;
		}
		try {
			this.localPrStatus = await fetchLocalPullRequestStatus(target, this.defaultBranch);
		}
		catch {
			this.localPrStatus = null;
		}
	}

	async checkoutPrBranch(worktreePath?: string): Promise<void> {
		if (!this.pr || this.checkingOutPr) {
			return;
		}
		const target = checkoutTargetForPr(this.pr);
		if (!target) {
			this.checkoutError = 'Reload this pull request so branch details are available.';
			return;
		}
		this.checkingOutPr = true;
		this.checkoutError = '';
		try {
			this.checkoutStatus = await checkoutPullRequestBranch(target, worktreePath);
			await this.refreshLocalPrStatus();
		}
		catch (error: any) {
			this.checkoutError = error.message || 'Checkout failed';
			await this.refreshCheckoutStatus();
		}
		finally {
			this.checkingOutPr = false;
		}
	}

	async loadRepoLabels(force = false) {
		try {
			this.repoLabels = await GitHubClient.fetchRepoLabels(this.owner, this.repo, force);
		}
		catch {
			this.repoLabels = [];
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
				void this.refreshLocalPrStatus();
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

	async loadReviewComments(force = false) {
		this.reviewCommentsLoading = true;
		try {
			const [ rRev, rIss ] = await Promise.allSettled([
				GitHubClient.fetchPRReviewComments(this.owner, this.repo, this.prNumber, force),
				GitHubClient.fetchPRIssueComments(this.owner, this.repo, this.prNumber, force),
			]);
			this.reviewComments = rRev.status === 'fulfilled' ? rRev.value : [];
			this.issueComments  = rIss.status === 'fulfilled' ? rIss.value : [];
		}
		finally {
			this.reviewCommentsLoading = false;
		}
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

	openLocalCommitModal() {
		this.localCommitMessage     = '';
		this.localCommitError       = '';
		this.localGitError          = '';
		this.commitAndPushRequested = false;
		this.localCommitModalOpen   = true;
	}

	closeLocalCommitModal() {
		if (this.committingLocalChanges || this.pushingLocalChanges) {
			return;
		}
		this.localCommitModalOpen   = false;
		this.localCommitError       = '';
		this.commitAndPushRequested = false;
	}

	async confirmLocalCommit() {
		this.commitAndPushRequested = false;
		await this.commitLocalChanges();
	}

	async confirmLocalCommitAndPush() {
		this.commitAndPushRequested = true;
		if (await this.commitLocalChanges()) {
			await this.pushLocalChanges();
		}
	}

	private async commitLocalChanges(): Promise<boolean> {
		if (this.committingLocalChanges) {
			return false;
		}
		const target = checkoutTargetForPr(this.pr);
		if (!target) {
			this.localCommitError = 'Reload this pull request so branch details are available.';
			return false;
		}
		const message = this.localCommitMessage.trim();
		if (!message) {
			this.localCommitError = 'Commit message is required.';
			return false;
		}
		this.committingLocalChanges = true;
		this.localCommitError       = '';
		this.localGitError          = '';
		try {
			this.localPrStatus        = await commitLocalPullRequestChanges(target, message, this.defaultBranch);
			this.localCommitModalOpen = false;
			this.localFiles           = [];
			this.localViewedFiles     = {};
			await this.refreshCheckoutStatus();
			return true;
		}
		catch (error: any) {
			this.localCommitError = error.message || 'Could not commit local changes';
			this.localGitError    = this.localCommitError;
			return false;
		}
		finally {
			this.committingLocalChanges = false;
		}
	}

	async pushLocalChanges() {
		if (this.pushingLocalChanges) {
			return;
		}
		const target = checkoutTargetForPr(this.pr);
		if (!target) {
			this.localGitError = 'Reload this pull request so branch details are available.';
			return;
		}
		this.pushingLocalChanges = true;
		this.localGitError       = '';
		try {
			this.localPrStatus = await pushLocalPullRequestChanges(target, this.defaultBranch);
			await Promise.all([
				this.refreshCheckoutStatus(),
				this.loadAll(),
			]);
		}
		catch (error: any) {
			this.localGitError = error.message || 'Could not push local changes';
		}
		finally {
			this.pushingLocalChanges = false;
		}
	}

	get defaultBranch(): string {
		return defaultBranchForPr(this.pr);
	}

	openDefaultBranchMergeConfirm() {
		this.defaultBranchMergeError       = '';
		this.localGitError                 = '';
		this.defaultBranchMergeConfirmOpen = true;
	}

	closeDefaultBranchMergeConfirm() {
		if (this.mergingDefaultBranch) {
			return;
		}
		this.defaultBranchMergeConfirmOpen = false;
		this.defaultBranchMergeError       = '';
	}

	async confirmMergeDefaultBranch() {
		if (this.mergingDefaultBranch) {
			return;
		}
		const target        = checkoutTargetForPr(this.pr);
		const defaultBranch = this.defaultBranch;
		if (!target || !defaultBranch) {
			this.defaultBranchMergeError = 'Reload this pull request so branch details are available.';
			return;
		}
		this.mergingDefaultBranch    = true;
		this.defaultBranchMergeError = '';
		this.localGitError           = '';
		try {
			this.localPrStatus                 = await mergeDefaultBranchIntoPullRequest(target, defaultBranch);
			this.defaultBranchMergeConfirmOpen = false;
			// The merge rewrites the working tree, so the cached local diff and its viewed marks no longer apply.
			this.localFiles       = [];
			this.localViewedFiles = {};
			await this.refreshCheckoutStatus();
		}
		catch (error: any) {
			this.defaultBranchMergeError = error.message || `Could not merge origin/${defaultBranch}`;
			this.localGitError           = this.defaultBranchMergeError;
		}
		finally {
			this.mergingDefaultBranch = false;
		}
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

	startChecksPolling() {
		this.stopChecksPolling();
		this._checksTimer = setInterval(async () => {
			try {
				// Forced: the poll runs faster than the record's TTL, and it exists precisely to find out
				// whether CI has moved — the one thing no version in the store can answer.
				this.checks      = await GitHubClient.fetchDetailedChecks(this.owner, this.repo, this.prNumber, true);
				const hasPending = this.checks.some(c => {
					const con    = c.conclusion;
					const passed = con === 'success' || con === 'neutral' || con === 'skipped';
					const failed = con === 'failure' || con === 'timed_out' || con === 'cancelled' || con === 'error';
					return !passed && !failed;
				});
				if (!hasPending) {
					this.stopChecksPolling();
				}
			}
			catch {
				this.stopChecksPolling();
			}
		}, 10000);
	}

	stopChecksPolling() {
		if (this._checksTimer) {
			clearInterval(this._checksTimer);
			this._checksTimer = null;
		}
	}

	async addLabel(name: string) {
		const fullRepo = `${this.owner}/${this.repo}`;
		try {
			await GitHubClient.addLabel(fullRepo, this.prNumber, name);
			const matched = this.repoLabels.find(l => l.name === name);
			if (matched) {
				this.pr.labels.push({ id : matched.id, name : matched.name, color : matched.color });
			}
		}
		catch (e: any) {
			console.error('Failed to add label:', e);
		}
	}

	async removeLabel(name: string) {
		const fullRepo = `${this.owner}/${this.repo}`;
		try {
			await GitHubClient.removeLabel(fullRepo, this.prNumber, name);
			this.pr.labels = this.pr.labels.filter((l: any) => l.name !== name);
		}
		catch (e: any) {
			console.error('Failed to remove label:', e);
		}
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

	onCommentsUpdated() {
		// A comment mutation the store could not fold in itself — a submitted review adds several at once —
		// so this read is forced past the record's TTL rather than trusting its age.
		void this.loadReviewComments(true);
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
			await this.loadReviewComments(true);
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

	async approvePr() {
		if (this.approvingPr || !this.pr?.head?.sha) {
			return;
		}
		this.approvingPr    = true;
		this.approvePrError = '';
		const fullRepo      = `${this.owner}/${this.repo}`;
		try {
			await GitHubClient.submitReview(this.owner, this.repo, this.prNumber, this.pr.head.sha, [], 'APPROVE');
			const labelsToRemove = ((this.pr.labels || []) as { name: string }[])
				.filter(l => typeof l.name === 'string' && TEAM_REQUESTED_LABEL.test(l.name));
			for (const l of labelsToRemove) {
				try {
					await GitHubClient.removeLabel(fullRepo, this.prNumber, l.name);
					this.pr.labels = (this.pr.labels || []).filter((x: any) => x.name !== l.name);
				}
				catch (e: any) {
					console.error('Failed to remove label after approve:', e);
				}
			}
			const hasReadyToMergeLabel = (this.pr.labels || []).some(
				(x: any) => typeof x.name === 'string' && x.name.toLowerCase() === READY_TO_MERGE_LABEL
			);
			if (!hasReadyToMergeLabel) {
				try {
					const readyName
						= this.repoLabels.find(lab => lab.name.toLowerCase() === READY_TO_MERGE_LABEL)?.name ?? READY_TO_MERGE_LABEL;
					await GitHubClient.addLabel(fullRepo, this.prNumber, readyName);
				}
				catch (e: any) {
					console.error('Failed to add ready to merge label:', e);
				}
			}
			try {
				const refreshed = await GitHubClient.fetchPRDetail(this.owner, this.repo, this.prNumber);
				this.pr.labels  = refreshed.labels ?? this.pr.labels;
			}
			catch (e: any) {
				console.error('Failed to refresh PR labels after approve:', e);
			}
			this.reviewDecision = await GitHubClient.fetchPullRequestReviewDecision(this.owner, this.repo, this.prNumber);
		}
		catch (e: any) {
			console.error('Failed to approve PR:', e);
			this.approvePrError = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : 'Failed to approve pull request';
		}
		finally {
			this.approvingPr = false;
		}
	}

	dismissApproveError() {
		this.approvePrError = '';
	}

	dismissMergeError() {
		this.mergePrError = '';
	}

	openMergeConfirm() {
		if (this.mergingPr || !this.pr) {
			return;
		}
		this.mergePrError                  = '';
		this.mergeConfirmUnmetRequirements = !this.mergeRequirementsMet;
		this.mergeConfirmOpen              = true;
	}

	closeMergeConfirm() {
		if (this.mergingPr) {
			return;
		}
		this.mergeConfirmOpen              = false;
		this.mergeConfirmUnmetRequirements = false;
	}

	openCloseConfirm() {
		if (this.closingPr || !this.pr || this.pr.merged || this.pr.state !== 'open') {
			return;
		}
		this.closeConfirmError = '';
		this.closeConfirmOpen  = true;
	}

	closeCloseConfirm() {
		if (this.closingPr) {
			return;
		}
		this.closeConfirmOpen  = false;
		this.closeConfirmError = '';
	}

	async confirmClosePr() {
		if (this.closingPr || !this.pr) {
			return;
		}
		this.closeConfirmError = '';
		this.closingPr         = true;
		try {
			await GitHubClient.updatePullRequest(this.owner, this.repo, this.prNumber, { state : 'closed' });
			this.closeConfirmOpen = false;
			await this.loadAll();
		}
		catch (e: any) {
			console.error('Failed to close PR:', e);
			this.closeConfirmError = e.message || 'Failed to close pull request';
		}
		finally {
			this.closingPr = false;
		}
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
		if (!this.pr) {
			return;
		}
		this.titleEditValue = this.pr.title || '';
		this.titleEditError = '';
		this.titleEditOpen  = true;
	}

	closeTitleEdit() {
		if (this.updatingTitle) {
			return;
		}
		this.titleEditOpen  = false;
		this.titleEditError = '';
	}

	async saveTitleEdit() {
		if (!this.pr || this.updatingTitle) {
			return;
		}
		const next = this.titleEditValue.trim();
		if (!next) {
			this.titleEditError = 'Title cannot be empty.';
			return;
		}
		if (next === this.pr.title) {
			this.closeTitleEdit();
			return;
		}
		this.titleEditError = '';
		this.updatingTitle  = true;
		try {
			const updated      = await GitHubClient.updatePullRequest(this.owner, this.repo, this.prNumber, { title : next });
			this.pr.title      = updated.title ?? next;
			document.title     = `#${this.routeBackedPrNumber} ${this.pr.title}`;
			this.titleEditOpen = false;
		}
		catch (e: any) {
			this.titleEditError = e.message || 'Failed to update title';
		}
		finally {
			this.updatingTitle = false;
		}
	}

	async togglePrDraft() {
		if (!this.pr || !this.canToggleDraft || this.togglingDraft) {
			return;
		}
		const pullRequestId = this.prNodeId || this.pr.node_id;
		if (!pullRequestId) {
			console.error('Missing pull request node id for draft toggle');
			return;
		}
		this.togglingDraft = true;
		try {
			const updated = await GitHubClient.setPullRequestDraft(pullRequestId, !this.pr.draft, this.prLocation);
			this.pr.draft = updated.draft;
		}
		catch (e: any) {
			console.error('Failed to update draft state:', e);
		}
		finally {
			this.togglingDraft = false;
		}
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

	async confirmMergePr() {
		if (this.mergingPr || !this.pr) {
			return;
		}
		this.mergePrError = '';
		this.mergingPr    = true;
		let mergeResult: AsyncMergeResult;
		try {
			mergeResult = await GitHubClient.mergePullRequestSquash(this.owner, this.repo, this.prNumber);
		}
		catch (e: any) {
			console.error('Failed to merge PR:', e);
			this.mergePrError     = typeof e?.message === 'string' && e.message.trim() ? e.message.trim() : 'Merge failed';
			this.mergeConfirmOpen = false;
			this.mergingPr        = false;
			return;
		}
		this.mergeConfirmOpen   = false;
		this.mergePollCancelled = false;
		try {
			if (await this.handleAsyncMergeResult(mergeResult)) {
				return;
			}
			const uuid = mergeResult.status === 'pending' ? mergeResult.details?.uuid : undefined;
			if (uuid) {
				await this.pollAsyncMergeResult(uuid);
			}
			else {
				await this.pollUntilMerged();
			}
		}
		finally {
			this.mergingPr = false;
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

.pr-local-commit-modal {
	width: min(440px, calc(100vw - 32px));
}

.pr-local-commit-input {
	width: 100%;
	min-height: 96px;
	padding: 8px 10px;
	resize: vertical;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-primary);
	font-family: inherit;
	line-height: 1.45;
}

.pr-local-commit-input:focus {
	outline: none;
	border-color: var(--focus-ring);
	box-shadow: 0 0 0 1px var(--focus-ring);
}

.pr-local-commit-error {
	color: var(--accent-red);
}

.pr-local-commit-actions {
	margin-top: 18px;
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
