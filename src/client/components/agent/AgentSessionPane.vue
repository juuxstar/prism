<template>
	<div class="agent-pane u-flex u-flex-col u-min-h-0">
		<div class="agent-pane-toolbar u-flex u-items-center u-gap-3 u-px-4 u-py-2 u-flex-shrink-0">
			<select
				v-if="sessions.length"
				class="agent-pane-session-select u-fs-12"
				:value="sessionId"
				aria-label="Claude session"
				@change="pickSession(($event.target as HTMLSelectElement).value)"
			>
				<option v-for="session in sessions" :key="session.id" :value="session.id">
					{{ session.title }} · {{ timeAgo(session.updatedAt) }}
				</option>
			</select>
			<span v-if="sessionId" class="agent-pane-status u-inline-flex u-items-center u-gap-1-5 u-fs-12" :class="`agent-pane-status-${statusTone}`">
				<span class="agent-pane-status-dot" aria-hidden="true"></span>
				<span>{{ statusLabel }}</span>
			</span>
			<span class="u-flex-1"></span>
			<span class="u-fs-11 u-text-tertiary" title="PRism shows this session as Claude Code writes it; send messages from the Claude app">Read-only</span>
		</div>

		<div ref="scroller" class="agent-pane-scroll u-flex-1 u-min-h-0 u-overflow-y-auto" @scroll="onScroll">
			<div class="agent-pane-thread u-flex u-flex-col u-gap-3 u-px-4 u-py-4 u-m-auto">
				<div v-if="sessionsError" class="agent-pane-empty u-text-center u-fs-13 u-text-secondary">{{ sessionsError }}</div>
				<div v-else-if="sessionsLoading" class="agent-pane-empty u-text-center u-fs-13 u-text-secondary">Looking for Claude sessions…</div>
				<div v-else-if="!sessions.length" class="agent-pane-empty u-text-center u-fs-13 u-text-secondary">
					No Claude Code sessions have run in this worktree yet.
				</div>

				<div v-if="omittedCount" class="agent-msg-omitted u-text-center u-fs-12 u-text-tertiary">
					{{ omittedCount }} earlier {{ omittedCount === 1 ? 'message' : 'messages' }} not shown
				</div>

				<template v-for="item in items" :key="item.id">
					<div v-if="item.kind === 'prompt'" class="agent-msg-prompt u-fs-13">{{ item.text }}</div>
					<div v-else-if="item.kind === 'text'" class="agent-msg-text markdown-body u-fs-14" v-html="renderMarkdown(item)"></div>
					<div v-else-if="item.kind === 'notice'" class="agent-msg-notice u-fs-12 u-text-tertiary">{{ item.text }}</div>
					<details v-else-if="item.kind === 'tool'" class="agent-tool u-fs-12" :class="toolStateClass(item.toolUseId)">
						<summary class="agent-tool-summary u-flex u-items-center u-gap-2 u-cursor-pointer">
							<span class="agent-tool-dot u-flex-shrink-0" aria-hidden="true"></span>
							<span class="agent-tool-name u-fw-600 u-flex-shrink-0">{{ item.name }}</span>
							<span class="agent-tool-detail u-truncate u-text-secondary">{{ item.summary }}</span>
						</summary>
						<pre class="agent-tool-block">{{ item.input }}</pre>
						<pre v-if="results[item.toolUseId]" class="agent-tool-block agent-tool-result">{{ results[item.toolUseId].text || '(no output)' }}</pre>
					</details>
				</template>

				<div v-if="working" class="agent-msg-working u-fs-12 u-text-secondary">Claude is working…</div>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import type { AgentMessage, AgentSessionSummary, AgentToolResult, AgentTranscriptBatch } from '@/lib/api/agentClient';
import { fetchAgentSessions, followAgentSession } from '@/lib/api/agentClient';
import { renderGithubMarkdown } from '@/lib/githubMarkdown';
import { timeAgo }              from '@/lib/utils';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

/** New sessions started in the worktree show up in the picker within this long. */
const SESSION_POLL_MS = 15_000;
/** A turn left unanswered for longer than this was most likely interrupted rather than still running. */
const WORKING_STALE_MS = 2 * 60_000;
/** How close to the bottom still counts as following along, so new messages keep scrolling into view. */
const STICK_TO_BOTTOM_PX = 48;

