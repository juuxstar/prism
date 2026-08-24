import type { CommentType, PendingComment } from '@/lib/api/githubClient';

const STORAGE_PREFIX        = 'prism:pendingReview:';
const LEGACY_STORAGE_PREFIX = [ 'github', 'PR:pendingReview:' ].join('');
const FORMAT_VERSION        = 1;

const COMMENT_TYPES: ReadonlySet<string> = new Set([ 'suggestion', 'change-required', 'question' ]);
const SIDES: ReadonlySet<string>         = new Set([ 'LEFT', 'RIGHT' ]);

function storageKey(owner: string, repo: string, number: number): string {
	return `${STORAGE_PREFIX}${owner}:${repo}:${number}`;
}

function legacyStorageKey(owner: string, repo: string, number: number): string {
	return `${LEGACY_STORAGE_PREFIX}${owner}:${repo}:${number}`;
}

function isRecord(x: unknown): x is Record<string, unknown> {
	return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function isPendingComment(x: unknown): x is PendingComment {
	if (!isRecord(x)) {
		return false;
	}
	if (typeof x.id !== 'string' || !x.id) {
		return false;
	}
	if (typeof x.path !== 'string') {
		return false;
	}
	if (typeof x.line !== 'number' || !Number.isFinite(x.line)) {
		return false;
	}
	if (typeof x.side !== 'string' || !SIDES.has(x.side)) {
		return false;
	}
	if (typeof x.body !== 'string') {
		return false;
	}
	if (typeof x.commentType !== 'string' || !COMMENT_TYPES.has(x.commentType)) {
		return false;
	}
	return typeof x.lineContent !== 'string' ? false : true;
}

/** Returns stored comments if valid and head SHA matches; otherwise null (stale entries are removed). */
export function loadPendingReview(owner: string, repo: string, number: number, headSha: string): PendingComment[] | null {
	if (typeof localStorage === 'undefined') {
		return null;
	}
	const key     = storageKey(owner, repo, number);
	let sourceKey = key;
	let raw: string | null;
	try {
		raw = localStorage.getItem(key);
		if (raw == null || raw === '') {
			sourceKey = legacyStorageKey(owner, repo, number);
			raw       = localStorage.getItem(sourceKey);
		}
	}
	catch {
		return null;
	}
	if (raw == null || raw === '') {
		return null;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	}
	catch {
		try {
			localStorage.removeItem(sourceKey);
		}
		catch {
			/* Ignore */
		}
		return null;
	}

	if (!isRecord(parsed)) {
		return null;
	}
	if (parsed.v !== FORMAT_VERSION) {
		return null;
	}
	if (typeof parsed.headSha !== 'string' || !parsed.headSha) {
		return null;
	}
	if (parsed.headSha !== headSha) {
		console.info('[PRism] Discarding stored pending review: head SHA changed');
		try {
			localStorage.removeItem(sourceKey);
		}
		catch {
			/* Ignore */
		}
		return null;
	}
	if (!Array.isArray(parsed.comments)) {
		return null;
	}
	const comments: PendingComment[] = [];
	for (const item of parsed.comments) {
		if (!isPendingComment(item)) {
			return null;
		}
		comments.push({
			id          : item.id,
			path        : item.path,
			line        : item.line,
			side        : item.side,
			body        : item.body,
			commentType : item.commentType as CommentType,
			lineContent : item.lineContent,
		});
	}
	if (sourceKey !== key) {
		try {
			localStorage.setItem(key, raw);
			localStorage.removeItem(sourceKey);
		}
		catch {
			/* Ignore */
		}
	}
	return comments;
}

export function savePendingReview(owner: string, repo: string, number: number, headSha: string, comments: PendingComment[]): void {
	if (typeof localStorage === 'undefined') {
		return;
	}
	const key = storageKey(owner, repo, number);
	try {
		if (comments.length === 0) {
			localStorage.removeItem(key);
			localStorage.removeItem(legacyStorageKey(owner, repo, number));
			return;
		}
		localStorage.setItem(
			key,
			JSON.stringify({ v : FORMAT_VERSION, headSha, comments })
		);
	}
	catch {
		/* Quota or private mode */
	}
}
