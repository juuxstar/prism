import type {
	BotCounts, CheckRunDetail, ChecksSummary, IssueComment, PRFile, PRMergeability, PRStats, RepoLabel, ReviewComment
} from '@/lib/api/githubClient';
import { EntityStore } from '@/lib/store/entityStore';

/**
 * PRism's entity store: one record per thing GitHub knows about, keyed by identity and stamped with the
 * version it describes. Everything the UI renders comes from here, so the board card, the pinned strip and
 * the detail header cannot disagree about the same pull request.
 *
 * Each collection's version is whatever actually moves its data:
 *
 * - a pull request's own fields move with `updated_at`, which is only known once it has been read, so these
 *   records revalidate on a TTL and lean on ETags to make an unchanged read free;
 * - anything derived from the diff — the file list, the viewed marks — moves with the head commit, so a push
 *   invalidates exactly those and nothing else;
 * - checks move on their own schedule with nothing to key on at all, so polling writes them in directly.
 */

/** Long enough that tabbing between views is instant, short enough that a stale header self-corrects. */
const DETAIL_TTL_MS   = 30_000;
const COMMENTS_TTL_MS = 30_000;
const CHECKS_TTL_MS   = 15_000;
const LABELS_TTL_MS   = 10 * 60_000;

export const prDetails      = new EntityStore<any>('prDetail', DETAIL_TTL_MS);
export const prFiles        = new EntityStore<PRFile[]>('prFiles');
export const reviewComments = new EntityStore<ReviewComment[]>('reviewComments', COMMENTS_TTL_MS);
export const issueComments  = new EntityStore<IssueComment[]>('issueComments', COMMENTS_TTL_MS);
export const reviewDecision = new EntityStore<ReviewDecision>('reviewDecision', COMMENTS_TTL_MS);
export const viewedState    = new EntityStore<ViewedState>('viewedState');
export const detailedChecks = new EntityStore<CheckRunDetail[]>('detailedChecks', CHECKS_TTL_MS);
export const repoLabels     = new EntityStore<RepoLabel[]>('repoLabels', LABELS_TTL_MS);
/** Keyed by the commit pair it was computed from, which fixes the answer for good — no version, no TTL. */
export const mergeBases     = new EntityStore<string>('mergeBases');

/** Board card data, keyed by GitHub's global pull request id and versioned by the PR's `updated_at`. */
export const prStats        = new EntityStore<PRStats>('prStats');
export const prMergeability = new EntityStore<PRMergeability>('prMergeability');
export const prBotCounts    = new EntityStore<BotCounts>('prBotCounts');
export const prChecks       = new EntityStore<ChecksSummary>('prChecks');

const ALL_STORES = [
	prDetails, prFiles, reviewComments, issueComments, reviewDecision, viewedState, detailedChecks,
	repoLabels, mergeBases, prStats, prMergeability, prBotCounts, prChecks,
];

/** Identity of a pull request across every collection that is keyed by one. */
export function prKey(owner: string, repo: string, number: number): string {
	return `${owner.toLowerCase()}/${repo.toLowerCase()}#${number}`;
}

export function repoKey(owner: string, repo: string): string {
	return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

/**
 * The version every diff-derived record carries. Both commits matter: GitHub diffs against the merge base,
 * so a base branch that moved changes the diff without the head commit moving at all.
 */
export function diffVersion(baseSha: string, headSha: string): string {
	return `${baseSha}..${headSha}`;
}

export function clearStores(): void {
	for (const store of ALL_STORES) {
		store.clear();
	}
}

export type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;

export interface ViewedState {
	viewedFiles: Record<string, string>;
	prNodeId: string;
}
