import type { BlobTarget }                  from '@/lib/store/blobCache';
import { clearBlobs, peekBlob, storeBlob }  from '@/lib/store/blobCache';
import type { ReviewDecision, ViewedState } from '@/lib/store/prStore';
import {
	clearStores, detailedChecks, issueComments, mergeBases, prBotCounts, prChecks, prDetails, prFiles, prKey, prMergeability, prStats, repoKey,
	repoLabels, reviewComments, reviewDecision, viewedState
} from '@/lib/store/prStore';

// GraphQL field aliases let one request resolve many pull requests at once. 20 keeps a batch inside GitHub's
// node-count budget while cutting the per-card request count by the same factor.
const PER_PAGE                 = 100;
const PR_CARD_BATCH_SIZE       = 20;
const USER_NAME_BATCH_SIZE     = 50;
const REVIEW_THREAD_LIMIT      = 50;
const CHECK_CONTEXT_LIMIT      = 100;
const RECENT_BRANCH_LIMIT      = 30;
const WORKTREE_PR_DETAIL_LIMIT = 5;
const PROTECTED_BRANCH_NAMES   = new Set([ 'dev', 'main', 'master' ]);
const CURSOR_BOT               = /^cursor\b/i;

/**
 * Fetch options for every read the entity store backs.
 *
 * GitHub serves its REST responses with `max-age=60`, and the browser cache that honours it is keyed by URL
 * and age — which is exactly what let a reader who pushed a commit and hit Refresh see the previous diff.
 * Freshness is the store's job now, so the browser cache is taken out of the loop entirely (`no-store`) and
 * shared caches are told to revalidate (`no-cache`) rather than answer from their own copy. What replaces
 * them is the `If-None-Match` this sends alongside: GitHub does not charge rate limit for a 304.
 */
const STORE_FETCH_OPTIONS = { cache : 'no-store' as RequestCache, headers : { 'Cache-Control' : 'no-cache' } };

const CHECK_ROLLUP_SELECTION = `
	commits(last: 1) {
		nodes { commit { statusCheckRollup { contexts(first: ${CHECK_CONTEXT_LIMIT}) {
			nodes { ... on CheckRun { conclusion status startedAt completedAt } ... on StatusContext { state createdAt } }
		} } } }
	}
`;

/** Everything a board card renders, in one selection set: size stats, conflict state, checks and bot reviews. */
const PR_CARD_FRAGMENT = `
	fragment PrCardFields on PullRequest {
		additions
		deletions
		changedFiles
		mergeable
		headRefName
		headRefOid
		headRepository { nameWithOwner }
		baseRefName
		baseRefOid
		baseRepository { nameWithOwner }
		reviewThreads(first: ${REVIEW_THREAD_LIMIT}) {
			nodes { isResolved comments(first: 1) { nodes { author { login } body } } }
		}
		${CHECK_ROLLUP_SELECTION}
	}
`;

/** Poll-sized subset of PR_CARD_FRAGMENT — check state is the only thing that moves while a board sits open. */
const PR_CHECKS_FRAGMENT = `
	fragment PrCardFields on PullRequest {
		${CHECK_ROLLUP_SELECTION}
	}
`;

/**
 * The pinned strip's poll. It follows PRs no board on screen is listing, so alongside the rollup it reads the
 * little of the pull request itself that decides whether the pin should still be there at all.
 */
const PINNED_PR_FRAGMENT = `
	fragment PrCardFields on PullRequest {
		title
		merged
		${CHECK_ROLLUP_SELECTION}
	}
`;

class GitHubAPI {

	private token: string | null = null;
	private user: any            = null;
	private apiBase              = '/api/github';
	private graphqlUrl           = '/api/github/graphql';
	private userNameCache        = new Map<string, string>();
	private worktreePrCache      = new Map<string, any | null>();
	private oauthScopes          = new Set<string>();

	setToken(t: string) {
		this.token = t;
	}

	getToken() {
		return this.token;
	}

	private getAuthHeader() {
		if (!this.token) {
			throw apiError('Session expired. Please sign in again.', { status : 401 });
		}
		return `Bearer ${this.token}`;
	}

	getUser() {
		return this.user;
	}

	hasOAuthScope(scope: string) {
		return this.oauthScopes.has(scope);
	}

	/**
	 * Sign-out. This is the one moment that really does invalidate everything — a different account may not
	 * even be able to see what the last one read. Refreshes no longer come through here: they revalidate the
	 * records in place, which is what keeps the screen from emptying while they run.
	 */
	clear() {
		this.token = null;
		this.user  = null;
		this.oauthScopes.clear();
		this.userNameCache.clear();
		this.worktreePrCache.clear();
		clearStores();
		clearBlobs();
	}

	// ─── Core Fetch ───────────────────────────────────────

	private async apiFetch(endpoint: string, options: any = {}): Promise<any> {
		return (await this.apiRequest(endpoint, options)).json();
	}

	/**
	 * A conditional read for the entity store: replay the ETag of the record already held so GitHub can answer
	 * 304 — free of rate limit — when the bytes have not moved. Returns the response body only when they have.
	 */
	private async apiFetchConditional(endpoint: string, etag: string | null, extraHeaders: Record<string, string> = {}): Promise<ConditionalResult> {
		const response = await this.apiRequest(endpoint, {
			...STORE_FETCH_OPTIONS,
			headers : {
				...STORE_FETCH_OPTIONS.headers,
				...extraHeaders,
				...(etag ? { 'If-None-Match' : etag } : {}),
			},
		});
		if (response.status === 304) {
			return { notModified : true, etag };
		}
		return { data : await response.json(), etag : response.headers.get('etag') };
	}

	private async apiRequest(endpoint: string, options: any = {}): Promise<Response> {
		const { headers: extraHeaders, ...restOptions } = options;
		const response = await fetch(`${this.apiBase}${endpoint}`, {
			...restOptions,
			headers : {
				Authorization : this.getAuthHeader(),
				Accept        : 'application/vnd.github.v3+json',
				...extraHeaders,
			},
		});

		// Not an error and not a body: the caller asked conditionally and already holds what it wanted.
		if (response.status === 304) {
			return response;
		}

		if (!response.ok) {
			if (response.status === 401) {
				this.clear();
				throw apiError('Session expired. Please sign in again.', { status : 401 });
			}
			const resetHeader = response.headers.get('x-ratelimit-reset');
			const retryAfter  = response.headers.get('retry-after');
			if (response.status === 403 || response.status === 429) {
				const remaining = response.headers.get('x-ratelimit-remaining');
				if (remaining === '0' || response.status === 429 || retryAfter) {
					const resetTime = rateLimitResetFromHeaders(resetHeader, retryAfter);
					throw apiError('GitHub API rate limit exceeded', { status : response.status, rateLimitReset : resetTime });
				}
			}
			const body = await response.json().catch(() => ({}) as any);
			if (
				(response.status === 403 || response.status === 429)
				&& typeof body.message === 'string'
				&& body.message.toLowerCase().includes('rate limit')
			) {
				throw apiError('GitHub API rate limit exceeded', {
					status         : response.status,
					rateLimitReset : resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : null,
				});
			}
			throw apiError(formatGithubRestErrorMessage(response.status, body), { status : response.status });
		}

		const scopes = response.headers.get('x-oauth-scopes');
		if (scopes) {
			this.oauthScopes = new Set(scopes.split(',').map(scope => scope.trim()).filter(Boolean));
		}

		return response;
	}

	private async apiFetchArrayBuffer(endpoint: string): Promise<ArrayBuffer> {
		const response = await fetch(`${this.apiBase}${endpoint}`, {
			headers : {
				Authorization : this.getAuthHeader(),
				Accept        : 'application/vnd.github.v3+json',
			},
		});
		if (!response.ok) {
			throw apiError(`GitHub API error: ${response.status}`, { status : response.status });
		}
		return response.arrayBuffer();
	}