/**
 * A read-only mirror of the Claude Code sessions run in a worktree, live as Claude Code writes them. It follows
 * the newest session until one is picked, so starting a new session in the Claude app brings it up here.
 */
@Component
export default class AgentSessionPane extends Vue {

	@Prop({ required : true }) readonly worktreePath!: string;

	sessions: AgentSessionSummary[]          = [];
	sessionsLoading                          = true;
	sessionsError                            = '';
	sessionId                                = '';
	messages: AgentMessage[]                 = [];
	results: Record<string, AgentToolResult> = {};
	omittedCount = 0;
	updatedAt    = '';
	connection: 'connecting' | 'live' | 'retrying' = 'connecting';
	now                                            = Date.now();

	_pickedByUser                       = false;
	_stopFollowing: (() => void) | null = null;
	_pollTimer: number | null           = null;
	_stickToBottom                      = true;
	_markdownCache                      = new Map<string, string>();

	/** Tool results are shown inside the call they answer, not as messages of their own. */
	get items(): AgentMessage[] {
		return this.messages.filter(message => message.kind !== 'result');
	}

	/** The last turn is still open: a prompt with no reply yet, or a tool call with no result. */
	get working(): boolean {
		const last = this.items[this.items.length - 1];
		if (!last || !this.updatedAt || this.now - Date.parse(this.updatedAt) > WORKING_STALE_MS) {
			return false;
		}
		return last.kind === 'prompt' || (last.kind === 'tool' && !this.results[last.toolUseId]);
	}

	get statusTone(): string {
		if (this.connection !== 'live') {
			return 'muted';
		}
		return this.working ? 'working' : 'live';
	}

	get statusLabel(): string {
		if (this.connection === 'connecting') {
			return 'Connecting';
		}
		if (this.connection === 'retrying') {
			return 'Reconnecting';
		}
		return this.updatedAt ? `Updated ${timeAgo(this.updatedAt)}` : 'Live';
	}

	mounted() {
		void this.loadSessions();
		this._pollTimer = window.setInterval(() => {
			this.now = Date.now();
			void this.loadSessions();
		}, SESSION_POLL_MS);
	}

	beforeUnmount() {
		if (this._pollTimer !== null) {
			window.clearInterval(this._pollTimer);
			this._pollTimer = null;
		}
		this.stopFollowing();
	}

	@Watch('worktreePath')
	onWorktreeChange() {
		this._pickedByUser = false;
		this.sessions      = [];
		this.sessionId     = '';
		this.stopFollowing();
		this.sessionsLoading = true;
		void this.loadSessions();
	}

	async loadSessions(): Promise<void> {
		try {
			this.sessions      = await fetchAgentSessions(this.worktreePath);
			this.sessionsError = '';
		}
		catch (error: any) {
			this.sessionsError = error.message || 'Could not read Claude sessions';
		}
		finally {
			this.sessionsLoading = false;
		}

		const newest = this.sessions[0]?.id || '';
		const kept   = this.sessions.some(session => session.id === this.sessionId);
		if (!kept || (!this._pickedByUser && newest !== this.sessionId)) {
			this.follow(newest);
		}
	}

	pickSession(sessionId: string): void {
		this._pickedByUser = sessionId !== this.sessions[0]?.id;
		this.follow(sessionId);
	}

	timeAgo(dateString: string): string {
		return timeAgo(dateString);
	}

	renderMarkdown(message: AgentMessage): string {
		let html = this._markdownCache.get(message.id);
		if (html === undefined) {
			html = 'text' in message ? renderGithubMarkdown(message.text) : '';
			this._markdownCache.set(message.id, html);
		}
		return html;
	}

	toolStateClass(toolUseId: string): string {
		const result = this.results[toolUseId];
		if (!result) {
			return 'agent-tool-pending';
		}
		return result.isError ? 'agent-tool-error' : 'agent-tool-done';
	}

	onScroll(): void {
		const scroller = this.$refs.scroller as HTMLElement | undefined;
		if (scroller) {
			this._stickToBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < STICK_TO_BOTTOM_PX;
		}
	}

	private follow(sessionId: string): void {
		if (sessionId === this.sessionId && this._stopFollowing) {
			return;
		}
		this.stopFollowing();
		this.sessionId      = sessionId;
		this.messages       = [];
		this.results        = {};
		this.omittedCount   = 0;
		this.updatedAt      = '';
		this._stickToBottom = true;
		this._markdownCache.clear();
		if (!sessionId) {
			return;
		}
		this.connection     = 'connecting';
		this._stopFollowing = followAgentSession(this.worktreePath, sessionId, batch => this.applyBatch(batch), () => {
			this.connection = 'retrying';
		});
	}

