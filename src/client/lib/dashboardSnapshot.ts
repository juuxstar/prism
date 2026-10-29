import type { AccessibleRepo, CardDataSnapshot } from '@/lib/api/githubClient';
import GitHubClient                              from '@/lib/api/githubClient';

const STORAGE_KEY = 'prism.dashboardSnapshot.v1';

/** Past this a snapshot is more likely to mislead than help, so the board loads from scratch instead. */
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * The last board the dashboard rendered, kept so the next one can render straight away — after a page load,
 * or coming back from a PR opened in its own tab — and then revalidate in place. It is only ever a first
 * paint: every field in it is refetched as soon as the token is confirmed, and replaced when that lands.
 */
export function readDashboardSnapshot(): DashboardSnapshot | null {
	try {
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
		return !isDashboardSnapshot(stored) || Date.now() - stored.savedAt > MAX_AGE_MS ? null : stored;
	}
	catch {
		return null;
	}
}

export function writeDashboardSnapshot(user: any, accessibleRepos: AccessibleRepo[], prs: any[]): void {
	if (!user?.login) {
		return;
	}
	const snapshot: DashboardSnapshot = {
		savedAt  : Date.now(),
		user     : { login : user.login, name : user.name, avatar_url : user.avatar_url },
		accessibleRepos,
		// The body is the one large field a search result carries, and no board card renders it.
		prs      : prs.map(({ body: _body, ...pr }) => pr),
		cardData : GitHubClient.snapshotCardData(prs),
	};
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
	}
	catch {
		// A full or blocked storage quota costs the instant first paint, not the board in this tab.
	}
}

export function clearDashboardSnapshot(): void {
	try {
		localStorage.removeItem(STORAGE_KEY);
	}
	catch {
		// Nothing to clear when storage is unavailable.
	}
}

function isDashboardSnapshot(value: any): value is DashboardSnapshot {
	return Boolean(value)
		&& Number.isFinite(value.savedAt)
		&& typeof value.user?.login === 'string'
		&& Array.isArray(value.accessibleRepos)
		&& Array.isArray(value.prs)
		&& Boolean(value.cardData?.cards)
		&& Boolean(value.cardData?.firstNames);
}

export interface DashboardSnapshot {
	savedAt: number;
	/** The account the board was read as; a different sign-in must never see it. */
	user: { login: string; name?: string; avatar_url?: string };
	accessibleRepos: AccessibleRepo[];
	prs: any[];
	cardData: CardDataSnapshot;
}
