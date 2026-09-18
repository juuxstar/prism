<template>
	<div v-if="pins.length" class="pinned-pr-bar u-flex u-items-center u-gap-1-5 u-min-w-0">
		<div
			v-for="pin in pins"
			:key="pin.id"
			class="pinned-pr-chip-wrap u-relative"
			@mouseenter="openPopover(pin.id)"
			@mouseleave="closePopover(pin.id)"
			@focusin="openPopover(pin.id)"
			@focusout="onChipFocusOut($event, pin.id)"
		>
			<button
				type="button"
				class="pinned-pr-chip u-inline-flex u-items-center u-gap-1-5 u-fs-12 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
				:class="'pinned-pr-chip-' + checksState(pin)"
				:aria-label="chipAriaLabel(pin)"
				@click="$emit('open-pr', { owner : pin.owner, repo : pin.repo, number : pin.number })"
			>
				<span class="pinned-pr-chip-icon u-flex u-items-center" aria-hidden="true" v-html="$icon(stateIcon(checksState(pin)), 13)"></span>
				<span>#{{ pin.number }}</span>
			</button>
			<div v-if="openPopoverId === pin.id" class="pinned-pr-popover" :class="'pinned-pr-popover-' + align">
				<div class="pinned-pr-popover-panel u-flex u-flex-col u-gap-2">
					<div class="u-flex u-flex-col u-gap-1">
						<span class="u-fs-14 u-fw-600 u-text-primary">#{{ pin.number }}</span>
						<span class="u-fs-12 u-text-tertiary">{{ pin.owner }}/{{ pin.repo }}</span>
						<span v-if="pin.title" class="pinned-pr-popover-title u-fs-13 u-text-secondary">{{ pin.title }}</span>
					</div>
					<div class="pinned-pr-popover-divider"></div>
					<div v-if="checkRows(pin).length" class="u-flex u-flex-col u-gap-1-5">
						<span v-for="row in checkRows(pin)" :key="row.label" class="pinned-pr-popover-row u-flex u-items-center u-gap-2 u-fs-13">
							<span class="u-flex u-items-center" :class="row.iconClass" aria-hidden="true" v-html="$icon(row.icon, 14)"></span>
							<span :class="row.muted ? 'u-text-tertiary' : 'u-text-secondary'">{{ row.label }}</span>
						</span>
					</div>
					<span v-else class="u-fs-13 u-text-tertiary">{{ checksState(pin) === 'unknown' ? "Loading checks…" : "No checks reported" }}</span>
					<div class="pinned-pr-popover-divider"></div>
					<button type="button" class="pinned-pr-unpin u-flex u-items-center u-gap-2 u-fs-13 u-cursor-pointer" @click="unpin(pin)">
						<span class="u-flex u-items-center" aria-hidden="true" v-html="$icon('pin', 13)"></span>
						<span>Unpin</span>
					</button>
				</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import type { ChecksSummary }               from '@/lib/api/githubClient';
import GitHubClient                         from '@/lib/api/githubClient';
import type { PinnedPr }                    from '@/lib/pinnedPrs';
import { pinnedPrs, syncPinnedPr, unpinPr } from '@/lib/pinnedPrs';
import { timeAgo }                          from '@/lib/utils';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

// The strip exists to be watched while the reader works elsewhere, so it polls on its own rather than riding
// the board's poll — the board stops covering a pinned PR as soon as a filter or a repo switch hides its card.
const POLL_BASE_MS = 30 * 1000;
const POLL_MAX_MS  = 5 * 60 * 1000;

type ChecksState = 'passed' | 'running' | 'failed' | 'none' | 'unknown';

const STATE_ICONS: Record<ChecksState, string> = {
	passed  : 'circleCheck',
	running : 'circleDot',
	failed  : 'circleX',
	none    : 'circleDot',
	unknown : 'circleDot',
};