	private stopFollowing(): void {
		this._stopFollowing?.();
		this._stopFollowing = null;
	}

	private applyBatch(batch: AgentTranscriptBatch): void {
		this.connection = 'live';
		this.now        = Date.now();
		this.updatedAt  = batch.updatedAt;
		if (batch.reset) {
			this.messages     = [];
			this.results      = {};
			this.omittedCount = batch.omittedCount || 0;
			this._markdownCache.clear();
		}
		const results = { ...this.results };
		for (const message of batch.messages) {
			if (message.kind === 'result') {
				results[message.toolUseId] = message;
			}
		}
		this.results  = results;
		this.messages = batch.reset ? batch.messages : [ ...this.messages, ...batch.messages ];
		if (this._stickToBottom) {
			void this.$nextTick(() => this.scrollToBottom());
		}
	}

	private scrollToBottom(): void {
		const scroller = this.$refs.scroller as HTMLElement | undefined;
		if (scroller) {
			scroller.scrollTop = scroller.scrollHeight;
		}
	}

}
</script>

<style>
@import "@/styles/markdown-body.css";

.agent-pane-toolbar {
	border-bottom: 1px solid var(--border);
	background: var(--bg-secondary);
}

.agent-pane-session-select {
	max-width: 420px;
	padding: 5px 28px 5px 10px;
	background: var(--bg-primary);
	color: var(--text-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-family: inherit;
	cursor: pointer;
	appearance: none;
	background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 16 16' fill='%238b949e'%3E%3Cpath d='M4.427 7.427l3.396 3.396a.25.25 0 0 0 .354 0l3.396-3.396A.25.25 0 0 0 11.396 7H4.604a.25.25 0 0 0-.177.427Z'/%3E%3C/svg%3E");
	background-repeat: no-repeat;
	background-position: right 8px center;
	text-overflow: ellipsis;

	&:hover {
		border-color: var(--border-hover);
	}
}

.agent-pane-status {
	color: var(--text-secondary);
}

.agent-pane-status-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: var(--text-tertiary);
}

.agent-pane-status-live .agent-pane-status-dot {
	background: var(--accent-green);
}

.agent-pane-status-working .agent-pane-status-dot {
	background: var(--accent-orange);
	animation: agent-pulse 1.2s ease-in-out infinite;
}

.agent-pane-thread {
	max-width: 900px;
	width: 100%;
	box-sizing: border-box;
}

.agent-pane-empty {
	padding: 48px 0;
}

.agent-msg-prompt {
	align-self: flex-end;
	max-width: 80%;
	padding: 8px 12px;
	border-radius: var(--radius-lg);
	background: var(--bg-tertiary);
	color: var(--text-primary);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.agent-msg-text {
	color: var(--text-primary);
	line-height: 1.55;

	> :last-child {
		margin-bottom: 0;
	}
}

.agent-msg-notice,
.agent-msg-omitted {
	padding: 2px 0;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.agent-msg-working {
	animation: agent-pulse 1.2s ease-in-out infinite;
}

.agent-tool {
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-secondary);

	&[open] .agent-tool-summary {
		border-bottom: 1px solid var(--border);
	}
}

.agent-tool-summary {
	padding: 5px 10px;
	list-style: none;
	min-width: 0;

	&::-webkit-details-marker {
		display: none;
	}
}

.agent-tool-name {
	color: var(--text-primary);
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
}

.agent-tool-detail {
	min-width: 0;
}

.agent-tool-dot {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--accent-green);
}

.agent-tool-pending .agent-tool-dot {
	background: var(--accent-orange);
}

.agent-tool-error .agent-tool-dot {
	background: var(--accent-red);
}

.agent-tool-block {
	margin: 0;
	padding: 8px 10px;
	max-height: 320px;
	overflow: auto;
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
	font-size: 12px;
	line-height: 1.45;
	color: var(--text-secondary);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}

.agent-tool-result {
	border-top: 1px dashed var(--border);
}

.agent-tool-error .agent-tool-result {
	color: var(--accent-red);
}

@keyframes agent-pulse {
	50% {
		opacity: 0.45;
	}
}
</style>
