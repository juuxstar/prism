export const DIFF_SETTINGS_EVENT = 'diff-settings-changed';

export const DIFF_FONT_SIZE_PRESETS = [
	{ value : 11, label : 'x-small' },
	{ value : 12, label : 'small' },
	{ value : 13, label : 'medium' },
	{ value : 14, label : 'large' },
	{ value : 16, label : 'x-large' },
] as const;

export const DIFF_TAB_SIZE_PRESETS = [ 2, 4, 8 ] as const;

export type DiffFontSize = typeof DIFF_FONT_SIZE_PRESETS[number]['value'];
export type DiffTabSize = typeof DIFF_TAB_SIZE_PRESETS[number];

const FONT_SIZE_KEY = 'diffFontSize';
const TAB_SIZE_KEY  = 'diffTabSize';

function parsePreset<T extends readonly number[]>(raw: string | null, presets: T, fallback: T[number]): T[number] {
	const n = raw ? parseInt(raw, 10) : fallback;
	return (presets as readonly number[]).includes(n) ? n as T[number] : fallback;
}

function readStorage(key: string): string | null {
	try {
		return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
	}
	catch {
		return null;
	}
}

function writeStorage(key: string, value: number): void {
	try {
		localStorage.setItem(key, String(value));
	}
	catch {
		/* Ignore */
	}
}

export function getDiffFontSize(): DiffFontSize {
	return parsePreset(readStorage(FONT_SIZE_KEY), DIFF_FONT_SIZE_PRESETS.map(p => p.value), 12) as DiffFontSize;
}

export function getDiffTabSize(): DiffTabSize {
	return parsePreset(readStorage(TAB_SIZE_KEY), DIFF_TAB_SIZE_PRESETS, 4) as DiffTabSize;
}

export function setDiffFontSize(value: number): DiffFontSize {
	const next = parsePreset(String(value), DIFF_FONT_SIZE_PRESETS.map(p => p.value), 12) as DiffFontSize;
	writeStorage(FONT_SIZE_KEY, next);
	dispatchDiffSettingsChanged();
	return next;
}

export function setDiffTabSize(value: number): DiffTabSize {
	const next = parsePreset(String(value), DIFF_TAB_SIZE_PRESETS, 4) as DiffTabSize;
	writeStorage(TAB_SIZE_KEY, next);
	dispatchDiffSettingsChanged();
	return next;
}

export function dispatchDiffSettingsChanged(): void {
	window.dispatchEvent(new CustomEvent(DIFF_SETTINGS_EVENT, {
		detail : { diffFontSize : getDiffFontSize(), tabSize : getDiffTabSize() },
	}));
}

export function subscribeDiffSettings(cb: () => void): () => void {
	const handler = () => cb();
	window.addEventListener(DIFF_SETTINGS_EVENT, handler);
	return () => window.removeEventListener(DIFF_SETTINGS_EVENT, handler);
}
