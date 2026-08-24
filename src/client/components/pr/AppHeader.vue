<template>
	<header class="header u-flex u-items-center u-justify-between u-py-3-5 u-px-6 u-flex-shrink-0 u-sticky u-top-0 u-z-100">
		<div class="header-left u-flex u-items-center u-gap-3">
			<img class="logo" src="/icons/prism.svg" alt="" width="36" height="36" />
			<h1 class="title u-m-0 u-fs-18 u-fw-600 u-text-primary">PRism</h1>
			<select class="repo-select u-fs-13 u-truncate u-ml-4" :value="currentRepo" @change="onRepoChange">
				<option value="">All repositories</option>
				<option v-for="repo in repos" :key="repo" :value="repo">{{ repo }}</option>
			</select>
			<div class="type-filters u-flex u-items-center u-gap-0-5 u-ml-4 u-p-0-5">
				<button class="type-filter-btn" :class="{ active : currentTypeFilter === 'ready' }" @click="$emit('set-type-filter', 'ready')">Ready</button>
				<button class="type-filter-btn" :class="{ active : currentTypeFilter === 'draft' }" @click="$emit('set-type-filter', 'draft')">Draft</button>
				<button class="type-filter-btn" :class="{ active : currentTypeFilter === 'worktrees' }" @click="$emit('set-type-filter', 'worktrees')">Worktrees</button>
			</div>
			<button
				v-if="user"
				class="btn-refresh u-flex u-items-center u-justify-center u-ml-2"
				:class="{ spinning : refreshing }"
				title="Refresh"
				@click="$emit('refresh')"
				v-html="refreshBtnHtml"
			></button>
		</div>
		<div class="header-right u-flex u-items-center u-gap-3">
			<select class="repo-select u-fs-13 u-truncate" :value="selectedTeam" @change="onTeamChange">
				<option value="alpha">Alpha Team</option>
				<option value="beta">Beta Team</option>
				<option value="gamma">Gamma Team</option>
			</select>
			<settings-popup v-if="user" :user="settingsUser" @logout="$emit('logout')" />
		</div>
	</header>
</template>

<script lang="ts">
import SettingsPopup from '@/components/pr/SettingsPopup.vue';
import { iconSvg }   from '@/lib/icons';

import { Component, Prop, Vue } from 'vue-facing-decorator';

/** Top navigation bar with repo/team selectors, type filters, refresh, and user info. */
@Component({ components : { SettingsPopup }, emits : [ 'set-type-filter', 'set-repo', 'set-team', 'refresh', 'logout' ] })
export default class AppHeader extends Vue {

	@Prop({ required : true }) readonly user!: Record<string, unknown> | null;
	@Prop({ required : true }) readonly repos!: string[];
	@Prop({ required : true }) readonly currentRepo!: string;
	@Prop({ required : true }) readonly currentTypeFilter!: string;
	@Prop({ required : true }) readonly selectedTeam!: string;
	@Prop({ required : true }) readonly refreshing!: boolean;

	get refreshBtnHtml(): string {
		return iconSvg('refresh', 14);
	}

	get settingsUser(): { login: string; avatar_url?: string } | null {
		if (!this.user) {
			return null;
		}
		return {
			login      : String(this.user.login ?? ''),
			avatar_url : typeof this.user.avatar_url === 'string' ? this.user.avatar_url : undefined,
		};
	}

	onRepoChange(e: Event) {
		this.$emit('set-repo', (e.target as HTMLSelectElement).value);
	}

	onTeamChange(e: Event) {
		this.$emit('set-team', (e.target as HTMLSelectElement).value);
	}

}
</script>

<style>
.header {
	background: var(--bg-secondary);
	border-bottom: 1px solid var(--border);
}

html[data-color-scheme="light"] .header {
	background: #e4e7ec;
}

.logo {
	width: 36px;
	height: 36px;
	border-radius: 9px;
	flex-shrink: 0;
}

.repo-select {
	padding: 5px 28px 5px 10px;
	background: var(--bg-primary);
	color: var(--text-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-family: inherit;
	cursor: pointer;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='%238b949e'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 8px center;
	max-width: 240px;
	transition: all var(--transition);
}

.repo-select:hover {
	border-color: var(--border-hover);
	color: var(--text-primary);
}

.repo-select:focus {
	outline: none;
	border-color: var(--focus-ring);
	box-shadow: 0 0 0 1px var(--focus-ring);
}

.repo-select option {
	background: var(--bg-secondary);
	color: var(--text-primary);
}

.type-filters {
	background: var(--bg-primary);
	border-radius: var(--radius-sm);
	border: 1px solid var(--border);
}

.type-filter-btn {
	padding: var(--u-1) var(--u-3);
	border: none;
	background: transparent;
	color: var(--text-tertiary);
	font-size: 12px;
	font-weight: 500;
	border-radius: var(--u-1);
	cursor: pointer;
	transition: all var(--transition);
	font-family: inherit;
}

.type-filter-btn:hover {
	color: var(--text-secondary);
}

.type-filter-btn.active {
	color: var(--text-primary);
	background: var(--bg-tertiary);
}

.btn-refresh {
	background: none;
	border: 1px solid var(--border);
	color: var(--text-secondary);
	width: 32px;
	height: 32px;
	border-radius: var(--radius-sm);
	cursor: pointer;
	transition: all var(--transition);
}

.btn-refresh:hover {
	color: var(--text-primary);
	border-color: var(--border-hover);
	background: var(--bg-tertiary);
}

.btn-refresh.spinning svg {
	animation: spin 0.8s linear infinite;
}
</style>