/** Header strip of pinned pull requests, each chip rolling its checks up to one status dot plus a hover summary. */
@Component({ emits : [ 'open-pr' ] })
export default class PinnedPrBar extends Vue {

	/** Which edge the hover panel hangs from; right-align it when the strip sits near the right of the header. */
	@Prop({ default : 'left' }) readonly align!: 'left' | 'right';
	openPopoverId: number | null = null;

	private _pollTimer: ReturnType<typeof setTimeout> | null = null;
	private _pollDelay                                       = POLL_BASE_MS;
	private _onVisibilityChange: (() => void) | null         = null;
	/** Claims each poll run: auto-unpinning restarts polling, and the superseded run must not schedule a tick. */
	private _pollRequest                                     = 0;

	get pins(): PinnedPr[] {
		return pinnedPrs;
	}

	@Watch('pins', { deep : true })
	onPinsChanged() {
		// A newly pinned PR has no rollup yet on a page that never listed it; poll now rather than in 30s.
		this.restartPolling();
	}

	mounted() {
		this._onVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				this.restartPolling();
			}
			else {
				this.stopPolling();
			}
		};
		document.addEventListener('visibilitychange', this._onVisibilityChange);
		this.restartPolling();
	}

	beforeUnmount() {
		this.stopPolling();
		if (this._onVisibilityChange) {
			document.removeEventListener('visibilitychange', this._onVisibilityChange);
			this._onVisibilityChange = null;
		}
	}

	checksFor(pin: PinnedPr): ChecksSummary | null {
		return GitHubClient.getChecks(pin.id);
	}

	/** The popover's check breakdown, empty when this pin has no rollup cached yet. */
	checkRows(pin: PinnedPr): CheckRow[] {
		const checks = this.checksFor(pin);
		if (!checks) {
			return [];
		}
		const rows: CheckRow[] = [
			{ icon : 'circleCheck', iconClass : 'pinned-pr-state-passed', label : `${checks.passed} passed` },
			{ icon : 'circleDot', iconClass : 'pinned-pr-state-running', label : `${checks.pending} running` },
			{ icon : 'circleX', iconClass : 'pinned-pr-state-failed', label : `${checks.failed} failed` },
		];
		if (checks.updatedAt) {
			rows.push({ icon : 'clock', iconClass : 'u-text-tertiary', label : `Updated ${timeAgo(checks.updatedAt)}`, muted : true });
		}
		return rows;
	}

	checksState(pin: PinnedPr): ChecksState {
		const checks = this.checksFor(pin);
		if (!checks) {
			return 'unknown';
		}
		if (checks.failed > 0) {
			return 'failed';
		}
		if (checks.pending > 0) {
			return 'running';
		}
		return checks.passed > 0 ? 'passed' : 'none';
	}

	stateIcon(state: ChecksState): string {
		return STATE_ICONS[state];
	}

	chipAriaLabel(pin: PinnedPr): string {
		const checks = this.checksFor(pin);
		const status = checks ? `${checks.passed} passed, ${checks.pending} running, ${checks.failed} failed` : 'checks not loaded';
		return `Pinned pull request #${pin.number} in ${pin.owner}/${pin.repo} — ${status}`;
	}

	openPopover(prId: number) {
		this.openPopoverId = prId;
	}

	closePopover(prId: number) {
		if (this.openPopoverId === prId) {
			this.openPopoverId = null;
		}
	}

	onChipFocusOut(event: FocusEvent, prId: number) {
		const next = event.relatedTarget as Node | null;
		if (!next || !(event.currentTarget as HTMLElement).contains(next)) {
			this.closePopover(prId);
		}
	}

	unpin(pin: PinnedPr) {
		this.openPopoverId = null;
		unpinPr(pin.id);
	}

	// ─── polling ──────────────────────────────────────────

	private restartPolling() {
		this.stopPolling();
		this._pollDelay = POLL_BASE_MS;
		void this.refreshPinnedChecks();
	}

	private stopPolling() {
		this._pollRequest++;
		if (this._pollTimer) {
			clearTimeout(this._pollTimer);
			this._pollTimer = null;
		}
	}

	private async refreshPinnedChecks(): Promise<void> {
		const request   = ++this._pollRequest;
		this._pollTimer = null;
		if (!this.pins.length || !GitHubClient.getToken() || document.visibilityState !== 'visible') {
			return;
		}

		try {
			const states = await GitHubClient.refreshPinnedPullRequests(this.pins.map(pin => ({
				id     : pin.id,
				owner  : pin.owner,
				repo   : pin.repo,
				number : pin.number,
			})));
			// Merged PRs leave the strip here; that mutation restarts polling, which is what the guard below is for.
			states.forEach(syncPinnedPr);
			const changed   = states.some(state => state.checksChanged || state.merged);
			this._pollDelay = changed ? POLL_BASE_MS : Math.min(this._pollDelay * 2, POLL_MAX_MS);
		}
		catch {
			// A rate limit or a repo that stopped being readable must not take the strip's polling down for good.
			this._pollDelay = Math.min(this._pollDelay * 2, POLL_MAX_MS);
		}

		if (request !== this._pollRequest) {
			return;
		}
		this._pollTimer = setTimeout(() => void this.refreshPinnedChecks(), this._pollDelay);
	}

}