	private async graphql(query: string, variables: Record<string, any> = {}, options: { allowPartial?: boolean } = {}): Promise<any> {
		const response = await fetch(this.graphqlUrl, {
			method  : 'POST',
			headers : {
				'Authorization' : this.getAuthHeader(),
				'Content-Type'  : 'application/json',
			},
			body : JSON.stringify({ query, variables }),
		});

		const resetHeader = response.headers.get('x-ratelimit-reset');
		const retryAfter  = response.headers.get('retry-after');

		if (!response.ok) {
			if (response.status === 401) {
				this.clear();
				throw apiError('Session expired. Please sign in again.', { status : 401 });
			}
			if (response.status === 403 || response.status === 429) {
				const remaining = response.headers.get('x-ratelimit-remaining');
				if (remaining === '0' || response.status === 429 || retryAfter) {
					const resetTime = rateLimitResetFromHeaders(resetHeader, retryAfter);
					throw apiError('GitHub API rate limit exceeded', { status : response.status, rateLimitReset : resetTime });
				}
				const body = await response.json().catch(() => ({}) as any);
				if (body.message?.toLowerCase().includes('rate limit')) {
					throw apiError('GitHub API rate limit exceeded', {
						status         : response.status,
						rateLimitReset : resetHeader ? new Date(parseInt(resetHeader, 10) * 1000) : null,
					});
				}
			}
			throw apiError(`GitHub GraphQL error: ${response.status}`, { status : response.status });
		}

		const json = await response.json();
		if (json.errors) {
			const firstError  = json.errors[0];
			const msg: string = firstError.message;
			if (firstError.type === 'RATE_LIMIT' || msg.toLowerCase().includes('rate limit')) {
				const resetTime = rateLimitResetFromHeaders(resetHeader, retryAfter);
				throw apiError('GitHub API rate limit exceeded', { rateLimitReset : resetTime });
			}
			// Batched queries alias many independent lookups into one request, so a single unreadable repository
			// or missing account must not discard the rest of the batch alongside it.
			if (!(options.allowPartial && json.data)) {
				throw apiError(msg);
			}
		}
		return json.data;
	}

	// ─── Search with Pagination ───────────────────────────

	private async searchPRs(query: string): Promise<any[]> {
		let allItems: any[] = [];
		let page            = 1;
		const perPage       = 100;

		while (true) {
			const data  = await this.apiFetch(`/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}&page=${page}`);
			const items = data.items || [];
			allItems    = allItems.concat(items);
			if (items.length < perPage || allItems.length >= data.total_count || allItems.length >= 1000) {
				break;
			}
			page++;
		}
		return allItems;
	}

	private async fetchAllPages(endpoint: string, options: any = {}): Promise<any[]> {
		let allItems: any[] = [];
		let page            = 1;

		while (true) {
			const items = await this.apiFetch(pagedEndpoint(endpoint, page), options);
			allItems    = allItems.concat(items);
			if (items.length < PER_PAGE) {
				break;
			}
			page++;
		}
		return allItems;
	}

	/**
	 * A conditional list read. GitHub gives each page its own ETag, and a pull request's files or comments
	 * almost always fit in one page, so the common case is settled by a single 304 that costs no rate limit.
	 *
	 * A list that spans pages is refetched in full once the first page has moved: reassembling a list whose
	 * pages partly answered 304 would mean keeping each page's slice alongside the record, and the offsets
	 * still shift the moment any page changes length. Not worth the bookkeeping for the rare large PR.
	 */
	private async fetchAllPagesConditional(endpoint: string, etag: string | null): Promise<ConditionalResult> {
		const first = await this.apiFetchConditional(pagedEndpoint(endpoint, 1), etag);
		if (first.notModified) {
			return first;
		}

		let allItems: any[] = first.data || [];
		let page            = 1;
		while (allItems.length >= PER_PAGE * page) {
			page++;
			const items = await this.apiFetch(pagedEndpoint(endpoint, page), STORE_FETCH_OPTIONS);
			allItems    = allItems.concat(items);
			if (items.length < PER_PAGE) {
				break;
			}
		}

		// Only a list with room to spare on its one page can be revalidated by that page's ETag alone. A full
		// page means the next entry lands on page two, which the first page's tag would never notice.
		return { data : allItems, etag : allItems.length < PER_PAGE ? first.etag : null };
	}

	// ─── Public API ───────────────────────────────────────

	async fetchCurrentUser() {
		this.user = await this.apiFetch('/user');
		return this.user;
	}

	async fetchUserOrgs() {
		try {
			return await this.fetchAllPages('/user/orgs');
		}
		catch (error: any) {
			if (error.status === 403 && error.message?.toLowerCase().includes('read:org')) {
				return [];
			}
			throw error;
		}
	}

	async fetchAccessibleRepos(): Promise<AccessibleRepo[]> {
		const repos = await this.fetchAllPages('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated');
		return repos
			.map((repo: any) => ({
				fullName   : repo.full_name as string,
				ownerLogin : repo.owner?.login as string,
				ownerType  : repo.owner?.type as string,
			}))
			.filter((repo: AccessibleRepo) => repo.fullName && repo.ownerLogin)
			.sort((a: AccessibleRepo, b: AccessibleRepo) => a.fullName.localeCompare(b.fullName));
	}

	async fetchAllAccessiblePRs(repos: AccessibleRepo[] = []) {
		const orgs     = await this.fetchUserOrgs();
		const querySet = new Set<string>([ `type:pr state:open user:${this.user.login}` ]);
		for (const org of orgs) {
			querySet.add(`type:pr state:open org:${org.login}`);
		}
		for (const repo of repos) {
			if (repo.ownerType === 'Organization') {
				querySet.add(`type:pr state:open org:${repo.ownerLogin}`);
			}
			else if (repo.ownerLogin !== this.user.login) {
				querySet.add(`type:pr state:open user:${repo.ownerLogin}`);
			}
		}

		const queries       = [ ...querySet ];
		const results       = await Promise.all(queries.map(q => this.searchPRs(q)));
		const seen          = new Set<number>();
		const merged: any[] = [];
		for (const items of results) {
			for (const pr of items) {
				if (!seen.has(pr.id)) {
					seen.add(pr.id);
					merged.push(pr);
				}
			}
		}
		merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
		return merged;
	}

	async fetchRepoPRs(repoFullName: string) {
		const items = await this.searchPRs(`type:pr state:open repo:${repoFullName}`);
		items.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
		return items;
	}

	/**
	 * Find the pull request associated with each checked-out worktree branch. This runs against the search API,
	 * whose 30-requests-per-minute budget is separate from (and far smaller than) the main REST allowance, so
	 * the work is deliberately serialised rather than fanned out. Callers should pass only the checkouts they
	 * could not already match against a loaded PR.
	 */
	async fetchWorktreePullRequests(checkouts: WorktreeCheckoutTarget[]): Promise<any[]> {
		const pullRequests: any[] = [];
		for (const checkout of checkouts) {
			const pullRequest = await this.fetchWorktreePullRequest(checkout);
			if (pullRequest) {
				pullRequests.push(pullRequest);
			}
		}
		return pullRequests;
	}

	private async fetchWorktreePullRequest(checkout: WorktreeCheckoutTarget): Promise<any | null> {
		const branch = checkout.branch;
		const repos  = [ ...new Set(checkout.remoteRepos.map(repo => repo.toLowerCase())) ];
		if (!branch || branch === 'HEAD' || repos.length === 0) {
			return null;
		}

		const cacheKey = `${repos.join(',')}:${branch}`;
		if (this.worktreePrCache.has(cacheKey)) {
			return this.worktreePrCache.get(cacheKey) || null;
		}

		// Omitting a `state:` qualifier matches open and closed PRs in one query rather than two.
		const queries           = repos.flatMap(baseRepo => repos.map(headRepo => `type:pr repo:${baseRepo} head:${headRepo.split('/')[0]}:${branch}`));
		const candidates: any[] = [];
		for (const query of queries) {
			const items = await this.searchPRs(query).catch(() => [] as any[]);
			for (const pr of items) {
				if (!candidates.some(candidate => candidate.id === pr.id)) {
					candidates.push(pr);
				}
			}
		}
		candidates.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

		// The search already constrained `head:`, so the newest candidate is almost always the answer; confirm
		// it with a detail read and only walk further if the head ref does not line up.
		let pullRequest: any = null;
		for (const candidate of candidates.slice(0, WORKTREE_PR_DETAIL_LIMIT)) {
			const match = candidate.repository_url?.match(/repos\/([^/]+)\/([^/]+)/);
			if (!match || !Number.isInteger(candidate.number)) {
				continue;
			}
			const detail = await this.fetchPRDetail(match[1], match[2], candidate.number).catch(() => null);
			if (detail?.head?.ref === branch) {
				pullRequest = detail;
				break;
			}
		}

		this.worktreePrCache.set(cacheKey, pullRequest);
		return pullRequest;
	}

