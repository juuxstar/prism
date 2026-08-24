import type { ResolvedScheme } from '@/lib/theme/colorScheme';

export type HljsAppearance = 'light' | 'dark';

export interface HljsThemeOption {
	id: string;
	label: string;
	appearance: HljsAppearance;
}

const LEGACY_KEY = 'hljsTheme';
const KEY_LIGHT  = 'hljsThemeLight';
const KEY_DARK   = 'hljsThemeDark';

export const HLJS_THEMES_DARK: HljsThemeOption[] = [
	{ id : 'github-dark', label : 'GitHub Dark', appearance : 'dark' },
	{ id : 'github-dark-dimmed', label : 'GitHub Dimmed', appearance : 'dark' },
	{ id : 'dark-modern', label : 'Dark Modern', appearance : 'dark' },
	{ id : 'atom-one-dark', label : 'Atom One Dark', appearance : 'dark' },
	{ id : 'monokai', label : 'Monokai', appearance : 'dark' },
	{ id : 'monokai-sublime', label : 'Monokai Sublime', appearance : 'dark' },
	{ id : 'vs2015', label : 'VS 2015', appearance : 'dark' },
	{ id : 'tokyo-night-dark', label : 'Tokyo Night', appearance : 'dark' },
	{ id : 'nord', label : 'Nord', appearance : 'dark' },
	{ id : 'night-owl', label : 'Night Owl', appearance : 'dark' },
	{ id : 'rose-pine', label : 'Rose Pine', appearance : 'dark' },
	{ id : 'an-old-hope', label : 'An Old Hope', appearance : 'dark' },
	{ id : 'panda-syntax-dark', label : 'Panda', appearance : 'dark' },
];

export const HLJS_THEMES_LIGHT: HljsThemeOption[] = [
	{ id : 'github', label : 'GitHub', appearance : 'light' },
	{ id : 'atom-one-light', label : 'Atom One Light', appearance : 'light' },
	{ id : 'vs', label : 'Visual Studio', appearance : 'light' },
	{ id : 'intellij-light', label : 'IntelliJ Light', appearance : 'light' },
	{ id : 'stackoverflow-light', label : 'Stack Overflow Light', appearance : 'light' },
	{ id : 'googlecode', label : 'Google Code', appearance : 'light' },
	{ id : 'idea', label : 'IDEA', appearance : 'light' },
	{ id : 'tokyo-night-light', label : 'Tokyo Night Light', appearance : 'light' },
	{ id : 'xcode', label : 'Xcode', appearance : 'light' },
	{ id : 'solarized-light', label : 'Solarized Light', appearance : 'light' },
];

export const HLJS_THEME_GROUPS: { label: string; themes: HljsThemeOption[] }[] = [
	{ label : 'Dark', themes : HLJS_THEMES_DARK },
	{ label : 'Light', themes : HLJS_THEMES_LIGHT },
];

/** Flat list of every theme (dark first, then light). */
export const HLJS_THEMES: HljsThemeOption[] = [ ...HLJS_THEMES_DARK, ...HLJS_THEMES_LIGHT ];

type HljsThemeCssLoader = () => Promise<{ default: string }>;

