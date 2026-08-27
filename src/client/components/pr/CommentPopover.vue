<template>
	<div class="comment-popover" ref="popoverEl" :style="positionStyle" @mousedown.stop>
		<!-- Submitted thread -->
		<div v-if="thread" class="cp-thread">
			<div v-for="c in thread.comments" :key="c.id" class="cp-comment">
				<div class="cp-comment-header u-flex u-items-center u-gap-1-5 u-mb-1-5">
					<span class="cp-type-badge" :class="'cp-type-' + getCommentType(c.body)">{{ typeLabel(getCommentType(c.body)) }}</span>
					<img :src="c.user.avatar_url" class="cp-avatar" />
					<span class="cp-author u-fs-12 u-fw-600 u-text-primary">{{ c.user.login }}</span>
					<span class="cp-time u-fs-11 u-text-tertiary u-ml-auto">{{ timeAgo(c.created_at) }}</span>
				</div>
				<div class="cp-body">
					<template v-for="(seg, si) in parseBody(c.body)" :key="si">
						<div v-if="seg.type === 'text' && seg.content.trim()" class="markdown-body cp-markdown" v-html="commentMarkdownHtml(seg.content)"></div>
						<div v-else-if="seg.type === 'suggestion'" class="cp-suggestion-block u-overflow-hidden u-my-1-5">
							<div class="cp-suggestion-header u-py-1 u-px-2 u-fs-11 u-fw-600 u-text-tertiary">Suggested change</div>
							<div class="cp-suggestion-diff u-fs-12 u-font-mono">
								<div class="cp-diff-del u-flex">
									<span class="cp-diff-sign u-flex-shrink-0 u-text-center u-fw-700">-</span>
									<pre>{{ lineContent }}</pre>
								</div>
								<div class="cp-diff-add u-flex">
									<span class="cp-diff-sign u-flex-shrink-0 u-text-center u-fw-700">+</span>
									<pre>{{ seg.code }}</pre>
								</div>
							</div>
							<button class="cp-apply-btn u-w-full" @click="applySuggestion(c)" :disabled="applyingId === c.node_id">
								{{ applyingId === c.node_id ? "Applying..." : "Apply suggestion" }}
							</button>
						</div>
					</template>
				</div>
			</div>

			<div class="cp-reply-section">
				<textarea v-model="replyBody" class="cp-textarea" placeholder="Reply..." rows="2" @keydown.meta.enter="submitReply" @keydown.ctrl.enter="submitReply"></textarea>
				<div class="cp-actions u-flex u-items-center u-justify-end u-gap-2 u-mt-1-5">
					<button
						class="pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
						:disabled="!replyBody.trim() || replySubmitting"
						@click="submitReply"
					>
						{{ replySubmitting ? "Sending..." : "Reply" }}
					</button>
					<button
						v-if="resolvableThreadNodeId"
						class="pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
						:disabled="resolveSubmitting"
						:title="threadIsResolved ? 'Mark this review thread as open again' : 'Mark this review thread as resolved'"
						@click="toggleThreadResolved"
					>
						<span v-if="resolveSubmitting" class="async-loader"></span>
						<template v-else>{{ threadIsResolved ? "Unresolve" : "Resolve" }}</template>
					</button>
				</div>
			</div>
		</div>

		<!-- Pending comment on this line -->
		<div v-if="pendingComment" class="cp-pending-section">
			<div class="cp-pending-label u-fs-10 u-fw-700 u-mb-1-5">Pending</div>
			<div class="cp-type-selector u-flex u-gap-1 u-mb-2">
				<button v-for="t in commentTypes" :key="t.value" class="cp-type-pill" :class="{ active : editType === t.value }" @click="editType = t.value">{{ t.icon }} {{ t.label }}</button>
			</div>
			<textarea v-model="editBody" class="cp-textarea" rows="3" @keydown.meta.enter="updatePending" @keydown.ctrl.enter="updatePending"></textarea>
			<div class="cp-toolbar u-flex u-gap-1 u-my-1">
				<button class="cp-toolbar-btn" @click="insertSuggestionTemplate(true)" title="Insert code suggestion">&lt;/&gt; Suggest</button>
			</div>
			<div class="cp-actions u-flex u-justify-end u-gap-1-5 u-mt-1-5">
				<button class="cp-btn cp-btn-danger" @click="$emit('remove-pending', pendingComment.id)">Delete</button>
				<button class="cp-btn cp-btn-primary" :disabled="!editBody.trim()" @click="updatePending">Update</button>
			</div>
		</div>

		<!-- New comment -->
		<div v-if="!thread && !pendingComment" class="cp-new-section">
			<div class="cp-type-selector u-flex u-gap-1 u-mb-2">
				<button v-for="t in commentTypes" :key="t.value" class="cp-type-pill" :class="{ active : newType === t.value }" @click="newType = t.value">{{ t.icon }} {{ t.label }}</button>
			</div>
			<textarea ref="newTextarea" v-model="newBody" class="cp-textarea" placeholder="Write a comment..." rows="3" @keydown.meta.enter="addComment" @keydown.ctrl.enter="addComment"></textarea>
			<div class="cp-toolbar u-flex u-gap-1 u-my-1">
				<button class="cp-toolbar-btn" @click="insertSuggestionTemplate(false)" title="Insert code suggestion">&lt;/&gt; Suggest</button>
			</div>
			<div class="cp-actions u-flex u-justify-end u-gap-1-5 u-mt-1-5">
				<button class="cp-btn cp-btn-secondary" @click="$emit('close')">Cancel</button>
				<button class="cp-btn cp-btn-primary" :disabled="!newBody.trim()" @click="addComment">Add comment</button>
			</div>
		</div>
	</div>
