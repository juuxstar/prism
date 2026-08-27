<template>
	<app-header
		:user="user"
		:repos="repos"
		:current-repo="currentRepo"
		:current-type-filter="currentTypeFilter"
		:selected-team="selectedTeam"
		:refreshing="refreshing"
		@set-type-filter="setTypeFilter"
		@set-repo="setRepo"
		@set-team="setTeam"
		@refresh="handleRefresh"
		@logout="handleLogout"
	/>
	<github-status-banner
		v-if="currentScreen === 'pr'"
		:visible="githubStatusVisible"
		:message="githubStatusMessage"
		:level="githubStatusLevel"
		@dismiss="dismissGithubStatus"
	/>
	<rate-limit-banner :visible="rateLimitVisible" :message="rateLimitMessage" @dismiss="dismissRateLimit" />
	<auth-screen v-if="currentScreen === 'auth'" :disabled="loginDisabled" @login="handleLogin" />
	<device-screen v-if="currentScreen === 'device'" :code="deviceCode" :url="deviceUrl" @cancel="handleCancelAuth" />
	<loading-screen v-if="currentScreen === 'loading'" />
	<pr-board
		v-if="currentScreen === 'pr'"
		:all-prs="allPRs"
		:current-type-filter="currentTypeFilter"
		:current-repo="currentRepo"
		:selected-team="selectedTeam"
		:async-version="dataVersion"
		:branches="branches"
		:user="user"
		:checkout-status="checkoutStatus"
		:checkout-status-loading="checkoutStatusLoading"
		:worktree-prs="worktreePRs"
		@create-pr="handleCreatePR"
		@api-error="handleBoardApiError"
		@show-error="showError"
		@prs-changed="handlePRsChanged"
		@open-pr="openPrOverlay"
		@checkout-status-changed="updateCheckoutStatus"
	/>
	<error-screen v-if="currentScreen === 'error'" :message="errorMessage" @retry="handleRetry" />
	<Transition name="pr-detail-slide">
		<div v-if="selectedOverlayPr" class="pr-detail-slide-over u-fixed u-inset-0">
			<pr-detail-view
				:key="overlayPrKey"
				:owner="selectedOverlayPr.owner"
				:repo="selectedOverlayPr.repo"
				:number="String(selectedOverlayPr.number)"
				tab="overview"
				embedded
				@close="closePrOverlay"
				@logout="handleLogout"
			/>
		</div>
	</Transition>
</template>

<script lang="ts">
import { cancelPolling, clearToken, getStoredToken, pollForToken, startDeviceFlow, storeToken } from '@/lib/api/auth';
import type { GitWorkspaceStatus }       from '@/lib/api/gitCheckoutClient';
import { checkoutMatchesPullRequest, fetchGitWorkspaceStatus } from '@/lib/api/gitCheckoutClient';
import type { AccessibleRepo, ApiError } from '@/lib/api/githubClient';
import GitHubClient                      from '@/lib/api/githubClient';
import { fetchGithubDashboardStatus, type GithubStatusBannerLevel }                             from '@/lib/githubStatus';

import { defineAsyncComponent }  from 'vue';
import { Component, Vue, Watch } from 'vue-facing-decorator';

interface OverlayPr { owner: string; repo: string; number: number }
const PrDetailView = defineAsyncComponent(() => import('@/components/screens/PrDetailView.vue'));

// Check state is the only thing that moves while a board sits open. It is polled as one batched request that
// backs off while nothing changes, so a long CI queue cannot drain the hourly GraphQL budget on its own.
const CHECKS_POLL_BASE_MS = 30 * 1000;
const CHECKS_POLL_MAX_MS  = 5 * 60 * 1000;

/** Dashboard root — manages auth, data fetching, polling, and screen navigation. */
@Component({ components : { PrDetailView } })
export default class App extends Vue {

	currentScreen                              = 'auth';
	currentTypeFilter                          = 'ready';
	currentRepo                                = localStorage.getItem('selectedRepo') || '';
	selectedTeam                               = [ 'alpha', 'beta', 'gamma' ].includes(localStorage.getItem('selectedTeam')!) ? localStorage.getItem('selectedTeam')! : 'alpha';
	allPRs: any[]                              = [];
	accessibleRepos: AccessibleRepo[]          = [];
	user: any                                  = null;
	errorMessage                               = '';
	deviceCode                                 = '';
	deviceUrl                                  = '';
	rateLimitVisible                           = false;
	rateLimitMessage                           = '';
	githubStatusVisible                        = false;
	githubStatusMessage                        = '';
	githubStatusLevel: GithubStatusBannerLevel = 'warning';
	branches: any[]                           = [];
	refreshing                                = false;
	loginDisabled                             = false;
	dataVersion                               = 0;
	selectedOverlayPr: OverlayPr | null       = null;
	checkoutStatus: GitWorkspaceStatus | null = null;
	checkoutStatusLoading                     = false;
	worktreePRs: any[]                        = [];