	/**
	 * Fetch everything a board card needs — size stats, mergeability, check rollup and unresolved bot review
	 * counts — for a set of PRs. GraphQL field aliases let a single request cover PR_CARD_BATCH_SIZE pull
	 * requests, so a board of N PRs costs ceil(N / PR_CARD_BATCH_SIZE) requests rather than the 3N REST and
	 * GraphQL calls this replaces. Also backfills `head`/`base` on each PR, which search results omit.
	 */
	async fetchPrCardData(prs: any[]) {
		// A card is refetched when its record is missing *or* describes an older version of the pull request.
		// The version check is what the old caches could not do: they held whatever they were first told until
		// something cleared them all, so a PR that moved kept showing the stats it had when the board loaded.
		const toFetch = prs.filter(pr => {
			const key     = cardKey(pr.id);
			const version = cardVersion(pr);
			return (
				!prStats.peekAt(key, version)
				|| !prChecks.peekAt(key, version)
				|| !prBotCounts.peekAt(key, version)
				|| !pr.head
				|| !pr.base
			);
		});

		for (const batch of chunk(toFetch, PR_CARD_BATCH_SIZE)) {
			const nodes = await this.fetchPullRequestNodes(batch, PR_CARD_FRAGMENT);
			for (const { pr, node } of nodes) {
				const key  = cardKey(pr.id);
				const meta = { version : cardVersion(pr) };
				prStats.set(key, {
					changedFiles : node.changedFiles ?? 0,
					additions    : node.additions ?? 0,
					deletions    : node.deletions ?? 0,
				}, meta);
				prMergeability.set(key, mergeabilityFromGraphql(node.mergeable), meta);
				prChecks.set(key, checksSummaryFromPullRequest(node), meta);
				prBotCounts.set(key, botCountsFromReviewThreads(node.reviewThreads?.nodes), meta);

				const head = refDescriptor(node.headRepository, node.headRefName, node.headRefOid);
				const base = refDescriptor(node.baseRepository, node.baseRefName, node.baseRefOid);
				if (head) {
					pr.head = head;
				}
				if (base) {
					pr.base = base;
				}
			}
		}
	}

	/**
	 * Re-read only the check rollup for the given PRs, bypassing the cache. Used by dashboard polling, which
	 * needs a much cheaper query than the full card payload. Resolves to true when any summary actually moved,
	 * so the caller can back its polling interval off while nothing is changing.
	 */
	async refreshChecks(prs: any[]): Promise<boolean> {
		let changed = false;

		for (const batch of chunk(prs, PR_CARD_BATCH_SIZE)) {
			const nodes = await this.fetchPullRequestNodes(batch, PR_CHECKS_FRAGMENT);
			for (const { pr, node } of nodes) {
				const key    = cardKey(pr.id);
				const checks = checksSummaryFromPullRequest(node);
				if (checksSummariesDiffer(prChecks.peek(key)?.data, checks)) {
					changed = true;
				}
				// Checks move with CI rather than with the pull request, so the poll writes them in directly:
				// there is no version to read them back at, which is why this store is written, never `read`.
				prChecks.set(key, checks, { version : cardVersion(pr) });
			}
		}

		return changed;
	}

	/**
	 * The pinned strip's poll, for pull requests the current view never listed — it follows PRs across repos and
	 * across the board/detail split. Shares `refreshChecks`' batching and cache, keyed by the same PR id, and
	 * additionally reports each PR's title and whether it has been merged.
	 */
	async refreshPinnedPullRequests(targets: PullRequestTarget[]): Promise<PinnedPullRequestState[]> {
		const prs = targets.map(target => ({
			id             : target.id,
			number         : target.number,
			repository_url : `https://api.github.com/repos/${target.owner}/${target.repo}`,
		}));

		const states: PinnedPullRequestState[] = [];
		for (const batch of chunk(prs, PR_CARD_BATCH_SIZE)) {
			const nodes = await this.fetchPullRequestNodes(batch, PINNED_PR_FRAGMENT);
			for (const { pr, node } of nodes) {
				const key    = cardKey(pr.id);
				const held   = prChecks.peek(key);
				const checks = checksSummaryFromPullRequest(node);
				states.push({
					id            : pr.id,
					title         : node.title || '',
					merged        : Boolean(node.merged),
					checksChanged : checksSummariesDiffer(held?.data, checks),
				});
				// The pinned poll reads no pull request fields it could version this by, so it keeps whatever
				// version the record already carried rather than resetting it and forcing a board refetch.
				prChecks.set(key, checks, { version : held?.version ?? '' });
			}
		}

		return states;
	}

	/**
	 * Resolve one batch of PRs through a single aliased GraphQL request. Partial responses are tolerated: a PR
	 * whose repository is no longer readable drops out of the result instead of failing its whole batch.
	 */
	private async fetchPullRequestNodes(prs: any[], fragment: string): Promise<{ pr: any; node: any }[]> {
		const targets = prs
			.map(pr => ({ pr, ...parseRepositoryUrl(pr.repository_url) }))
			.filter((target): target is { pr: any; owner: string; repo: string } => Boolean(target.owner && target.repo && Number.isInteger(target.pr.number)));
		if (!targets.length) {
			return [];
		}

		const declarations: string[]         = [];
		const selections: string[]           = [];
		const variables: Record<string, any> = {};
		targets.forEach((target, index) => {
			declarations.push(`$owner${index}: String!, $repo${index}: String!, $number${index}: Int!`);
			selections.push(`pr${index}: repository(owner: $owner${index}, name: $repo${index}) { pullRequest(number: $number${index}) { ...PrCardFields } }`);
			variables[`owner${index}`]  = target.owner;
			variables[`repo${index}`]   = target.repo;
			variables[`number${index}`] = target.pr.number;
		});

		const query = `query(${declarations.join(', ')}) {\n${selections.join('\n')}\n}\n${fragment}`;
		const data  = await this.graphql(query, variables, { allowPartial : true });

		const resolved: { pr: any; node: any }[] = [];
		targets.forEach((target, index) => {
			const node = data?.[`pr${index}`]?.pullRequest;
			if (node) {
				resolved.push({ pr : target.pr, node });
			}
		});
		return resolved;
	}

	// Reactive reads: these go through the store, so a card rerenders when its record is written rather than
	// when something remembers to bump a counter past it.

	getBotComments(prId: number): BotCounts | null {
		return prBotCounts.peek(cardKey(prId))?.data ?? null;
	}

	getPRStats(prId: number): PRStats | null {
		return prStats.peek(cardKey(prId))?.data ?? null;
	}

	getPRMergeability(prId: number): PRMergeability | null {
		return prMergeability.peek(cardKey(prId))?.data ?? null;
	}

	getChecks(prId: number): ChecksSummary | null {
		return prChecks.peek(cardKey(prId))?.data ?? null;
	}

	/** Resolve display names for PR authors. One aliased GraphQL request replaces one REST call per login. */
	async fetchUserFirstNames(logins: string[]) {
		const unique = [ ...new Set(logins) ].filter(login => login && !this.userNameCache.has(login));

		for (const batch of chunk(unique, USER_NAME_BATCH_SIZE)) {
			const declarations = batch.map((_login, index) => `$login${index}: String!`);
			const selections   = batch.map((_login, index) => `user${index}: user(login: $login${index}) { login name }`);
			const variables    = Object.fromEntries(batch.map((login, index) => [ `login${index}`, login ]));
			const query        = `query(${declarations.join(', ')}) {\n${selections.join('\n')}\n}`;

			// Bot accounts (`dependabot[bot]` and friends) are not Users and error out individually; a partial
			// response still carries every real profile in the batch.
			const data = await this.graphql(query, variables, { allowPartial : true }).catch(() => null);
			batch.forEach((login, index) => {
				const profile   = data?.[`user${index}`];
				const firstName = ((profile?.name || profile?.login || login) as string).split(/\s+/)[0];
				this.userNameCache.set(login, firstName);
			});
		}
	}

	getFirstName(login: string): string {
		return this.userNameCache.get(login) || login;
	}

	async addLabel(repo: string, issueNumber: number, label: string) {
		return this.apiFetch(`/repos/${repo}/issues/${issueNumber}/labels`, {
			method : 'POST',
			body   : JSON.stringify({ labels : [ label ] }),
		});
	}

	async removeLabel(repo: string, issueNumber: number, label: string) {
		try {
			await this.apiFetch(`/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`, { method : 'DELETE' });
		}
		catch (e: any) {
			if (!e.message.includes('404')) {
				throw e;
			}
		}
	}