</template>

<script lang="ts">
import type { CommentType, PendingComment, ReviewComment }                 from '@/lib/api/githubClient';
import GitHubClient             from '@/lib/api/githubClient';
import { parseCommentType, parseSuggestionBlocks, stripCommentTypePrefix } from '@/lib/api/githubClient';
import { renderGithubMarkdown } from '@/lib/githubMarkdown';
import { timeAgo }              from '@/lib/utils';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

interface CommentThread {
	path: string;
	line: number;
	side: 'LEFT' | 'RIGHT';
	comments: ReviewComment[];
}

@Component({ emits : [ 'close', 'add-pending', 'remove-pending', 'edit-pending', 'comments-updated' ] })
export default class CommentPopover extends Vue {

	@Prop({ default : null }) readonly thread!: CommentThread | null;
	@Prop({ default : null }) readonly pendingComment!: PendingComment | null;
	@Prop({ required : true }) readonly path!: string;
	@Prop({ required : true }) readonly line!: number;
	@Prop({ required : true }) readonly side!: 'LEFT' | 'RIGHT';
	@Prop({ default : null }) readonly anchorRect!: DOMRect | null;
	@Prop({ default : '' }) readonly lineContent!: string;
	@Prop({ required : true }) readonly owner!: string;
	@Prop({ required : true }) readonly repo!: string;
	@Prop({ required : true }) readonly prNumber!: number;
	@Prop({ required : true }) readonly commitId!: string;

	readonly timeAgo = timeAgo;

	newBody                   = '';
	newType: CommentType      = 'suggestion';
	editBody                  = '';
	editType: CommentType     = 'suggestion';
	replyBody                 = '';
	replySubmitting           = false;
	resolveSubmitting         = false;
	applyingId: string | null = null;

	readonly commentTypes = [
		{ value : 'suggestion' as CommentType, icon : '\u{1F4A1}', label : 'Suggestion' },
		{ value : 'change-required' as CommentType, icon : '\u{26A0}\u{FE0F}', label : 'Change Required' },
		{ value : 'question' as CommentType, icon : '\u{2753}', label : 'Question' },
	];

	get positionStyle(): Record<string, string> {
		if (!this.anchorRect) {
			return {};
		}
		const top    = this.anchorRect.bottom + 4;
		const left   = Math.max(8, this.anchorRect.left - 100);
		const maxTop = window.innerHeight - 350;
		return { position : 'fixed', top : `${Math.min(top, maxTop)}px`, left : `${left}px`, zIndex : '200' };
	}

	get resolvableThreadNodeId(): string | null {
		return this.thread ? this.thread.comments.find(comment => comment.threadNodeId)?.threadNodeId ?? null : null;
	}

	get threadIsResolved(): boolean {
		return !!this.thread && !this.thread.comments.some(comment => comment.isResolved === false);
	}

	@Watch('pendingComment', { immediate : true })
	onPendingChanged() {
		if (this.pendingComment) {
			this.editBody = this.pendingComment.body;
			this.editType = this.pendingComment.commentType;
		}
	}