const themeModules: Record<string, HljsThemeCssLoader> = {
	'github-dark'         : () => import('highlight.js/styles/github-dark.min.css?raw'),
	'github-dark-dimmed'  : () => import('highlight.js/styles/github-dark-dimmed.min.css?raw'),
	'dark-modern'         : () => import('@/styles/hljs-dark-modern.css?raw'),
	'atom-one-dark'       : () => import('highlight.js/styles/atom-one-dark.min.css?raw'),
	'monokai'             : () => import('highlight.js/styles/monokai.min.css?raw'),
	'monokai-sublime'     : () => import('highlight.js/styles/monokai-sublime.min.css?raw'),
	'vs2015'              : () => import('highlight.js/styles/vs2015.min.css?raw'),
	'tokyo-night-dark'    : () => import('highlight.js/styles/tokyo-night-dark.min.css?raw'),
	'nord'                : () => import('highlight.js/styles/nord.min.css?raw'),
	'night-owl'           : () => import('highlight.js/styles/night-owl.min.css?raw'),
	'rose-pine'           : () => import('highlight.js/styles/rose-pine.min.css?raw'),
	'an-old-hope'         : () => import('highlight.js/styles/an-old-hope.min.css?raw'),
	'panda-syntax-dark'   : () => import('highlight.js/styles/panda-syntax-dark.min.css?raw'),
	'github'              : () => import('highlight.js/styles/github.min.css?raw'),
	'atom-one-light'      : () => import('highlight.js/styles/atom-one-light.min.css?raw'),
	'vs'                  : () => import('highlight.js/styles/vs.min.css?raw'),
	'intellij-light'      : () => import('highlight.js/styles/intellij-light.min.css?raw'),
	'stackoverflow-light' : () => import('highlight.js/styles/stackoverflow-light.min.css?raw'),
	'googlecode'          : () => import('highlight.js/styles/googlecode.min.css?raw'),
	'idea'                : () => import('highlight.js/styles/idea.min.css?raw'),
	'tokyo-night-light'   : () => import('highlight.js/styles/tokyo-night-light.min.css?raw'),
	'xcode'               : () => import('highlight.js/styles/xcode.min.css?raw'),
	'solarized-light'     : () => import('highlight.js/styles/base16/solarized-light.min.css?raw'),
};

let styleEl: HTMLStyleElement | null = null;

export function defaultHljsThemeId(scheme: HljsAppearance): string {
	return scheme === 'light' ? 'github' : 'github-dark';
}

export function hljsThemesForScheme(scheme: HljsAppearance): HljsThemeOption[] {
	return scheme === 'light' ? HLJS_THEMES_LIGHT : HLJS_THEMES_DARK;
}

export function hljsThemesForResolvedScheme(scheme: ResolvedScheme): HljsThemeOption[] {
	return hljsThemesForScheme(scheme);
}

export function getStoredHljsThemeId(scheme: ResolvedScheme): string {
	const key              = scheme === 'light' ? KEY_LIGHT : KEY_DARK;
	let raw: string | null = null;
	try {
		raw = localStorage.getItem(key);
	}
	catch {
		/* Ignore */
	}
	const list = hljsThemesForScheme(scheme);
	return raw && list.some(t => t.id === raw) ? raw : defaultHljsThemeId(scheme);
}

export function setStoredHljsThemeId(scheme: ResolvedScheme, id: string): void {
	const key = scheme === 'light' ? KEY_LIGHT : KEY_DARK;
	try {
		localStorage.setItem(key, id);
	}
	catch {
		/* Ignore */
	}
}

/** One-time migration from legacy single `hljsTheme` key to per-scheme keys. */
export function migrateHljsThemeStorage(): void {
	if (typeof localStorage === 'undefined') {
		return;
	}
	let legacy: string | null = null;
	try {
		legacy = localStorage.getItem(LEGACY_KEY);
	}
	catch {
		return;
	}
	if (!legacy) {
		return;
	}

	let hasL: boolean;
	let hasD: boolean;
	try {
		hasL = localStorage.getItem(KEY_LIGHT) != null;
		hasD = localStorage.getItem(KEY_DARK) != null;
	}
	catch {
		return;
	}

	const meta = HLJS_THEMES.find(t => t.id === legacy);
	if (meta?.appearance === 'light') {
		if (!hasL) {
			localStorage.setItem(KEY_LIGHT, legacy);
		}
		if (!hasD) {
			localStorage.setItem(KEY_DARK, defaultHljsThemeId('dark'));
		}
	}
	else {
		const darkId = meta && themeModules[legacy] ? legacy : defaultHljsThemeId('dark');
		if (!hasD) {
			localStorage.setItem(KEY_DARK, darkId);
		}
		if (!hasL) {
			localStorage.setItem(KEY_LIGHT, defaultHljsThemeId('light'));
		}
	}
	try {
		localStorage.removeItem(LEGACY_KEY);
	}
	catch {
		/* Ignore */
	}
}

export async function loadHljsTheme(name: string) {
	const loader = themeModules[name];
	if (!loader) {
		return;
	}
	const mod = await loader();
	if (!styleEl) {
		styleEl    = document.createElement('style');
		styleEl.id = 'hljs-theme';
		document.head.appendChild(styleEl);
	}
	styleEl.textContent = mod.default;
}