	/**
	 * Branches pushed in the last hour that have no open PR yet — the candidates offered in the create-PR box.
	 * A single GraphQL query returns each branch already ordered by commit date, with its commit message and the
	 * repository's open PR head refs. The REST equivalent needed a branch listing, one commit read per branch
	 * (up to 100) and a paginated PR listing; it also silently ignored `sort=updated`, which that endpoint does
	 * not support, so it paid for 100 commit reads just to discover which branches were recent.
	 */
	async fetchBranchesWithoutPRs(repo: string): Promise<BranchInfo[]> {
		const [ owner, name ] = repo.split('/');
		if (!owner || !name) {
			return [];
		}

		const QUERY = `
			query($owner: String!, $name: String!) {
				repository(owner: $owner, name: $name) {
					refs(refPrefix: "refs/heads/", orderBy: { field: TAG_COMMIT_DATE, direction: DESC }, first: ${RECENT_BRANCH_LIMIT}) {
						nodes { name target { ... on Commit { committedDate messageHeadline } } }
					}
					pullRequests(states: OPEN, first: 100) {
						nodes { headRefName headRepository { nameWithOwner } }
					}
				}
			}
		`;

		const data       = await this.graphql(QUERY, { owner, name });
		const repository = data?.repository;
		const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
		const prHeads    = new Set(
			(repository?.pullRequests?.nodes || [])
				.filter((pr: any) => pr.headRepository?.nameWithOwner?.toLowerCase() === repo.toLowerCase())
				.map((pr: any) => pr.headRefName as string)
		);

		return (repository?.refs?.nodes || [])
			.map((ref: any) => ({
				name    : ref.name as string,
				date    : new Date(ref.target?.committedDate),
				message : (ref.target?.messageHeadline || '') as string,
			}))
			.filter((branch: BranchInfo) => (
				!Number.isNaN(branch.date.getTime())
				&& branch.date >= oneHourAgo
				&& !PROTECTED_BRANCH_NAMES.has(branch.name)
				&& !prHeads.has(branch.name)
			));
	}

	/**
	 * The pull request itself. Its version is its own `updated_at`, which can only be learned by reading it,
	 * so this is one of the few records whose freshness is a TTL — backed by an ETag, so the read that finds
	 * nothing has changed costs a 304 and no rate limit. `forceRefresh` revalidates regardless of age; it is
	 * how merge completion is polled for, and the record keeps its data until the new one arrives.
	 */
	async fetchPRDetail(owner: string, repo: string, number: number, forceRefresh = false): Promise<any> {
		return prDetails.read({
			key   : prKey(owner, repo, number),
			force : forceRefresh,
			fetch : async previous => {
				const result = await this.apiFetchConditional(
					`/repos/${owner}/${repo}/pulls/${number}`,
					previous?.etag ?? null,
					{ Accept : 'application/vnd.github.v3.full+json' }
				);
				if (result.notModified) {
					return result;
				}
				const pr = normalizePullRequest(result.data);
				return { data : pr, etag : result.etag, version : String(pr.updated_at ?? '') };
			},
		});
	}

	/** GitHub aggregate review state: APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED or null. */
	async fetchPullRequestReviewDecision(owner: string, repo: string, number: number, forceRefresh = false): Promise<ReviewDecision> {
		return reviewDecision.read({
			key   : prKey(owner, repo, number),
			force : forceRefresh,
			fetch : async () => ({ data : await this.readReviewDecision(owner, repo, number) }),
		});
	}

	private async readReviewDecision(owner: string, repo: string, number: number): Promise<ReviewDecision> {
		const QUERY = `
	  query($owner: String!, $repo: String!, $number: Int!) {
		repository(owner: $owner, name: $repo) {
		  pullRequest(number: $number) {
			reviewDecision
		  }
		}
	  }`;
		try {
			const data = await this.graphql(QUERY, { owner, repo, number });
			const rd   = data.repository?.pullRequest?.reviewDecision;
			return rd === 'APPROVED' || rd === 'CHANGES_REQUESTED' || rd === 'REVIEW_REQUIRED' ? rd : null;
		}
		catch {
			return null;
		}
	}

	/**
	 * Request a squash merge through GitHub's asynchronous endpoint.
	 *
	 * This endpoint is required for stacked pull requests and also supports ordinary
	 * pull requests. A pending result includes a UUID that should be polled through
	 * GitHub's dedicated async-merge result endpoint.
	 */
	async mergePullRequestSquash(owner: string, repo: string, number: number): Promise<AsyncMergeResult> {
		const response = await fetch(`${this.apiBase}/repos/${owner}/${repo}/pulls/${number}/merge-async`, {
			method  : 'PUT',
			headers : {
				'Authorization' : this.getAuthHeader(),
				'Accept'        : 'application/vnd.github+json',
				'Content-Type'  : 'application/json',
			},
			body : JSON.stringify({ merge_method : 'squash', merge_action : 'default' }),
		});
		const body = await response.json().catch(() => ({}) as any);
		if (!response.ok && response.status !== 409) {
			if (response.status === 401) {
				this.clear();
				throw apiError('Session expired. Please sign in again.', { status : 401 });
			}
			throw apiError(formatGithubRestErrorMessage(response.status, body), { status : response.status });
		}
		return body;
	}

	/** Get the current result of an accepted asynchronous pull-request merge. */
	async fetchAsyncMergeResult(owner: string, repo: string, number: number, uuid: string): Promise<AsyncMergeResult> {
		return this.apiFetch(`/repos/${owner}/${repo}/pulls/${number}/merge-async/${encodeURIComponent(uuid)}?prism_refresh=${Date.now()}`, {
			cache   : 'no-store',
			headers : {
				'Accept'        : 'application/vnd.github+json',
				'Cache-Control' : 'no-cache',
			},
		});
	}

	/** PATCH pull request (title, state, etc.). Returns updated PR JSON. Draft changes use `setPullRequestDraft`. */
	async updatePullRequest(owner: string, repo: string, number: number, patch: { title?: string; state?: 'open' | 'closed' }): Promise<any> {
		const response = await fetch(`${this.apiBase}/repos/${owner}/${repo}/pulls/${number}`, {
			method  : 'PATCH',
			headers : {
				'Authorization' : this.getAuthHeader(),
				'Accept'        : 'application/vnd.github.v3+json',
				'Content-Type'  : 'application/json',
			},
			body : JSON.stringify(patch),
		});
		const body = await response.json().catch(() => ({}) as any);
		if (!response.ok) {
			if (response.status === 401) {
				this.clear();
				throw apiError('Session expired. Please sign in again.', { status : 401 });
			}
			const msg = typeof body.message === 'string' ? body.message : `GitHub API error: ${response.status}`;
			throw apiError(msg, { status : response.status });
		}
		// PATCH returns the whole updated pull request, so the record is updated from it rather than refetched.
		this.mergePrDetail(owner, repo, number, normalizePullRequest(body));
		return body;
	}

	/**
	 * Record a full pull request payload the app already holds — the response to a merge, for instance — so
	 * every view reading that record sees it without anyone going back to GitHub for what is already known.
	 */
	recordPullRequest(owner: string, repo: string, number: number, pr: any): void {
		const normalized = normalizePullRequest(pr);
		const key        = prKey(owner, repo, number);
		if (prDetails.peek(key)) {
			this.mergePrDetail(owner, repo, number, normalized);
			return;
		}
		prDetails.set(key, normalized, { version : String(normalized.updated_at ?? '') });
	}

	/**
	 * Fold a mutation's own result into the pull request record. Merged rather than replaced: the detail read
	 * asks for `v3.full+json` and the mutation endpoints do not, so a wholesale overwrite would drop the
	 * rendered fields that only the richer response carries.
	 */
	private mergePrDetail(owner: string, repo: string, number: number, fields: Record<string, any>): void {
		const key    = prKey(owner, repo, number);
		const record = prDetails.peek(key);
		if (!record) {
			return;
		}
		const merged = { ...record.data, ...fields };
		prDetails.set(key, merged, { version : String(merged.updated_at ?? record.version) });
	}

	/** Toggle draft state via GraphQL (REST PATCH does not support draft transitions). */
	async setPullRequestDraft(pullRequestId: string, draft: boolean, target?: PullRequestLocation): Promise<{ draft: boolean }> {
		const MUTATION = draft
			? `
	  mutation($pullRequestId: ID!) {
		convertPullRequestToDraft(input: { pullRequestId: $pullRequestId }) {
		  pullRequest { isDraft }
		}
	  }`
			: `
	  mutation($pullRequestId: ID!) {
		markPullRequestReadyForReview(input: { pullRequestId: $pullRequestId }) {
		  pullRequest { isDraft }
		}
	  }`;
		const data    = await this.graphql(MUTATION, { pullRequestId });
		const key     = draft ? 'convertPullRequestToDraft' : 'markPullRequestReadyForReview';
		const isDraft = Boolean(data[key]?.pullRequest?.isDraft);
		if (target) {
			this.mergePrDetail(target.owner, target.repo, target.number, { draft : isDraft });
		}
		return { draft : isDraft };
	}