	private _rateLimitTimer: ReturnType<typeof setTimeout> | null = null;
	private _checksTimer: ReturnType<typeof setTimeout> | null    = null;
	private _checksPollDelay   = CHECKS_POLL_BASE_MS;
	private _cardDataPending   = false;
	private _worktreePrRequest = 0;
	private _githubStatusTimer: ReturnType<typeof setInterval> | null = null;
	private _githubStatusDismissedFingerprint: string | null          = null;
	private _lastGithubStatusFingerprint: string                      = '';
	get repos(): string[] {
		const set = new Set<string>();
		this.accessibleRepos.forEach(repo => {
			set.add(repo.fullName);
		});
		this.allPRs.forEach(pr => {
			const m = pr.repository_url.match(/repos\/([^/]+\/[^/]+)/);
			if (m) {
				set.add(m[1]);
			}
		});
		return [ ...set ].sort((a, b) => a.localeCompare(b));
	}

	get overlayPrKey(): string {
		const pr = this.selectedOverlayPr;
		return pr ? `${pr.owner}/${pr.repo}/${pr.number}` : '';
	}

	@Watch('repos')
	onReposChange(newRepos: string[]) {
		if (this.currentRepo && !newRepos.includes(this.currentRepo)) {
			this.currentRepo = '';
			localStorage.removeItem('selectedRepo');
		}
	}

	@Watch('currentTypeFilter')
	onTypeFilterChange() {
		// Switching to Draft or Worktrees reveals data that was not worth fetching under the previous filter.
		if (this.currentScreen === 'pr') {
			this.fetchAsyncData();
		}
	}

	mounted() {
		this.init();
	}

	beforeUnmount() {
		this.stopChecksPolling();
		this.stopGithubStatusPolling();
	}

	// ── Screen management ──────────────────────────────────

	showScreen(name: string) {
		this.currentScreen = name;
	}

	showError(msg: string | Error | any) {
		this.errorMessage = typeof msg === 'string' ? msg : msg.message || 'Something went wrong';
		this.stopGithubStatusPolling();
		this.showScreen('error');
	}

	// ── Rate limit ─────────────────────────────────────────

	showRateLimitBanner(error: ApiError) {
		let msg = 'GitHub API rate limit exceeded.';
		if (error.rateLimitReset) {
			const resetMs = error.rateLimitReset.getTime() - Date.now();
			if (resetMs > 0) {
				const mins  = Math.ceil(resetMs / 60000);
				msg        += ` Resets in ${mins} minute${mins === 1 ? '' : 's'}.`;
			}
		}
		this.rateLimitMessage = msg;
		this.rateLimitVisible = true;
		if (this._rateLimitTimer) {
			clearTimeout(this._rateLimitTimer);
		}
		this._rateLimitTimer = setTimeout(() => {
			this.rateLimitVisible = false;
		}, 60000);
	}

	dismissRateLimit() {
		this.rateLimitVisible = false;
		if (this._rateLimitTimer) {
			clearTimeout(this._rateLimitTimer);
		}
	}

	// ── GitHub.com status (githubstatus.com) ─────────────

	dismissGithubStatus() {
		this.githubStatusVisible               = false;
		this._githubStatusDismissedFingerprint = this._lastGithubStatusFingerprint;
	}

	private async refreshGithubStatus() {
		if (this.currentScreen !== 'pr') {
			return;
		}
		try {
			const result = await fetchGithubDashboardStatus();
			if (!result.showBanner) {
				this.githubStatusVisible = false;
				return;
			}
			if (result.fingerprint === this._githubStatusDismissedFingerprint) {
				this.githubStatusVisible = false;
				return;
			}
			this._lastGithubStatusFingerprint = result.fingerprint;
			this.githubStatusMessage          = result.message;
			this.githubStatusLevel            = result.level;
			this.githubStatusVisible          = true;
		}
		catch {
			// Public status request failed — omit banner; dashboard still works.
		}
	}

