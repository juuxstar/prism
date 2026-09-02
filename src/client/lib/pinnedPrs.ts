import { reactive } from 'vue';

const STORAGE_KEY = 'prism.pinnedPrs.v1';

/** Bounds the header strip: past this many chips it stops being a glance and starts being a second board. */
export const MAX_PINNED_PRS = 8;

/**
 * The pinned set, shared by every view that renders the header strip. Reactive so a pin toggled on a board card
 * updates the header in the same frame, and mirrored to localStorage so a PR opened in its own browser tab —
 * which boots a fresh module instance — starts with the same pins.
 */
export const pinnedPrs = reactive<PinnedPr[]>(readStoredPins());

export function isPinned(prId: number): boolean {
	return pinnedPrs.some(pin => pin.id === prId);
}

/** Returns the new pinned state, so callers can report what the click did. */
export function togglePinnedPr(pin: PinnedPr): boolean {
	if (isPinned(pin.id)) {
		unpinPr(pin.id);
		return false;
	}
	// Newest pin goes last so the strip keeps a stable left-to-right order as PRs come and go.
	pinnedPrs.push(pin);
	pinnedPrs.splice(0, Math.max(0, pinnedPrs.length - MAX_PINNED_PRS));
	writeStoredPins();
	return true;
}

export function unpinPr(prId: number): void {
	const index = pinnedPrs.findIndex(pin => pin.id === prId);
	if (index === -1) {
		return;
	}
	pinnedPrs.splice(index, 1);
	writeStoredPins();
}

/**
 * Fold a freshly read pull request into the pinned set. A merged PR has nothing left to watch, so it drops out
 * on its own rather than waiting to be cleared by hand; anything still open just keeps its title current.
 */
export function syncPinnedPr(pr: { id: number; title?: string; merged?: boolean }): void {
	if (!isPinned(pr.id)) {
		return;
	}
	if (pr.merged) {
		unpinPr(pr.id);
		return;
	}
	updatePinnedPrTitle(pr.id, pr.title || '');
}

/** Keeps a pin's title current once a view has loaded fresher data than the card the pin was created from. */
function updatePinnedPrTitle(prId: number, title: string): void {
	const pin = pinnedPrs.find(entry => entry.id === prId);
	if (!pin || !title || pin.title === title) {
		return;
	}
	pin.title = title;
	writeStoredPins();
}

function readStoredPins(): PinnedPr[] {
	try {
		const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
		return Array.isArray(stored) ? stored.filter(isPinnedPrRecord).slice(0, MAX_PINNED_PRS) : [];
	}
	catch {
		return [];
	}
}

function writeStoredPins(): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(pinnedPrs));
	}
	catch {
		// A full or blocked storage quota costs persistence, not the pins in this tab.
	}
}

function isPinnedPrRecord(value: any): value is PinnedPr {
	return Boolean(value)
		&& Number.isFinite(value.id)
		&& typeof value.owner === 'string'
		&& typeof value.repo === 'string'
		&& Number.isInteger(value.number);
}

// A PR opened in a second tab pins and unpins against the same storage key; without this the two headers drift.
window.addEventListener('storage', event => {
	if (event.key !== STORAGE_KEY) {
		return;
	}
	pinnedPrs.splice(0, pinnedPrs.length, ...readStoredPins());
});

export interface PinnedPr {
	/** GitHub's numeric pull request id — the key every GitHubClient cache is keyed by. */
	id: number;
	owner: string;
	repo: string;
	number: number;
	title: string;
}