interface CheckRow {
	icon: string;
	iconClass: string;
	label: string;
	muted?: boolean;
}
</script>

<style>
.pinned-pr-chip {
	padding: 3px var(--u-2);
	border: 1px solid var(--border);
	border-radius: 999px;
	background: var(--bg-primary);
	color: var(--text-secondary);
	font-family: inherit;
	transition: all var(--transition);
}

.pinned-pr-chip:hover {
	border-color: var(--border-hover);
	color: var(--text-primary);
}

.pinned-pr-chip-passed .pinned-pr-chip-icon,
.pinned-pr-state-passed {
	color: var(--accent-green);
}

.pinned-pr-chip-running .pinned-pr-chip-icon,
.pinned-pr-state-running {
	color: var(--accent-orange);
}

.pinned-pr-chip-failed .pinned-pr-chip-icon,
.pinned-pr-state-failed {
	color: var(--accent-red);
}

.pinned-pr-chip-none .pinned-pr-chip-icon,
.pinned-pr-chip-unknown .pinned-pr-chip-icon {
	color: var(--text-tertiary);
}

.pinned-pr-chip-passed {
	border-color: var(--label-green-border);
	background: var(--chip-green-bg);
}

.pinned-pr-chip-running {
	border-color: var(--accent-orange);
	background: var(--chip-orange-bg);
}

.pinned-pr-chip-failed {
	border-color: var(--danger-border);
	background: var(--danger-bg-subtle);
}

.pinned-pr-chip-running .pinned-pr-chip-icon svg {
	animation: pulse-check 1.5s ease-in-out infinite;
}

.pinned-pr-popover {
	position: absolute;
	top: 100%;
	z-index: 200;
	/* Bridges the visual gap below the chip so the pointer can reach Unpin without the panel closing. */
	padding-top: var(--u-2);
	cursor: default;
}

.pinned-pr-popover-left {
	left: 0;
}

.pinned-pr-popover-right {
	right: 0;
}

.pinned-pr-popover-panel {
	width: 280px;
	padding: var(--u-3-5) var(--u-4);
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	box-shadow: var(--shadow-lg);
}

.pinned-pr-popover-title {
	line-height: 1.4;
}

.pinned-pr-popover-divider {
	height: 1px;
	background: var(--border);
}

.pinned-pr-unpin {
	padding: 0;
	border: none;
	background: none;
	color: var(--text-secondary);
	font-family: inherit;
}

.pinned-pr-unpin:hover {
	color: var(--text-primary);
}

/* The strip is a glance, not a control surface: drop it before the header's own controls start crowding. */
@media (max-width: 1000px) {
	.pinned-pr-bar {
		display: none;
	}
}
</style>