	/**
	 * The changed-file list, versioned by the two commits the diff is computed from. Re-reading a pull request
	 * whose head has not moved returns the list already held without a request; a push changes the version and
	 * the list is refetched, which is the only thing that should have to be.
	 */
	async fetchPRFiles(owner: string, repo: string, number: number, version: string, forceRefresh = false): Promise<PRFile[]> {
		return prFiles.read({
			key   : prKey(owner, repo, number),
			version,
			force : forceRefresh,
			fetch : previous => this.fetchAllPagesConditional(`/repos/${owner}/${repo}/pulls/${number}/files`, previous?.etag ?? null),
		});
	}

	async fetchFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
		return this.readBlob({ owner, repo, path, ref, encoding : 'text' }, async () => {
			const data = await this.apiFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
			return utf8FromBase64(data.content.replace(/\n/g, ''));
		});
	}

	/**
	 * File contents are read through the blob cache, which is addressed by the commit they belong to and so
	 * can never be stale. A push invalidates the file list; every file that commit did not touch still has
	 * the same content at the same path, and is served from memory rather than fetched again.
	 */
	private async readBlob(target: BlobTarget, fetcher: () => Promise<string>): Promise<string> {
		const held = peekBlob(target);
		if (held !== undefined) {
			return held;
		}
		const content = await fetcher();
		storeBlob(target, content);
		return content;
	}

	/**
	 * The commit a pull request's diff is really computed against. `base.sha` is the base branch's own tip,
	 * which drifts as that branch moves, so a file the pull request deletes can be missing there already —
	 * the merge base always has it.
	 */
	async fetchMergeBaseSha(owner: string, repo: string, base: string, head: string): Promise<string> {
		// The merge base of two commits never changes, so this is keyed by the pair and needs no version.
		return mergeBases.read({
			key   : `${repoKey(owner, repo)}:${base}...${head}`,
			fetch : async () => {
				const data = await this.apiFetch(`/repos/${owner}/${repo}/compare/${base}...${head}`, STORE_FETCH_OPTIONS);
				const sha  = data?.merge_base_commit?.sha;
				return { data : typeof sha === 'string' ? sha : '' };
			},
		});
	}

	async fetchFileContentBase64(owner: string, repo: string, path: string, ref: string): Promise<string> {
		return this.readBlob({ owner, repo, path, ref, encoding : 'base64' }, async () => {
			const data = await this.apiFetch(`/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`);
			return data.content.replace(/\n/g, '');
		});
	}

	async fetchDetailedChecks(owner: string, repo: string, number: number, forceRefresh = false): Promise<CheckRunDetail[]> {
		return detailedChecks.read({
			key   : prKey(owner, repo, number),
			force : forceRefresh,
			fetch : async () => ({ data : await this.readDetailedChecks(owner, repo, number) }),
		});
	}

	private async readDetailedChecks(owner: string, repo: string, number: number): Promise<CheckRunDetail[]> {
		const QUERY = `
	  query($owner: String!, $repo: String!, $number: Int!) {
		repository(owner: $owner, name: $repo) {
		  pullRequest(number: $number) {
			commits(last: 1) {
			  nodes {
				commit {
				  statusCheckRollup {
					contexts(first: 100) {
					  nodes {
						... on CheckRun {
						  name
						  status
						  conclusion
						  detailsUrl
						  startedAt
						  completedAt
						  annotations(first: 50) {
							nodes {
							  path
							  message
							  title
							  annotationLevel
							  location { start { line } end { line } }
							}
						  }
						}
						... on StatusContext {
						  context
						  state
						  targetUrl
						}
					  }
					}
				  }
				}
			  }
			}
		  }
		}
	  }`;

		const data    = await this.graphql(QUERY, { owner, repo, number });
		const commits = data.repository.pullRequest.commits.nodes;
		if (!commits.length) {
			return [];
		}

		const contexts = commits[0].commit.statusCheckRollup?.contexts?.nodes || [];
		return contexts.map((ctx: any) => {
			if (ctx.name !== undefined) {
				const annotations: CheckAnnotation[] = (ctx.annotations?.nodes || []).map((a: any) => ({
					path      : a.path,
					message   : a.message,
					title     : a.title || null,
					level     : (a.annotationLevel || '').toLowerCase(),
					startLine : a.location?.start?.line ?? 0,
					endLine   : a.location?.end?.line ?? 0,
				}));
				return {
					name        : ctx.name,
					status      : (ctx.status || '').toLowerCase(),
					conclusion  : ctx.conclusion ? ctx.conclusion.toLowerCase() : null,
					url         : ctx.detailsUrl || null,
					startedAt   : ctx.startedAt || null,
					completedAt : ctx.completedAt || null,
					annotations,
				};
			}
			return {
				name        : ctx.context || 'Status check',
				status      : 'completed',
				conclusion  : ctx.state ? ctx.state.toLowerCase() : null,
				url         : ctx.targetUrl || null,
				startedAt   : null,
				completedAt : null,
				annotations : [],
			};
		});
	}

	async fetchTestFailures(owner: string, repo: string, check: CheckRunDetail): Promise<TestFailure[]> {
		const workflowRunId = check.url?.match(/\/actions\/runs\/(\d+)/)?.[1];
		if (!workflowRunId) {
			return [];
		}

		const artifactList = await this.apiFetch(`/repos/${owner}/${repo}/actions/runs/${workflowRunId}/artifacts`);
		const artifact     = artifactList.artifacts?.find((item: any) => item.name === `prism-test-failures-${check.name}` && !item.expired);
		if (!artifact) {
			return [];
		}

		const archive = await this.apiFetchArrayBuffer(`/repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`);
		const jsonl   = await readZipTextFile(archive, 'test-failures.jsonl');
		return jsonl
			.split('\n')
			.filter(Boolean)
			.map(line => parseTestFailure(line))
			.filter((failure): failure is TestFailure => failure !== null);
	}

	async fetchRepoLabels(owner: string, repo: string, forceRefresh = false): Promise<RepoLabel[]> {
		return repoLabels.read({
			key   : repoKey(owner, repo),
			force : forceRefresh,
			fetch : async previous => {
				const result = await this.fetchAllPagesConditional(`/repos/${owner}/${repo}/labels`, previous?.etag ?? null);
				if (result.notModified) {
					return result;
				}
				const labels = (result.data as any[]).map(l => ({ id : l.id, name : l.name, color : l.color, description : l.description }));
				return { data : labels, etag : result.etag };
			},
		});
	}

	/**
	 * Viewed marks, versioned by the head commit they were recorded against — GitHub resets a file to unviewed
	 * when a new commit touches it, so the marks and the commit belong together.
	 */
	async fetchPRFilesViewedState(owner: string, repo: string, number: number, version?: string, forceRefresh = false): Promise<ViewedState> {
		return viewedState.read({
			key   : prKey(owner, repo, number),
			version,
			force : forceRefresh,
			fetch : async () => ({ data : await this.readViewedState(owner, repo, number) }),
		});
	}

	private async readViewedState(owner: string, repo: string, number: number): Promise<ViewedState> {
		const QUERY = `
	  query($owner: String!, $repo: String!, $number: Int!, $cursor: String) {
		repository(owner: $owner, name: $repo) {
		  pullRequest(number: $number) {
			id
			files(first: 100, after: $cursor) {
			  pageInfo {
				hasNextPage
				endCursor
			  }
			  nodes {
				path
				viewerViewedState
			  }
			}
		  }
		}
	  }`;

		const viewedFiles: Record<string, string> = {};
		let prNodeId              = '';
		let cursor: string | null = null;

		while (true) {
			const data = await this.graphql(QUERY, { owner, repo, number, cursor });
			const pr   = data.repository.pullRequest;
			if (!pr) {
				break;
			}
			prNodeId   = pr.id;
			const conn = pr.files;
			for (const file of conn.nodes || []) {
				if (file.path) {
					viewedFiles[file.path] = file.viewerViewedState;
				}
			}
			if (!conn.pageInfo?.hasNextPage) {
				break;
			}
			cursor = conn.pageInfo.endCursor || null;
			if (!cursor) {
				break;
			}
		}

		return { viewedFiles, prNodeId };
	}

	async markFileAsViewed(pullRequestId: string, path: string, target?: PullRequestLocation): Promise<void> {
		const MUTATION = `
	  mutation($pullRequestId: ID!, $path: String!) {
		markFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
		  clientMutationId
		}
	  }`;
		await this.graphql(MUTATION, { pullRequestId, path });
		this.recordViewedState(target, path, 'VIEWED');
	}

	async unmarkFileAsViewed(pullRequestId: string, path: string, target?: PullRequestLocation): Promise<void> {
		const MUTATION = `
	  mutation($pullRequestId: ID!, $path: String!) {
		unmarkFileAsViewed(input: { pullRequestId: $pullRequestId, path: $path }) {
		  clientMutationId
		}
	  }`;
		await this.graphql(MUTATION, { pullRequestId, path });
		this.recordViewedState(target, path, 'UNVIEWED');
	}

	private recordViewedState(target: PullRequestLocation | undefined, path: string, state: string): void {
		if (!target) {
			return;
		}
		viewedState.patch(prKey(target.owner, target.repo, target.number), held => ({
			...held,
			viewedFiles : { ...held.viewedFiles, [path] : state },
		}));
	}

	async createPR(repo: string, head: string, base: string, title: string, labels: string[] = []) {
		const pr = await this.apiFetch(`/repos/${repo}/pulls`, {
			method : 'POST',
			body   : JSON.stringify({ title, head, base, draft : false }),
		});
		if (labels.length > 0) {
			await this.addLabel(repo, pr.number, labels[0]);
		}
		return pr;
	}

	// ─── Review Comments ───────────────────────────────────

	/** Maps REST review comment database id → thread resolve state and GraphQL thread node id. */
	private async fetchReviewCommentThreadMeta(owner: string, repo: string, number: number): Promise<Map<number, { isResolved: boolean; threadNodeId: string }>> {
		const map   = new Map<number, { isResolved: boolean; threadNodeId: string }>();
		const QUERY = `
	  query($owner: String!, $repo: String!, $number: Int!) {
		repository(owner: $owner, name: $repo) {
		  pullRequest(number: $number) {
			reviewThreads(first: 100) {
			  nodes {
				id
				isResolved
				comments(first: 100) {
				  nodes { databaseId }
				}
			  }
			}
		  }
		}
	  }`;
		try {
			const data    = await this.graphql(QUERY, { owner, repo, number });
			const threads = data.repository?.pullRequest?.reviewThreads?.nodes || [];
			for (const t of threads) {
				const resolved     = !!t.isResolved;
				const threadNodeId = typeof t.id === 'string' ? t.id : '';
				if (!threadNodeId) {
					continue;
				}
				for (const com of t.comments?.nodes || []) {
					const dbId = com.databaseId;
					const id   = typeof dbId === 'number' ? dbId : parseInt(String(dbId), 10);
					if (!Number.isNaN(id)) {
						map.set(id, { isResolved : resolved, threadNodeId });
					}
				}
			}
		}
		catch {
			/* REST comments still work; dots treat missing map as resolved */
		}
		return map;
	}

	/**
	 * Review comments have no version to key on — anyone can add one at any moment — so these records age out
	 * on a TTL and lean on the ETag to make the usual "nothing new" read free. The mutations below write their
	 * own results straight into the record, so posting a comment never costs a refetch.
	 */
	async fetchPRReviewComments(owner: string, repo: string, number: number, forceRefresh = false): Promise<ReviewComment[]> {
		return reviewComments.read({
			key   : prKey(owner, repo, number),
			force : forceRefresh,
			fetch : async previous => {
				const result = await this.fetchAllPagesConditional(`/repos/${owner}/${repo}/pulls/${number}/comments`, previous?.etag ?? null);
				if (result.notModified) {
					return result;
				}
				return { data : await this.decorateReviewComments(owner, repo, number, result.data as any[]), etag : result.etag };
			},
		});
	}

	private async decorateReviewComments(owner: string, repo: string, number: number, raw: any[]): Promise<ReviewComment[]> {
		const threadMeta = await this.fetchReviewCommentThreadMeta(owner, repo, number);
		// A comment the thread query did not cover is treated as resolved, so an unreadable thread map leaves
		// the review dots quiet rather than lighting every one of them up.
		return raw.map((c: any) => toReviewComment(c, threadMeta.get(c.id) ?? { isResolved : true, threadNodeId : '' }));
	}

	/** Toggle PR review thread resolved state (GraphQL only; requires `threadNodeId` from fetch). */
	async setReviewThreadResolved(threadNodeId: string, resolved: boolean, target?: PullRequestLocation): Promise<void> {
		await this.mutateReviewThreadResolved(threadNodeId, resolved);
		if (target) {
			reviewComments.patch(prKey(target.owner, target.repo, target.number), comments => comments.map(
				comment => comment.threadNodeId === threadNodeId ? { ...comment, isResolved : resolved } : comment
			));
		}
	}

	private async mutateReviewThreadResolved(threadNodeId: string, resolved: boolean): Promise<void> {
		if (resolved) {
			const MUTATION = `
		mutation($threadId: ID!) {
		  resolveReviewThread(input: { threadId: $threadId }) {
			thread { isResolved }
		  }
		}`;
			await this.graphql(MUTATION, { threadId : threadNodeId });
		}
		else {
			const MUTATION = `
		mutation($threadId: ID!) {
		  unresolveReviewThread(input: { threadId: $threadId }) {
			thread { isResolved }
		  }
		}`;
			await this.graphql(MUTATION, { threadId : threadNodeId });
		}
	}

	async fetchPRIssueComments(owner: string, repo: string, number: number, forceRefresh = false): Promise<IssueComment[]> {
		return issueComments.read({
			key   : prKey(owner, repo, number),
			force : forceRefresh,
			fetch : async previous => {
				const result = await this.fetchAllPagesConditional(`/repos/${owner}/${repo}/issues/${number}/comments`, previous?.etag ?? null);
				return result.notModified ? result : { data : (result.data as any[]).map(toIssueComment), etag : result.etag };
			},
		});
	}

	async createIssueComment(owner: string, repo: string, number: number, body: string): Promise<IssueComment> {
		const created = toIssueComment(await this.apiFetch(`/repos/${owner}/${repo}/issues/${number}/comments`, {
			method : 'POST',
			body   : JSON.stringify({ body }),
		}));
		// GitHub handed back the comment it stored, so the record is updated from that rather than refetched.
		// The ETag the record holds is now stale, which is the point: the next read revalidates and gets 200.
		issueComments.patch(prKey(owner, repo, number), comments => [ ...comments, created ]);
		return created;
	}

	async submitReview(owner: string, repo: string, number: number, commitId: string, pending: PendingComment[], event = 'COMMENT'): Promise<any> {
		const comments = pending.map(c => ({
			path : c.path,
			line : c.line,
			side : c.side,
			body : formatCommentBody(c.body, c.commentType),
		}));
		return this.apiFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
			method : 'POST',
			body   : JSON.stringify({ commit_id : commitId, event, comments }),
		});
	}

	async replyToReviewComment(owner: string, repo: string, number: number, commentId: number, body: string): Promise<ReviewComment> {
		const c = await this.apiFetch(`/repos/${owner}/${repo}/pulls/${number}/comments/${commentId}/replies`, {
			method : 'POST',
			body   : JSON.stringify({ body }),
		});
		const reply = toReviewComment(c);
		reviewComments.patch(prKey(owner, repo, number), comments => [ ...comments, reply ]);
		return reply;
	}

	async applySuggestion(commentNodeId: string, commitMessage?: string): Promise<void> {
		const MUTATION = `
	  mutation($suggestionId: ID!, $message: String!) {
		applySuggestedChanges(input: { suggestionIds: [$suggestionId], message: $message }) {
		  clientMutationId
		}
	  }`;
		await this.graphql(MUTATION, { suggestionId : commentNodeId, message : commitMessage || 'Apply suggestion from review' });
	}

}