	mounted() {
		this.$nextTick(() => {
			const ta = this.$refs.newTextarea as HTMLTextAreaElement | undefined;
			if (ta) {
				ta.focus();
			}
		});
		document.addEventListener('keydown', this.onKeydown);
	}

	beforeUnmount() {
		document.removeEventListener('keydown', this.onKeydown);
	}

	onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			this.$emit('close');
		}
	}

	getCommentType(body: string): CommentType {
		return parseCommentType(body);
	}

	typeLabel(type: CommentType): string {
		if (type === 'change-required') {
			return '\u{26A0}\u{FE0F} Change Required';
		}
		return type === 'question' ? '\u{2753} Question' : '\u{1F4A1} Suggestion';
	}

	parseBody(body: string) {
		const stripped = stripCommentTypePrefix(body);
		return parseSuggestionBlocks(stripped);
	}

	commentMarkdownHtml(content: string): string {
		return renderGithubMarkdown(content);
	}

	addComment() {
		if (!this.newBody.trim()) {
			return;
		}
		const pending: PendingComment = {
			id          : crypto.randomUUID(),
			path        : this.path,
			line        : this.line,
			side        : this.side,
			body        : this.newBody.trim(),
			commentType : this.newType,
			lineContent : this.lineContent,
		};
		this.$emit('add-pending', pending);
		this.$emit('close');
	}

	updatePending() {
		if (!this.editBody.trim() || !this.pendingComment) {
			return;
		}
		const updated: PendingComment = { ...this.pendingComment, body : this.editBody.trim(), commentType : this.editType };
		this.$emit('edit-pending', updated);
		this.$emit('close');
	}

	async submitReply() {
		if (!this.replyBody.trim() || !this.thread || this.replySubmitting) {
			return;
		}
		this.replySubmitting = true;
		try {
			const rootId = this.thread.comments[0].id;
			await GitHubClient.replyToReviewComment(this.owner, this.repo, this.prNumber, rootId, this.replyBody.trim());
			this.replyBody = '';
			this.$emit('comments-updated');
		}
		catch (e: any) {
			console.error('Failed to reply:', e);
		}
		finally {
			this.replySubmitting = false;
		}
	}

	async toggleThreadResolved() {
		const threadNodeId = this.resolvableThreadNodeId;
		if (!threadNodeId || this.resolveSubmitting) {
			return;
		}
		this.resolveSubmitting = true;
		try {
			await GitHubClient.setReviewThreadResolved(threadNodeId, !this.threadIsResolved);
			this.$emit('comments-updated');
		}
		catch {
			/* Keep the popover open so the action can be retried. */
		}
		finally {
			this.resolveSubmitting = false;
		}
	}

	async applySuggestion(comment: ReviewComment) {
		this.applyingId = comment.node_id;
		try {
			await GitHubClient.applySuggestion(comment.node_id);
			this.$emit('comments-updated');
		}
		catch (e: any) {
			console.error('Failed to apply suggestion:', e);
		}
		finally {
			this.applyingId = null;
		}
	}

	insertSuggestionTemplate(isEdit: boolean) {
		const template = `\`\`\`suggestion\n${this.lineContent}\n\`\`\``;
		if (isEdit) {
			this.editBody = this.editBody ? `${this.editBody}\n${template}` : template;
		}
		else {
			this.newBody = this.newBody ? `${this.newBody}\n${template}` : template;
		}
	}

}
</script>

<style>
.comment-popover {
	width        : 400px;
	max-height   : 420px;
	overflow-y   : auto;
	background   : var(--bg-secondary);
	border       : 1px solid var(--border);
	border-radius: var(--radius-md);
	box-shadow   : var(--shadow-lg);
	padding      : 0;
	font-size    : 13px;
}

.cp-thread {
	border-bottom: 1px solid var(--border);
}

.cp-comment {
	padding: 10px 12px;
	border-bottom: 1px solid var(--border);
}

.cp-comment:last-child {
	border-bottom: none;
}

.cp-avatar {
	width: 18px;
	height: 18px;
	border-radius: 50%;
}

.cp-type-badge {
	font-size: 10px;
	font-weight: 600;
	padding: 1px 6px;
	border-radius: 10px;
	white-space: nowrap;
}

.cp-type-suggestion {
	background: var(--accent-purple-bg);
	color: var(--accent-purple);
}
.cp-type-change-required {
	background: var(--chip-orange-bg);
	color: var(--accent-orange);
}
.cp-type-question {
	background: var(--chip-blue-bg);
	color: var(--accent-blue);
}