	private startGithubStatusPolling() {
		this.stopGithubStatusPolling();
		this._githubStatusTimer = setInterval(() => {
			this.refreshGithubStatus();
		}, 5 * 60 * 1000);
	}

	private stopGithubStatusPolling() {
		if (this._githubStatusTimer) {
			clearInterval(this._githubStatusTimer);
			this._githubStatusTimer = null;
		}
	}

	// ── API error handling ─────────────────────────────────

	isRateLimitError(error: any): boolean {
		return error.rateLimitReset || error.message?.includes('rate limit');
	}

	async handleApiError(error: any): Promise<boolean> {
		if (this.isRateLimitError(error)) {
			this.showRateLimitBanner(error);
			return true;
		}
		if (error.status === 401) {
			clearToken();
			this.user = null;
			this.showScreen('auth');
			return true;
		}
		return false;
	}

	handleAsyncError(error: any) {
		if (this.isRateLimitError(error)) {
			this.showRateLimitBanner(error);
		}
	}

	// ── Filter changes ─────────────────────────────────────

	setTypeFilter(type: string) {
		this.currentTypeFilter = type;
	}

	setRepo(repo: string) {
		this.currentRepo = repo;
		if (repo) {
			localStorage.setItem('selectedRepo', repo);
		}
		else {
			localStorage.removeItem('selectedRepo');
		}
		this.fetchAndRenderBranches();
	}

	setTeam(team: string) {
		this.selectedTeam = team;
		localStorage.setItem('selectedTeam', team);
	}

	// ── Auth: Device Flow ──────────────────────────────────

	async handleLogin() {
		this.loginDisabled = true;
		try {
			const response  = await startDeviceFlow();
			this.deviceCode = response.user_code;
			this.deviceUrl  = response.verification_uri;
			this.showScreen('device');

			const token = await pollForToken(response.device_code, response.interval, response.expires_in);
			storeToken(token);
			GitHubClient.setToken(token);
			await this.loadData();
		}
		catch (error: any) {
			this.loginDisabled = false;
			if (error.message !== 'Authentication cancelled') {
				this.showError(error.message);
			}
			else {
				this.showScreen('auth');
			}
		}
	}

	async handleCancelAuth() {
		cancelPolling();
		this.loginDisabled = false;
		this.showScreen('auth');
	}

	// ── Logout ─────────────────────────────────────────────

	handleLogout() {
		this.selectedOverlayPr = null;
		this.stopChecksPolling();
		this.stopGithubStatusPolling();
		this._githubStatusDismissedFingerprint = null;
		this._lastGithubStatusFingerprint      = '';
		this.githubStatusVisible               = false;
		clearToken();
		GitHubClient.clear();
		this.allPRs          = [];
		this.accessibleRepos = [];
		this.user            = null;
		this.branches        = [];
		this.showScreen('auth');
	}

	// ── Refresh ────────────────────────────────────────────

	async handleRefresh() {
		this.stopChecksPolling();
		this.refreshing = true;
		try {
			GitHubClient.clearAsyncCaches();
			await this.fetchPRs(this.currentRepo);
			this.dataVersion++;
			void this.refreshCheckoutStatus();
			await this.fetchAndRenderBranches();
			this.refreshGithubStatus();
			await this.fetchAsyncData();
		}
		catch (error: any) {
			const handled = await this.handleApiError(error);
			if (!handled) {
				this.showError(error.message);
			}
		}
		finally {
			this.refreshing = false;
		}
	}

	// ── Data loading ───────────────────────────────────────

	async fetchPRs(repo?: string) {
		if (repo) {
			const repoPRs     = await GitHubClient.fetchRepoPRs(repo);
			const existingIds = new Set(repoPRs.map((pr: any) => pr.id));
			this.allPRs       = [
				...repoPRs,
				...this.allPRs.filter(pr => {
					const m = pr.repository_url.match(/repos\/([^/]+\/[^/]+)/);
					return !existingIds.has(pr.id) && m && m[1] !== repo;
				}),
			];
		}
		else {
			this.allPRs = await GitHubClient.fetchAllAccessiblePRs(this.accessibleRepos);
		}
		const logins = [ ...new Set(this.allPRs.map(pr => pr.user.login)) ];
		await GitHubClient.fetchUserFirstNames(logins);
	}

