<template>
	<select class="appearance-select u-fs-13 u-cursor-pointer" :value="appearance" @change="onChange">
		<option value="system">Auto</option>
		<option value="light">Light</option>
		<option value="dark">Dark</option>
	</select>
</template>

<script lang="ts">
import type { Appearance } from '@/lib/theme/colorScheme';
import { getAppearance, setAppearance, subscribeColorScheme } from '@/lib/theme/colorScheme';

import { Component, Vue } from 'vue-facing-decorator';

/** App-wide light / dark / system (follow OS) appearance. */
@Component
export default class AppearanceSelect extends Vue {

	appearance: Appearance              = getAppearance();
	private _unsub: (() => void) | null = null;

	mounted() {
		this.appearance = getAppearance();
		this._unsub     = subscribeColorScheme(() => {
			this.appearance = getAppearance();
		});
	}

	beforeUnmount() {
		this._unsub?.();
		this._unsub = null;
	}

	onChange(e: Event) {
		const v = (e.target as HTMLSelectElement).value as Appearance;
		setAppearance(v);
		this.appearance = getAppearance();
	}

}
</script>

<style>
.appearance-select {
	padding: 5px 28px 5px 10px;
	background: var(--bg-primary);
	color: var(--text-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-family: inherit;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='%238b949e'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 8px center;
	max-width: 120px;
	transition: all var(--transition);
}

.appearance-select:hover {
	border-color: var(--border-hover);
	color: var(--text-primary);
}

.appearance-select:focus {
	outline: none;
	border-color: var(--focus-ring);
	box-shadow: 0 0 0 1px var(--focus-ring);
}

.appearance-select option {
	background: var(--bg-secondary);
	color: var(--text-primary);
}
</style>
