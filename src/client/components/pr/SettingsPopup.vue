<template>
	<div class="u-flex-shrink-0" ref="root">
		<button
			type="button"
			class="settings-trigger u-inline-flex u-items-center u-gap-2 u-py-1 u-px-2 u-cursor-pointer"
			:aria-expanded="open ? 'true' : 'false'"
			aria-haspopup="dialog"
			@click="toggle"
		>
			<img v-if="user?.avatar_url" class="settings-trigger-avatar" :src="user.avatar_url" :alt="user.login" />
			<span class="settings-trigger-username u-fs-14 u-fw-500 u-text-secondary u-truncate">{{ user?.login }}</span>
		</button>
		<Teleport to="body">
			<div v-if="open" class="settings-popup-overlay u-fixed u-inset-0 u-z-modal u-flex u-items-center u-justify-center u-p-6">
				<div class="settings-popup u-w-full u-p-6" ref="popup" role="dialog" aria-label="Settings">
					<div class="u-fs-12 u-fw-600 u-text-tertiary u-uppercase u-m-0 u-mb-4">Settings</div>
					<label class="settings-row u-flex u-items-center u-justify-between u-gap-3 u-mb-3 u-text-secondary u-fs-13">
						<span>Light/Dark Mode</span>
						<select class="settings-select" :value="appearance" @change="onAppearanceChange">
							<option value="system">Auto</option>
							<option value="light">Light</option>
							<option value="dark">Dark</option>
						</select>
					</label>
					<label class="settings-row u-flex u-items-center u-justify-between u-gap-3 u-mb-3 u-text-secondary u-fs-13">
						<span>Code Syntax Theme</span>
						<select class="settings-select" :value="hljsTheme" @change="hljsTheme = ($event.target as HTMLSelectElement).value">
							<option v-for="theme in hljsThemesFiltered" :key="theme.id" :value="theme.id">{{ theme.label }}</option>
						</select>
					</label>
					<label class="settings-row u-flex u-items-center u-justify-between u-gap-3 u-mb-3 u-text-secondary u-fs-13">
						<span>Font size</span>
						<select class="settings-select" :value="diffFontSize" @change="diffFontSize = Number(($event.target as HTMLSelectElement).value)">
							<option v-for="preset in diffFontSizePresets" :key="preset.value" :value="preset.value">{{ preset.label }}</option>
						</select>
					</label>
					<label class="settings-row u-flex u-items-center u-justify-between u-gap-3 u-mb-3 u-text-secondary u-fs-13">
						<span>Tab size</span>
						<select class="settings-select" :value="tabSize" @change="tabSize = Number(($event.target as HTMLSelectElement).value)">
							<option v-for="preset in tabSizePresets" :key="preset" :value="preset">{{ preset }} spaces</option>
						</select>
					</label>
					<div class="settings-actions">
						<button type="button" class="settings-save u-w-full u-py-2 u-px-2-5 u-fs-13 u-fw-600 u-cursor-pointer" @click="saveSettings">Save</button>
						<button type="button" class="settings-signout u-w-full u-py-2 u-px-2-5 u-fs-13 u-cursor-pointer" @click="signOut">Sign out</button>
					</div>
				</div>
			</div>
		</Teleport>
	</div>
</template>

<script lang="ts">
import type { Appearance, ResolvedScheme } from '@/lib/theme/colorScheme';
import { getAppearance, getResolvedScheme, setAppearance, subscribeColorScheme } from '@/lib/theme/colorScheme';
import { DIFF_FONT_SIZE_PRESETS, DIFF_TAB_SIZE_PRESETS, getDiffFontSize, getDiffTabSize, setDiffFontSize, setDiffTabSize, subscribeDiffSettings } from '@/lib/theme/diffSettings';
import { getStoredHljsThemeId, type HljsThemeOption, hljsThemesForResolvedScheme, loadHljsTheme, setStoredHljsThemeId }                           from '@/lib/theme/hljsTheme';

import { Component, Prop, Vue } from 'vue-facing-decorator';

/** Header user menu for app display settings and sign out. */
@Component({ emits : [ 'logout' ] })
export default class SettingsPopup extends Vue {

	@Prop({ required : true }) readonly user!: { login: string; avatar_url?: string } | null;

	open = false;
	appearance: Appearance = getAppearance();
	resolvedScheme: ResolvedScheme = getResolvedScheme();
	hljsTheme = getStoredHljsThemeId(getResolvedScheme());
	diffFontSize: number = getDiffFontSize();
	tabSize: number = getDiffTabSize();

	readonly diffFontSizePresets = DIFF_FONT_SIZE_PRESETS;
	readonly tabSizePresets = DIFF_TAB_SIZE_PRESETS;

	private _unsubColorScheme: (() => void) | null = null;
	private _unsubDiffSettings: (() => void) | null = null;
	private _onDocumentClick: ((event: MouseEvent) => void) | null = null;
	private _onKeydown: ((event: KeyboardEvent) => void) | null = null;

	get hljsThemesFiltered(): HljsThemeOption[] {
		return hljsThemesForResolvedScheme(this.resolvedScheme);
	}