/** Shared shape of one REST review comment, used by both the list read and the reply mutation. */
function toReviewComment(c: any, meta?: { isResolved: boolean; threadNodeId: string }): ReviewComment {
	return {
		id             : c.id,
		node_id        : c.node_id,
		path           : c.path,
		line           : c.line ?? c.original_line ?? null,
		side           : c.side || 'RIGHT',
		original_line  : c.original_line ?? null,
		body           : c.body,
		user           : { login : c.user.login, avatar_url : c.user.avatar_url },
		created_at     : c.created_at,
		updated_at     : c.updated_at,
		in_reply_to_id : c.in_reply_to_id ?? undefined,
		html_url       : c.html_url,
		isResolved     : meta?.isResolved ?? false,
		threadNodeId   : meta?.threadNodeId,
	};
}

function toIssueComment(c: any): IssueComment {
	return {
		id         : c.id,
		body       : c.body || '',
		user       : { login : c.user.login, avatar_url : c.user.avatar_url },
		created_at : c.created_at,
		html_url   : c.html_url,
	};
}

/** Card data is keyed by GitHub's global pull request id, which is unique across every repository. */
function cardKey(prId: number): string {
	return String(prId);
}

/**
 * What a card's data describes. `updated_at` moves on a push, a label change, a new review — everything a
 * card renders except the check rollup, which has nothing to key on and is written in by polling instead.
 */