	/**
	 * The PRs whose cards the current filter actually renders. Per-card GitHub data is only worth fetching for
	 * these: the Ready board hides drafts, the Draft board shows nothing else, and the Worktrees panel matches
	 * against non-draft PRs.
	 */
	getVisiblePRs(): any[] {
		const wantDrafts = this.currentTypeFilter === 'draft';
		return this.allPRs.filter(pr => {
			if (Boolean(pr.draft) !== wantDrafts) {
				return false;
			}
			if (!this.currentRepo) {
				return true;
			}
			const m = pr.repository_url.match(/repos\/([^/]+\/[^/]+)/);
			return m && m[1] === this.currentRepo;
		});
	}

	fetchAsyncData(): Promise<void> {
		this._cardDataPending = true;
		return GitHubClient.fetchPrCardData(this.getVisiblePRs())
			.then(() => {
				this.dataVersion++;
				if (this.getPRsNeedingCheckRefresh().length > 0) {
					this.startChecksPolling();
				}
			})
			.catch(e => this.handleAsyncError(e))
			.finally(() => {
				this._cardDataPending = false;
				// Card data backfills the head/base refs that worktree-to-PR matching needs.
				void this.refreshWorktreePullRequests();
			});
	}

	// ── Checks polling ─────────────────────────────────────

	isMergeLabeled(pr: any): boolean {
		const hasL = (name: string) => pr.labels?.some((l: any) => l.name.toLowerCase() === name.toLowerCase());
		return hasL('ready to merge');
	}

	getPRsNeedingCheckRefresh(): any[] {
		return this.allPRs.filter(pr => {
			const checks = GitHubClient.getChecks(pr.id);
			if (!checks) {
				return false;
			}
			if (checks.pending > 0) {
				return true;
			}
			return this.isMergeLabeled(pr) && (checks.failed > 0 || checks.pending > 0) ? true : false;
		});
	}

	startChecksPolling() {
		this.stopChecksPolling();
		this._checksPollDelay = CHECKS_POLL_BASE_MS;
		this.scheduleChecksPoll();
	}

	private scheduleChecksPoll() {
		this._checksTimer = setTimeout(() => {
			void this.pollChecks();
		}, this._checksPollDelay);
	}

	private async pollChecks() {
		this._checksTimer = null;
		const needRefresh = this.getPRsNeedingCheckRefresh();
		if (needRefresh.length === 0) {
			return;
		}

		try {
			const changed = await GitHubClient.refreshChecks(needRefresh);
			this.dataVersion++;
			this._checksPollDelay = changed ? CHECKS_POLL_BASE_MS : Math.min(this._checksPollDelay * 2, CHECKS_POLL_MAX_MS);
		}
		catch (error: any) {
			this.handleAsyncError(error);
			if (error.rateLimitReset) {
				return;
			}
			this._checksPollDelay = Math.min(this._checksPollDelay * 2, CHECKS_POLL_MAX_MS);
		}

		if (this.getPRsNeedingCheckRefresh().length > 0) {
			this.scheduleChecksPoll();
		}
	}

	stopChecksPolling() {
		if (this._checksTimer) {
			clearTimeout(this._checksTimer);
			this._checksTimer = null;
		}
	}

	/** Local git state, read from this app's own server — no GitHub quota involved. */
	async refreshCheckoutStatus() {
		this.checkoutStatusLoading = true;
		try {
			this.checkoutStatus = await fetchGitWorkspaceStatus();
			await this.refreshWorktreePullRequests();
		}
		catch {
			this.checkoutStatus = null;
			this.worktreePRs    = [];
		}
		finally {
			this.checkoutStatusLoading = false;
			this.dataVersion++;
		}
	}

	updateCheckoutStatus(status: GitWorkspaceStatus): void {
		this.checkoutStatus = status;
		void this.refreshWorktreePullRequests();
	}

