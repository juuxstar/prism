import { getStoredToken } from './auth';
import type { PRFile }    from './githubClient';

export interface GitCheckout {
	path: string;
	hostPath?: string;
	label: string;
	branch: string;
	headSha: string;
	aheadCount?: number;
	behindCount?: number;
	dirty: boolean;
	stagedCount?: number;
	unstagedCount?: number;
	remoteRepos: string[];
	isMain: boolean;
}

export interface GitWorkspaceStatus {
	workspaceDir: string;
	hostWorkspaceDir?: string;
	mode: 'none' | 'single' | 'worktree-parent';
	checkouts: GitCheckout[];
	error?: string;
}

export interface PullRequestCheckoutTarget {
	headRepo: string;
	baseRepo?: string;
	headRef: string;
	headSha?: string;
}

export interface PullRequestCheckoutState {
	checkedOut: boolean;
	path: string;
	hostPath?: string;
	label: string;
	branch: string;
	shaMatches: boolean;
	isMain: boolean;
}

export interface LocalPrFileContent {
	base: string | null;
	head: string | null;
	encoding?: 'text' | 'base64';
}

export interface LocalPrStatus {
	hasLocalChanges: boolean;
	hasUnpushedCommits: boolean;
	aheadCount: number;
	checkoutPath: string;
	/** Commits on the repository's default branch that the checkout is missing; undefined when unknown. */
	behindDefaultBranchCount?: number;
}

export async function fetchGitWorkspaceStatus(): Promise<GitWorkspaceStatus> {
	const response = await fetch('/api/git/status');
	const body     = await response.json().catch(() => ({}) as any);
	if (!response.ok) {
		throw new Error(typeof body.error === 'string' ? body.error : `Git status failed: ${response.status}`);
	}
	return body;
}

export async function checkoutPullRequestBranch(pr: PullRequestCheckoutTarget, worktreePath?: string): Promise<GitWorkspaceStatus> {
	const token   = getStoredToken();
	const headers = new Headers({ 'Content-Type' : 'application/json' });
	if (token) {
		headers.set('Authorization', `Bearer ${token}`);
	}
	const response = await fetch('/api/git/checkout', {
		method : 'POST',
		headers,
		body   : JSON.stringify({ pr, worktreePath }),
	});
	const body = await response.json().catch(() => ({}) as any);
	if (!response.ok) {
		throw new Error(typeof body.error === 'string' ? body.error : `Git checkout failed: ${response.status}`);
	}
	return body.status;
}

export async function resetWorktreeToNaturalBranch(worktreePath: string): Promise<GitWorkspaceStatus> {
	return postGitJson('/api/git/reset-worktree', { worktreePath }, true);
}

export async function pullWorktreeBranch(worktreePath: string): Promise<GitWorkspaceStatus> {
	return postGitJson('/api/git/pull-worktree', { worktreePath }, true);
}

export async function fetchLocalPullRequestFiles(pr: PullRequestCheckoutTarget): Promise<PRFile[]> {
	return postGitJson('/api/git/local-files', { pr });
}

export async function fetchLocalPullRequestFileContent(pr: PullRequestCheckoutTarget, file: PRFile): Promise<LocalPrFileContent> {
	return postGitJson('/api/git/local-file-content', {
		pr,
		path         : file.filename,
		previousPath : file.previous_filename,
		status       : file.status,
	});
}

export async function fetchLocalPullRequestStatus(pr: PullRequestCheckoutTarget, defaultBranch: string): Promise<LocalPrStatus> {
	return postGitJson('/api/git/local-status', { pr, defaultBranch }, true);
}

export async function commitLocalPullRequestChanges(pr: PullRequestCheckoutTarget, message: string, defaultBranch: string): Promise<LocalPrStatus> {
	return postGitJson('/api/git/commit', { pr, message, defaultBranch }, true);
}

export async function pushLocalPullRequestChanges(pr: PullRequestCheckoutTarget, defaultBranch: string): Promise<LocalPrStatus> {
	return postGitJson('/api/git/push', { pr, defaultBranch }, true);
}

export async function mergeDefaultBranchIntoPullRequest(pr: PullRequestCheckoutTarget, defaultBranch: string): Promise<LocalPrStatus> {
	return postGitJson('/api/git/merge-default-branch', { pr, defaultBranch }, true);
}

async function postGitJson<T>(url: string, body: unknown, withAuth = false): Promise<T> {
	const headers = new Headers({ 'Content-Type' : 'application/json' });
	if (withAuth) {
		const token = getStoredToken();
		if (token) {
			headers.set('Authorization', `Bearer ${token}`);
		}
	}
	const response = await fetch(url, { method : 'POST', headers, body : JSON.stringify(body) });
	const json     = await response.json().catch(() => ({}) as any);
	if (!response.ok) {
		throw new Error(typeof json.error === 'string' ? json.error : `Git request failed: ${response.status}`);
	}
	return json;
}

export function checkoutTargetForPr(pr: any): PullRequestCheckoutTarget | null {
	const head = pr?.head;
	const repo = head?.repo?.full_name;
	const ref  = head?.ref;
	const sha  = head?.sha;
	if (typeof repo !== 'string' || typeof ref !== 'string' || !repo || !ref) {
		return null;
	}
	const baseRepo = pr?.base?.repo?.full_name;
	return {
		headRepo : repo,
		baseRepo : typeof baseRepo === 'string' && baseRepo ? baseRepo : undefined,
		headRef  : ref,
		headSha  : typeof sha === 'string' && sha ? sha : undefined,
	};
}

/** The origin repository's default branch, as reported on the pull request's base repo. */
export function defaultBranchForPr(pr: any): string {
	const branch = pr?.base?.repo?.default_branch;
	return typeof branch === 'string' ? branch.trim() : '';
}

function branchMatches(checkoutBranch: string, prBranch: string): boolean {
	return checkoutBranch === prBranch || checkoutBranch.endsWith(`/${prBranch}`);
}

/** Whether a local checkout is sitting on the given pull request's head branch. */
export function checkoutMatchesPullRequest(checkout: GitCheckout, pr: any): boolean {
	const target = checkoutTargetForPr(pr);
	if (!target) {
		return false;
	}
	const remoteRepos = checkout.remoteRepos.map(repo => repo.toLowerCase());
	const headRepo    = target.headRepo.toLowerCase();
	const baseRepo    = target.baseRepo?.toLowerCase();
	const repoMatches = remoteRepos.includes(headRepo) || Boolean(baseRepo && remoteRepos.includes(baseRepo));
	const branchMatch = branchMatches(checkout.branch, target.headRef);
	const shaMatches  = Boolean(target.headSha && checkout.headSha === target.headSha);
	return shaMatches || (branchMatch && (repoMatches || remoteRepos.length === 0));
}

export function checkoutStateForPr(pr: any, status: GitWorkspaceStatus | null): PullRequestCheckoutState | null {
	const target = checkoutTargetForPr(pr);
	if (!target || !status?.checkouts.length) {
		return null;
	}
	const headSha = target.headSha;
	const match   = status.checkouts.find(checkout => checkoutMatchesPullRequest(checkout, pr));
	if (!match) {
		return null;
	}
	return {
		checkedOut : true,
		path       : match.path,
		hostPath   : match.hostPath,
		label      : match.label,
		branch     : match.branch,
		shaMatches : Boolean(headSha && match.headSha === headSha),
		isMain     : match.isMain,
	};
}
