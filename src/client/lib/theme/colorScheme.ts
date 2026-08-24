export type Appearance = 'light' | 'dark' | 'system';
export type ResolvedScheme = 'light' | 'dark';

type MediaSchemeListener = (e: MediaQueryListEvent) => void;

const STORAGE_KEY = 'colorSchemeAppearance';
const EVENT_NAME  = 'color-scheme-changed';

const VALID: Appearance[] = [ 'light', 'dark', 'system' ];

let appearance: Appearance                    = 'system';
let mediaListener: MediaSchemeListener | null = null;

function prefersDark(): boolean {
	return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getResolvedScheme(): ResolvedScheme {
	if (appearance === 'light') {
		return 'light';
	}
	if (appearance === 'dark') {
		return 'dark';
	}
	return prefersDark() ? 'dark' : 'light';
}

export function getAppearance(): Appearance {
	return appearance;
}

function parseStored(raw: string | null): Appearance {
	return raw && (VALID as string[]).includes(raw) ? raw as Appearance : 'system';
}

export function applyResolvedScheme(): void {
	const resolved = getResolvedScheme();
	document.documentElement.setAttribute('data-color-scheme', resolved);
	window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail : { appearance, resolved } }));
}

export function setAppearance(next: Appearance): void {
	appearance = next;
	try {
		localStorage.setItem(STORAGE_KEY, next);
	}
	catch {
		/* Ignore */
	}
	detachMediaListener();
	if (next === 'system') {
		attachMediaListener();
	}
	applyResolvedScheme();
}

function attachMediaListener(): void {
	const mq      = window.matchMedia('(prefers-color-scheme: dark)');
	mediaListener = () => applyResolvedScheme();
	mq.addEventListener('change', mediaListener);
}

function detachMediaListener(): void {
	if (!mediaListener) {
		return;
	}
	window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', mediaListener);
	mediaListener = null;
}

export function subscribeColorScheme(cb: () => void): () => void {
	const handler = () => cb();
	window.addEventListener(EVENT_NAME, handler);
	return () => window.removeEventListener(EVENT_NAME, handler);
}

/** Call once at app startup before first paint when possible. */
export function initColorScheme(): void {
	appearance = parseStored(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null);
	detachMediaListener();
	if (appearance === 'system') {
		attachMediaListener();
	}
	applyResolvedScheme();
}
