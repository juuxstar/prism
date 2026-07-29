import type { PRFile } from '@/lib/api/githubClient';

const STORAGE_PREFIX = 'prism.localViewed.v1';

export interface LocalViewedScope {
	owner: string;
	repo: string;
	prNumber: number;
	headSha: string;
}

export function loadLocalViewedFiles(scope: LocalViewedScope, files: PRFile[]): Record<string, string> {
	const viewed: Record<string, string> = {};
	for (const file of files) {
		if (localStorage.getItem(storageKey(scope, file)) === 'VIEWED') {
			viewed[file.filename] = 'VIEWED';
		}
	}
	return viewed;
}

export function setLocalFileViewed(scope: LocalViewedScope, file: PRFile, state: string): void {
	const key = storageKey(scope, file);
	if (state === 'VIEWED') {
		localStorage.setItem(key, 'VIEWED');
	}
	else {
		localStorage.removeItem(key);
	}
}

function storageKey(scope: LocalViewedScope, file: PRFile): string {
	return [
		STORAGE_PREFIX,
		encodePart(scope.owner),
		encodePart(scope.repo),
		String(scope.prNumber),
		encodePart(scope.headSha),
		encodePart(file.filename),
		diffFingerprint(file),
	].join(':');
}

function diffFingerprint(file: PRFile): string {
	return hashString([
		file.filename,
		file.previous_filename || '',
		file.status,
		String(file.additions),
		String(file.deletions),
		String(file.changes),
		file.patch || '',
	].join('\n'));
}

function encodePart(value: string): string {
	return encodeURIComponent(value);
}

function hashString(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i);
		hash  = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