function cardVersion(pr: any): string {
	return String(pr?.updated_at ?? '');
}

function pagedEndpoint(endpoint: string, page: number): string {
	const sep = endpoint.includes('?') ? '&' : '?';
	return `${endpoint}${sep}per_page=${PER_PAGE}&page=${page}`;
}

export const GitHubClient = new GitHubAPI();
export default GitHubClient;

/**
 * Decodes a base64 payload as UTF-8 text. `atob` alone returns one character per *byte*, so anything
 * outside ASCII — an em dash, an accent, an emoji — arrives as mojibake rather than the character.
 */
function utf8FromBase64(base64: string): string {
	const binary = atob(base64);
	const bytes  = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new TextDecoder().decode(bytes);
}

async function readZipTextFile(archive: ArrayBuffer, fileName: string): Promise<string> {
	const bytes = new Uint8Array(archive);
	const view  = new DataView(archive);
	const end   = findZipEndOfCentralDirectory(view);
	if (end < 0) {
		return new TextDecoder().decode(bytes);
	}

	const directoryOffset = view.getUint32(end + 16, true);
	const entries         = view.getUint16(end + 10, true);
	let offset            = directoryOffset;
	for (let index = 0; index < entries; index++) {
		if (view.getUint32(offset, true) !== 0x02014b50) {
			throw new Error('The test-results artifact has an invalid ZIP directory');
		}
		const compressionMethod  = view.getUint16(offset + 10, true);
		const compressedSize     = view.getUint32(offset + 20, true);
		const nameLength         = view.getUint16(offset + 28, true);
		const extraLength        = view.getUint16(offset + 30, true);
		const commentLength      = view.getUint16(offset + 32, true);
		const localOffset        = view.getUint32(offset + 42, true);
		const name               = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
		offset                  += 46 + nameLength + extraLength + commentLength;
		if (!name.endsWith(fileName)) {
			continue;
		}
		if (view.getUint32(localOffset, true) !== 0x04034b50) {
			throw new Error('The test-results artifact has an invalid ZIP entry');
		}
		const localNameLength  = view.getUint16(localOffset + 26, true);
		const localExtraLength = view.getUint16(localOffset + 28, true);
		const start            = localOffset + 30 + localNameLength + localExtraLength;
		const data             = bytes.slice(start, start + compressedSize);
		if (compressionMethod === 0) {
			return new TextDecoder().decode(data);
		}
		if (compressionMethod !== 8) {
			throw new Error(`Unsupported test-results compression method: ${compressionMethod}`);
		}
		const stream   = new Blob([ data ]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
		const inflated = await new Response(stream).arrayBuffer();
		return new TextDecoder().decode(inflated);
	}
	return '';
}

function findZipEndOfCentralDirectory(view: DataView): number {
	for (let offset = view.byteLength - 22; offset >= Math.max(0, view.byteLength - 65_557); offset--) {
		if (view.getUint32(offset, true) === 0x06054b50) {
			return offset;
		}
	}
	return -1;
}

function parseTestFailure(line: string): TestFailure | null {
	try {
		const record = JSON.parse(line) as Record<string, unknown>;
		if (typeof record.fullTitle !== 'string' || typeof record.message !== 'string') {
			return null;
		}
		return {
			suite     : typeof record.suite === 'string' ? record.suite : '',
			name      : typeof record.name === 'string' ? record.name : record.fullTitle,
			fullTitle : record.fullTitle,
			message   : record.message,
			stack     : typeof record.stack === 'string' ? record.stack : '',
			file      : typeof record.file === 'string' ? record.file : null,
			line      : typeof record.line === 'number' ? record.line : null,
		};
	}
	catch {
		return null;
	}
}

function chunk<T>(items: T[], size: number): T[][] {
	const batches: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		batches.push(items.slice(index, index + size));
	}
	return batches;
}

function parseRepositoryUrl(url: unknown): { owner: string; repo: string } {
	const match = typeof url === 'string' ? url.match(/repos\/([^/]+)\/([^/]+)/) : null;
	return { owner : match?.[1] || '', repo : match?.[2] || '' };
}

/** GraphQL reports a tri-state enum where the REST payload carried `mergeable` plus `mergeable_state`. */
function mergeabilityFromGraphql(mergeable: string | null | undefined): PRMergeability {
	if (mergeable === 'CONFLICTING') {
		return { mergeable : false, mergeable_state : 'dirty' };
	}
	if (mergeable === 'MERGEABLE') {
		return { mergeable : true, mergeable_state : 'clean' };
	}
	return { mergeable : null, mergeable_state : 'unknown' };
}

function checksSummaryFromPullRequest(node: any): ChecksSummary {
	const contexts               = node?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes || [];
	const summary: ChecksSummary = { passed : 0, failed : 0, pending : 0, updatedAt : null };

	for (const context of contexts) {
		summary.updatedAt = latestTimestamp(summary.updatedAt, context.completedAt, context.startedAt, context.createdAt);
		if (context.conclusion) {
			if ([ 'SUCCESS', 'NEUTRAL', 'SKIPPED' ].includes(context.conclusion)) {
				summary.passed++;
			}
			else if ([ 'FAILURE', 'TIMED_OUT', 'CANCELLED' ].includes(context.conclusion)) {
				summary.failed++;
			}
			else {
				summary.pending++;
			}
		}
		else if (context.state) {
			if (context.state === 'SUCCESS') {
				summary.passed++;
			}
			else if (context.state === 'FAILURE' || context.state === 'ERROR') {
				summary.failed++;
			}
			else {
				summary.pending++;
			}
		}
		else {
			summary.pending++;
		}
	}

	return summary;
}

/** Whether a freshly read rollup moved at all, so a caller can back its polling off while nothing changes. */
function checksSummariesDiffer(previous: ChecksSummary | undefined, next: ChecksSummary): boolean {
	return !previous || previous.passed !== next.passed || previous.failed !== next.failed || previous.pending !== next.pending;
}

/** Newest of the timestamps a check rollup context can carry; ignores the nulls that queued checks report. */
function latestTimestamp(...values: (string | null | undefined)[]): string | null {
	let latest                = 0;
	let result: string | null = null;
	for (const value of values) {
		const time = value ? Date.parse(value) : NaN;
		if (Number.isFinite(time) && time > latest) {
			latest = time;
			result = value!;
		}
	}
	return result;
}

function botCountsFromReviewThreads(threads: any[] | undefined): BotCounts {
	const counts: BotCounts = { low : 0, medium : 0, high : 0 };

	for (const thread of threads || []) {
		if (thread.isResolved || !thread.comments?.nodes?.length) {
			continue;
		}
		const comment = thread.comments.nodes[0];
		if (!CURSOR_BOT.test(comment.author?.login || '')) {
			continue;
		}
		counts[parseBotSeverity(comment.body)]++;
	}

	return counts;
}

function parseBotSeverity(body: string): keyof BotCounts {
	if (!body) {
		return 'medium';
	}
	const lower = body.toLowerCase();
	if (/\bcritical\b/.test(lower) || /\bhigh\b/.test(lower) || /\berror\b/.test(lower) || /\bbug\b/.test(lower) || /severity:\s*high/i.test(body)) {
		return 'high';
	}
	if (/\bsuggestion\b/.test(lower) || /\bnit\b/.test(lower) || /\bminor\b/.test(lower) || /\blow\b/.test(lower) || /severity:\s*low/i.test(body)) {
		return 'low';
	}
	return 'medium';
}

/**
 * Rebuild the `head`/`base` shape the board expects (`ref`, `sha`, `repo.full_name`) from GraphQL fields.
 * Search results omit these entirely, and the checkout matching in gitCheckoutClient depends on them.
 */
function refDescriptor(repository: any, refName: unknown, oid: unknown): { ref: string; sha: string; repo: { full_name: string } } | null {
	const fullName = repository?.nameWithOwner;
	if (typeof refName !== 'string' || !refName || typeof fullName !== 'string' || !fullName) {
		return null;
	}
	return { ref : refName, sha : typeof oid === 'string' ? oid : '', repo : { full_name : fullName } };
}