	mounted() {
		this.syncDraftColorSettings();
		this.syncDraftDiffSettings();
		this._unsubColorScheme = subscribeColorScheme(() => {
			if (!this.open) {
				this.syncDraftColorSettings();
			}
		});
		this._unsubDiffSettings = subscribeDiffSettings(() => {
			if (!this.open) {
				this.syncDraftDiffSettings();
			}
		});
		this._onDocumentClick = (event: MouseEvent) => {
			const root   = this.$refs.root as HTMLElement | undefined;
			const target = event.target as Node;
			if (this.open && root && !root.contains(target) && !(this.$refs.popup as HTMLElement | undefined)?.contains(target)) {
				this.open = false;
			}
		};
		this._onKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				this.open = false;
			}
		};
		document.addEventListener('click', this._onDocumentClick);
		document.addEventListener('keydown', this._onKeydown);
	}

	beforeUnmount() {
		this._unsubColorScheme?.();
		this._unsubColorScheme = null;
		this._unsubDiffSettings?.();
		this._unsubDiffSettings = null;
		if (this._onDocumentClick) {
			document.removeEventListener('click', this._onDocumentClick);
			this._onDocumentClick = null;
		}
		if (this._onKeydown) {
			document.removeEventListener('keydown', this._onKeydown);
			this._onKeydown = null;
		}
	}

	toggle() {
		if (!this.open) {
			this.syncDraftColorSettings();
			this.syncDraftDiffSettings();
		}
		this.open = !this.open;
	}

	onAppearanceChange(e: Event) {
		this.appearance = (e.target as HTMLSelectElement).value as Appearance;
		if (this.appearance === 'system') {
			this.resolvedScheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
		}
		else {
			this.resolvedScheme = this.appearance;
		}
		this.hljsTheme = getStoredHljsThemeId(this.resolvedScheme);
	}

	saveSettings() {
		setStoredHljsThemeId(this.resolvedScheme, this.hljsTheme);
		setAppearance(this.appearance);
		loadHljsTheme(this.hljsTheme);
		this.diffFontSize = setDiffFontSize(this.diffFontSize);
		this.tabSize      = setDiffTabSize(this.tabSize);
		this.open         = false;
	}

	signOut() {
		this.open = false;
		this.$emit('logout');
	}

	private syncDraftColorSettings() {
		this.appearance     = getAppearance();
		this.resolvedScheme = getResolvedScheme();
		this.hljsTheme      = getStoredHljsThemeId(this.resolvedScheme);
		loadHljsTheme(this.hljsTheme);
	}

	private syncDraftDiffSettings() {
		this.diffFontSize = getDiffFontSize();
		this.tabSize      = getDiffTabSize();
	}

}
</script>

<style>
.settings-trigger {
	background: transparent;
	border: 1px solid transparent;
	border-radius: var(--radius-sm);
	color: var(--text-secondary);
	font-family: inherit;
	transition:
		background var(--transition),
		border-color var(--transition),
		color var(--transition);
}

.settings-trigger:hover,
.settings-trigger[aria-expanded="true"] {
	background: var(--bg-primary);
	border-color: var(--border);
	color: var(--text-primary);
}

.settings-trigger-avatar {
	width: 24px;
	height: 24px;
	border-radius: 50%;
	border: 1px solid var(--border);
	object-fit: cover;
}

.settings-trigger-username {
	max-width: 160px;
}

.settings-popup-overlay {
	background: rgba(0, 0, 0, 0.18);
}

html[data-color-scheme="light"] .settings-popup-overlay {
	background: rgba(27, 31, 36, 0.12);
}

.settings-popup {
	width: min(420px, 100%);
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	box-shadow:
		0 28px 80px rgba(0, 0, 0, 0.56),
		0 0 0 1px rgba(255, 255, 255, 0.04);
}

html[data-color-scheme="light"] .settings-popup {
	box-shadow:
		0 28px 80px rgba(27, 31, 36, 0.24),
		0 0 0 1px rgba(27, 31, 36, 0.04);
}

.settings-select {
	width: 138px;
	padding: 5px 26px 5px 9px;
	background: var(--bg-primary);
	color: var(--text-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-family: inherit;
	font-size: 12px;
	cursor: pointer;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='%238b949e'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 7px center;

	&:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	& option {
		background: var(--bg-secondary);
		color: var(--text-primary);
	}
}

.settings-actions {
	margin-top: 36px;
}

.settings-save {
	background: var(--accent-blue);
	border: 1px solid var(--accent-blue);
	border-radius: var(--radius-sm);
	color: #fff;
	font-family: inherit;
	transition:
		background var(--transition),
		border-color var(--transition),
		box-shadow var(--transition);

	&:hover {
		background: var(--accent-blue);
		border-color: var(--accent-blue);
		box-shadow: 0 0 0 2px var(--accent-blue-muted);
	}
}

.settings-signout {
	margin-top: 28px;
	background: transparent;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	color: var(--text-secondary);
	font-family: inherit;
	transition:
		background var(--transition),
		border-color var(--transition),
		color var(--transition);

	&:hover {
		color: var(--accent-red);
		border-color: var(--accent-red);
		background: var(--danger-bg-subtle);
	}
}

:is(.settings-select, .settings-save, .settings-signout, .settings-trigger):focus {
	outline: none;
	border-color: var(--focus-ring);
	box-shadow: 0 0 0 1px var(--focus-ring);
}
</style>