	/**
	 * Resolve pull requests for local worktrees whose branch no PR on the board already accounts for — usually
	 * because the PR is closed or merged. This is the only search-API work the dashboard does outside the PR
	 * listing itself, and the search quota is a separate 30-per-minute budget, so it stays idle until the
	 * Worktrees panel is actually open.
	 */
	private async refreshWorktreePullRequests(): Promise<void> {
		// Claim this run up front so a slower run already in flight cannot overwrite its result.
		const request   = ++this._worktreePrRequest;
		const checkouts = this.checkoutStatus?.checkouts || [];
		if (this.currentTypeFilter !== 'worktrees' || !checkouts.length) {
			this.worktreePRs = [];
			return;
		}

		// Matching relies on head refs that arrive with the card data. Running before those land would treat
		// every checkout as unmatched and spend search requests on a result the follow-up run discards.
		if (this._cardDataPending) {
			return;
		}

		const unmatched = checkouts.filter(checkout => !this.allPRs.some(pr => checkoutMatchesPullRequest(checkout, pr)));
		if (!unmatched.length) {
			this.worktreePRs = [];
			return;
		}

		try {
			const pullRequests = await GitHubClient.fetchWorktreePullRequests(unmatched);
			if (request === this._worktreePrRequest) {
				this.worktreePRs = pullRequests;
			}
		}
		catch (error) {
			if (request === this._worktreePrRequest) {
				this.worktreePRs = [];
			}
			this.handleAsyncError(error);
		}
	}

	// ── Create PR ──────────────────────────────────────────

	async fetchAndRenderBranches() {
		if (!this.currentRepo) {
			this.branches = [];
			return;
		}
		try {
			this.branches = await GitHubClient.fetchBranchesWithoutPRs(this.currentRepo);
		}
		catch (error: any) {
			const handled = await this.handleApiError(error);
			if (!handled) {
				this.branches = [];
			}
		}
	}

	async handleCreatePR({ branch, title }: { branch: string; title: string }) {
		if (!title || !this.currentRepo) {
			return;
		}
		try {
			await GitHubClient.createPR(this.currentRepo, branch, 'dev', title, [ 'α: review requested' ]);
			await this.handleRefresh();
			this.fetchAndRenderBranches();
		}
		catch (error: any) {
			const handled = await this.handleApiError(error);
			if (!handled) {
				this.showError(`Failed to create PR: ${error.message}`);
			}
		}
	}

	// ── Board events ───────────────────────────────────────

	async handleBoardApiError(error: any) {
		const handled = await this.handleApiError(error);
		if (!handled) {
			this.showError(`Failed to move PR: ${error.message}`);
		}
	}

	handlePRsChanged() {
		this.dataVersion++;
	}

	openPrOverlay(pr: OverlayPr) {
		this.selectedOverlayPr = pr;
	}

	closePrOverlay() {
		this.selectedOverlayPr = null;
	}

	// ── Retry ──────────────────────────────────────────────

	handleRetry() {
		if (GitHubClient.getToken()) {
			this.loadData();
		}
		else {
			this.showScreen('auth');
		}
	}

	// ── Main init ──────────────────────────────────────────

	async loadData() {
		this.showScreen('loading');
		try {
			await GitHubClient.fetchCurrentUser();
			if (!GitHubClient.hasOAuthScope('repo')) {
				clearToken();
				GitHubClient.clear();
				this.loginDisabled = false;
				this.showError('GitHub needs the repo scope to list private repositories and write pull request changes, comments, and PR state. Please sign in again and approve the updated permissions.');
				return;
			}
			this.user            = GitHubClient.getUser();
			this.accessibleRepos = await GitHubClient.fetchAccessibleRepos();
			await this.fetchPRs(this.currentRepo || undefined);
			this.showScreen('pr');
			void this.refreshCheckoutStatus();
			this.fetchAsyncData();
			this.fetchAndRenderBranches();
			this.refreshGithubStatus();
			this.startGithubStatusPolling();
		}
		catch (error: any) {
			const handled = await this.handleApiError(error);
			if (!handled) {
				this.showError(error.message);
			}
		}
	}

	async init() {
		const token = getStoredToken();
		if (token) {
			GitHubClient.setToken(token);
			await this.loadData();
		}
		else {
			this.showScreen('auth');
		}
	}

}
</script>

<style>
.pr-detail-slide-over {
	z-index: 1000;
	background: var(--bg-primary);
	box-shadow: -24px 0 48px rgba(0, 0, 0, 0.28);
}

.pr-detail-slide-enter-active,
.pr-detail-slide-leave-active {
	transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
	will-change: transform;
}

.pr-detail-slide-enter-from,
.pr-detail-slide-leave-to {
	transform: translateX(100%);
}

.pr-detail-slide-enter-to,
.pr-detail-slide-leave-from {
	transform: translateX(0);
}

@media (prefers-reduced-motion: reduce) {
	.pr-detail-slide-enter-active,
	.pr-detail-slide-leave-active {
		transition-duration: 1ms;
	}
}
</style>