function rateLimitResetFromHeaders(resetHeader: string | null, retryAfter: string | null): Date | null {
	if (resetHeader) {
		return new Date(parseInt(resetHeader, 10) * 1000);
	}
	return retryAfter ? new Date(Date.now() + parseInt(retryAfter, 10) * 1000) : null;
}

/** Build a readable message from GitHub REST error JSON (`message` + `errors`). */
function formatGithubRestErrorMessage(status: number, body: any): string {
	const fallback = `GitHub API error: ${status}`;
	if (!body || typeof body !== 'object') {
		return fallback;
	}
	const main             = typeof body.message === 'string' && body.message.trim() ? body.message.trim() : '';
	const pieces: string[] = [];
	if (Array.isArray(body.errors)) {
		for (const e of body.errors) {
			if (typeof e === 'string' && e.trim()) {
				pieces.push(e.trim());
			}
			else if (e && typeof e === 'object' && typeof (e as { message?: string }).message === 'string') {
				const m = (e as { message: string }).message.trim();
				if (m) {
					pieces.push(m);
				}
			}
		}
	}
	if (main && pieces.length) {
		return `${main}: ${pieces.join('; ')}`;
	}
	if (pieces.length) {
		return pieces.join('; ');
	}
	return main ? main : fallback;
}

/**
 * GitHub merged PRs include `merged_at` and `merge_commit_sha`; `merged` can be missing or wrong in some responses.
 * Derive a reliable boolean so the UI does not show merged work as still open.
 */
function normalizePullRequest(pr: any): any {
	if (!pr || typeof pr !== 'object') {
		return pr;
	}
	// Never treat as merged when GitHub says it was closed without merging.
	if (pr.merged === false || pr.merged === 'false') {
		return { ...pr, merged : false };
	}
	// Do not use `merge_commit_sha` alone: it can be set for test merges or other cases on closed, unmerged PRs.
	const merged
		= pr.merged === true
		|| pr.merged === 'true'
		|| (pr.merged_at != null && pr.merged_at !== '');
	return { ...pr, merged : Boolean(merged) };
}

export function isPullRequestConflicted(pr: any): boolean {
	return !pr || typeof pr !== 'object' ? false : pr.mergeable === false || pr.mergeable_state === 'dirty';
}

function apiError(msg: string, extra?: Partial<ApiError>): ApiError {
	const err = new Error(msg) as ApiError;
	if (extra) {
		Object.assign(err, extra);
	}
	return err;
}

export interface ApiError extends Error {
	status?: number;
	rateLimitReset?: Date | null;
}

/** A conditional read's outcome: fresh bytes with their new ETag, or 304 and nothing to replace. */
interface ConditionalResult {
	data?: any;
	etag?: string | null;
	notModified?: boolean;
}

/**
 * Which pull request a mutation acted on, so its result can be written into that record. Optional at every
 * call site: a caller that cannot say leaves the record to revalidate on its own schedule instead.
 */
export interface PullRequestLocation {
	owner: string;
	repo: string;
	number: number;
}

export interface BotCounts {
	low: number;
	medium: number;
	high: number;
}

export interface PRStats {
	changedFiles: number;
	additions: number;
	deletions: number;
}

export interface PRMergeability {
	mergeable: boolean | null;
	mergeable_state?: string | null;
}

export interface WorktreeCheckoutTarget {
	branch: string;
	remoteRepos: string[];
}

export interface AsyncMergeResult {
	status?: 'pending' | 'merged' | 'enqueued' | 'failed';
	details?: {
		message?: string;
		uuid?: string;
		sha?: string;
	};
}

export interface AccessibleRepo {
	fullName: string;
	ownerLogin: string;
	ownerType: string;
}

export interface PullRequestTarget {
	id: number;
	owner: string;
	repo: string;
	number: number;
}

export interface PinnedPullRequestState {
	id: number;
	title: string;
	merged: boolean;
	/** True when this poll's rollup differs from the one it replaced. */
	checksChanged: boolean;
}

export interface ChecksSummary {
	passed: number;
	failed: number;
	pending: number;
	/** When any check in the rollup last moved, so a summary can say how stale it is. Null when none reported one. */
	updatedAt: string | null;
}

export interface BranchInfo {
	name: string;
	date: Date;
	message: string;
}

export interface CheckAnnotation {
	path: string;
	message: string;
	title: string | null;
	level: string;
	startLine: number;
	endLine: number;
}

export interface CheckRunDetail {
	name: string;
	status: 'completed' | 'in_progress' | 'queued' | string;
	conclusion: string | null;
	url: string | null;
	startedAt: string | null;
	completedAt: string | null;
	annotations: CheckAnnotation[];
}

export interface TestFailure {
	suite: string;
	name: string;
	fullTitle: string;
	message: string;
	stack: string;
	file: string | null;
	line: number | null;
}

export interface RepoLabel {
	id: number;
	name: string;
	color: string;
	description: string | null;
}

export interface PRFile {
	sha: string;
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	changes: number;
	patch?: string;
	previous_filename?: string;
	/**
	 * Set when PRism paired this file's two halves itself because GitHub reported them as an unrelated
	 * deletion and addition. GitHub still knows them as two paths, so anything addressed to GitHub by
	 * path — a review comment, viewed state — has to use `previous_filename` for the base side.
	 */
	synthesizedRename?: boolean;
	/** Set when that pairing came from the reader choosing the two halves rather than from detection. */
	forcedRename?: boolean;
}

export type CommentType = 'suggestion' | 'change-required' | 'question';

export interface ReviewComment {
	id: number;
	node_id: string;
	path: string;
	line: number | null;
	side: 'LEFT' | 'RIGHT';
	original_line: number | null;
	body: string;
	user: { login: string; avatar_url: string };
	created_at: string;
	updated_at: string;
	in_reply_to_id?: number;
	html_url: string;
	/** GitHub review thread resolved state; false → attention pulse in diff gutter */
	isResolved?: boolean;
	/** GraphQL PullRequestReviewThread id (PRRT_…); used to resolve/unresolve the thread */
	threadNodeId?: string;
}

/** PR conversation comment (issue timeline), not line-level review */
export interface IssueComment {
	id: number;
	body: string;
	user: { login: string; avatar_url: string };
	created_at: string;
	html_url: string;
}

export interface PendingComment {
	id: string;
	path: string;
	line: number;
	side: 'LEFT' | 'RIGHT';
	body: string;
	commentType: CommentType;
	lineContent: string;
}

const COMMENT_TYPE_PREFIXES: Record<CommentType, string> = {
	'suggestion'      : '\u{1F4A1} **Suggestion:**',
	'change-required' : '\u{26A0}\u{FE0F} **Change Required:**',
	'question'        : '\u{2753} **Question:**',
};

export function formatCommentBody(body: string, commentType: CommentType): string {
	const prefix = COMMENT_TYPE_PREFIXES[commentType];
	return `${prefix} ${body}\n<!-- review-type:${commentType} -->`;
}

export function parseCommentType(body: string): CommentType {
	const metaMatch = body.match(/<!-- review-type:(suggestion|change-required|question) -->/);
	if (metaMatch) {
		return metaMatch[1] as CommentType;
	}
	if (body.startsWith('\u{1F4A1}')) {
		return 'suggestion';
	}
	if (body.startsWith('\u{26A0}')) {
		return 'change-required';
	}
	return body.startsWith('\u{2753}') ? 'question' : 'suggestion';
}

export function stripCommentTypePrefix(body: string): string {
	return body
		.replace(/^(?:\u{1F4A1}|\u{26A0}\u{FE0F}|\u{2753})\s*\*\*(?:Suggestion|Change Required|Question):\*\*\s*/u, '')
		.replace(/\n?<!-- review-type:(?:suggestion|change-required|question) -->/, '')
		.trim();
}

type SuggestionSegment = { type: 'text'; content: string } | { type: 'suggestion'; code: string };

export function parseSuggestionBlocks(body: string): SuggestionSegment[] {
	const segments: SuggestionSegment[] = [];
	const regex                         = /```suggestion\n([\s\S]*?)```/g;
	let lastIndex                       = 0;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(body)) !== null) {
		if (match.index > lastIndex) {
			segments.push({ type : 'text', content : body.slice(lastIndex, match.index).trim() });
		}
		segments.push({ type : 'suggestion', code : match[1].replace(/\n$/, '') });
		lastIndex = match.index + match[0].length;
	}

	const trailing = body.slice(lastIndex).trim();
	if (trailing) {
		segments.push({ type : 'text', content : trailing });
	}

	return segments;
}