.cp-body {
	color: var(--text-secondary);
	line-height: 1.5;
}

.cp-markdown {
	font-size: 13px;
	color: var(--text-secondary);
	line-height: 1.5;
	word-break: break-word;

	&:first-child {
		margin-top: 0;
	}
	&:last-child {
		margin-bottom: 0;
	}

	p,
	ul,
	ol,
	pre,
	blockquote,
	table {
		margin-bottom: 6px;
	}
	p:last-child,
	ul:last-child,
	ol:last-child,
	pre:last-child,
	blockquote:last-child,
	table:last-child {
		margin-bottom: 0;
	}
}

.cp-suggestion-block {
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
}

.cp-suggestion-header {
	background: var(--bg-tertiary);
	border-bottom: 1px solid var(--border);
}

.cp-diff-del {
	background: var(--diff-del-bg);
	color: var(--text-primary);

	pre {
		margin: 0;
		padding: 2px 8px;
		white-space: pre-wrap;
		word-break: break-all;
		flex: 1;
		font: inherit;
	}
}

.cp-diff-add {
	background: var(--diff-add-bg);
	color: var(--text-primary);

	pre {
		margin: 0;
		padding: 2px 8px;
		white-space: pre-wrap;
		word-break: break-all;
		flex: 1;
		font: inherit;
	}
}

.cp-diff-sign {
	width: 20px;
	padding: 2px 0;
}

.cp-diff-del .cp-diff-sign {
	color: var(--accent-red);
}
.cp-diff-add .cp-diff-sign {
	color: var(--accent-green);
}

.cp-apply-btn {
	padding    : var(--u-1);
	border     : none;
	border-top : 1px solid var(--border);
	background : var(--bg-tertiary);
	color      : var(--accent-green);
	font-size  : 11px;
	font-weight: 600;
	cursor     : pointer;
	font-family: inherit;
	transition : background var(--transition);

	&:hover:not(:disabled) {
		background: var(--bg-secondary);
	}
	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.cp-reply-section,
.cp-pending-section,
.cp-new-section {
	padding: 10px 12px;
}

.cp-pending-section {
	border-top: 1px solid var(--border);
}

.cp-pending-label {
	text-transform: uppercase;
	letter-spacing: 0.5px;
	color: var(--accent-orange);
}

.cp-type-pill {
	padding: 3px 8px;
	border: 1px solid var(--border);
	border-radius: 12px;
	background: transparent;
	color: var(--text-tertiary);
	font-size: 11px;
	font-family: inherit;
	cursor: pointer;
	transition: all var(--transition);
	white-space: nowrap;

	&:hover {
		border-color: var(--border-hover);
		color: var(--text-secondary);
	}
	&.active {
		border-color: var(--accent-blue);
		color: var(--accent-blue);
		background: var(--accent-blue-muted);
	}
}

.cp-textarea {
	width: 100%;
	min-height: 48px;
	padding: 6px 8px;
	background: var(--bg-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	color: var(--text-primary);
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
	font-size: 12px;
	line-height: 1.4;
	resize: vertical;

	&:focus {
		outline: none;
		border-color: var(--accent-blue);
	}
	&::placeholder {
		color: var(--text-tertiary);
	}
}

.cp-toolbar-btn {
	padding: 2px 8px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-tertiary);
	color: var(--text-secondary);
	font-size: 11px;
	font-family: inherit;
	cursor: pointer;
	transition: all var(--transition);

	&:hover {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}
}

.cp-btn {
	padding: 4px 12px;
	border: none;
	border-radius: var(--radius-sm);
	font-size: 12px;
	font-weight: 600;
	font-family: inherit;
	cursor: pointer;
	transition: all var(--transition);

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}
}

.cp-btn-primary {
	background: var(--btn-primary-bg);
	color: var(--btn-primary-fg);

	&:hover:not(:disabled) {
		background: var(--btn-primary-hover);
	}
}

.cp-btn-secondary {
	background: var(--btn-secondary-bg);
	color: var(--text-secondary);

	&:hover:not(:disabled) {
		background: var(--btn-secondary-hover);
		color: var(--text-primary);
	}
}

.cp-btn-danger {
	background: var(--danger-btn-bg);
	color: var(--accent-red);

	&:hover:not(:disabled) {
		background: var(--danger-btn-bg-hover);
	}
}
</style>
