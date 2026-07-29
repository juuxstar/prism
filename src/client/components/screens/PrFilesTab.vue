<template>
	<div class="pr-files-tab u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden" :style="{ '--tab-size' : tabSize, '--diff-font-size' : diffFontSize + 'px' }">
		<div v-if="filesLoading" class="pr-files-skeleton u-flex u-flex-col u-flex-1 u-min-h-0" aria-busy="true" aria-label="Loading files">
			<div class="pr-files-nav-bar pr-files-skeleton-nav u-flex u-items-center u-gap-2 u-fs-13 u-flex-shrink-0">
				<span class="skeleton-block pr-files-skeleton-nav-btn"></span>
				<span class="skeleton-block pr-files-skeleton-nav-btn"></span>
				<span class="skeleton-block pr-files-skeleton-viewed"></span>
				<span class="skeleton-block pr-files-skeleton-dropdown u-flex-1 u-min-w-0"></span>
				<span class="skeleton-block pr-files-skeleton-viewed"></span>
				<span class="skeleton-block pr-files-skeleton-nav-btn"></span>
				<span class="skeleton-block pr-files-skeleton-nav-btn"></span>
				<span class="skeleton-line pr-files-skeleton-counter"></span>
				<span class="skeleton-line pr-files-skeleton-stats"></span>
			</div>

			<div class="pr-diff-viewer pr-diff-viewer-split pr-files-skeleton-viewer">
				<div class="pr-diff-split pr-files-skeleton-split">
					<div class="pr-diff-panel pr-diff-panel-left u-flex-grow-1 u-min-w-0">
						<div v-for="idx in 22" :key="'left-' + idx" class="pr-files-skeleton-row" :class="skeletonRowClass(idx)">
							<span class="skeleton-line pr-files-skeleton-gutter"></span>
							<span class="skeleton-line pr-files-skeleton-code" :class="skeletonCodeClass(idx)"></span>
						</div>
					</div>
					<div class="pr-diff-connector-col u-flex-shrink-0 pr-files-skeleton-connector">
						<span v-for="idx in 6" :key="'connector-' + idx" class="skeleton-block pr-files-skeleton-connector-band" :style="{ top : `${idx * 13 + 4}%` }"></span>
					</div>
					<div class="pr-diff-panel pr-diff-panel-right u-flex-grow-1 u-min-w-0">
						<div v-for="idx in 22" :key="'right-' + idx" class="pr-files-skeleton-row" :class="skeletonRowClass(idx + 2)">
							<span class="skeleton-line pr-files-skeleton-gutter"></span>
							<span class="skeleton-line pr-files-skeleton-code" :class="skeletonCodeClass(idx + 1)"></span>
						</div>
					</div>
					<div class="pr-files-skeleton-minimap u-flex-shrink-0">
						<span v-for="idx in 14" :key="'map-' + idx" class="skeleton-block pr-files-skeleton-minimap-line" :class="skeletonMinimapClass(idx)"></span>
					</div>
				</div>
			</div>
		</div>

		<template v-else-if="files.length">
			<pr-files-nav-bar v-model:current-index="currentIndex" :files="files" :viewed-files="viewedFiles" :show-viewed-controls="viewedEnabled" @toggle-viewed="toggleViewed" />

			<div v-if="contentLoading" class="pr-diff-content-loading"><span class="async-loader"></span> Loading file contents...</div>

			<div v-else-if="hasMediaContent" class="pr-diff-viewer" :class="{ 'pr-diff-viewer-split': !isAddedOrRemoved }">
				<pr-media-viewer
					:split="!isAddedOrRemoved"
					:left-src="baseMediaUrl"
					:right-src="headMediaUrl"
					:left-mime="baseMediaMime"
					:right-mime="headMediaMime"
					:single-src="singleMediaUrl"
					:single-mime="singleMediaMime"
					left-label="Before"
					right-label="After"
				/>
			</div>

			<div v-else-if="isAddedMarkdownFile" class="pr-diff-viewer pr-diff-viewer-split">
				<div class="pr-diff-markdown-split">
					<div class="pr-diff-panel pr-diff-panel-right pr-diff-markdown-source u-min-w-0">
						<pr-diff-table
							:lines="singlePanelLines"
							side="RIGHT"
							:has-any-comment-at="hasAnyCommentAt"
							:comment-dot-class="commentDotClass"
							@gutter-click="onGutterClick"
						/>
					</div>
					<div class="pr-diff-divider u-flex-shrink-0"></div>
					<div class="pr-diff-markdown-preview-pane u-min-w-0">
						<div class="markdown-body pr-diff-markdown-preview" v-html="renderedMarkdown"></div>
					</div>
				</div>
			</div>

			<div v-else-if="hasFullContent" class="pr-diff-viewer" :class="{ 'pr-diff-viewer-split' : !isAddedOrRemoved, 'pr-diff-viewer-with-minimap' : isAddedOrRemoved }">
				<template v-if="isAddedOrRemoved">
					<div class="pr-diff-panel-full u-flex-grow-1 u-min-w-0" :class="{ 'pr-diff-panel-full-del' : currentFile.status === 'removed' }">
						<pr-diff-table :lines="singlePanelLines" :side="singlePanelSide" :has-any-comment-at="hasAnyCommentAt" :comment-dot-class="commentDotClass" @gutter-click="onGutterClick" />
					</div>
					<diff-minimap
						class="diff-minimap-sticky"
						:left-lines="minimapLeftLines"
						:right-lines="minimapRightLines"
						:viewport-height="0"
						:scroll-top="0"
						:total-content-height="minimapTotalHeight"
					/>
				</template>

				<template v-else>
					<div class="pr-diff-split" @wheel.prevent="onWheel">
						<div class="pr-diff-panel pr-diff-panel-left u-flex-grow-1 u-min-w-0" ref="leftPanel">
							<pr-diff-table
								:lines="leftLines"
								side="LEFT"
								:table-style="{ transform : `translateY(-${leftScrollTop}px)` }"
								:has-any-comment-at="hasAnyCommentAt"
								:comment-dot-class="commentDotClass"
								@gutter-click="onGutterClick"
							/>
						</div>
						<div class="pr-diff-connector-col u-flex-shrink-0" ref="connectorCol">
							<svg :width="48" :height="viewportHeight">
								<path v-for="(d, i) in connectorPaths" :key="i" :d="d" fill="var(--diff-minimap-faint)" stroke="var(--border)" stroke-width="0.5" />
							</svg>
						</div>
						<div class="pr-diff-panel pr-diff-panel-right u-flex-grow-1 u-min-w-0" ref="rightPanel">
							<pr-diff-table
								:lines="rightLines"
								side="RIGHT"
								:table-style="{ transform : `translateY(-${rightScrollTop}px)` }"
								:has-any-comment-at="hasAnyCommentAt"
								:comment-dot-class="commentDotClass"
								@gutter-click="onGutterClick"
							/>
						</div>
						<diff-minimap
							:left-lines="minimapLeftLines"
							:right-lines="minimapRightLines"
							:viewport-height="viewportHeight"
							:scroll-top="minimapScrollTop"
							:total-content-height="minimapTotalHeight"
							@scroll-to="onMinimapScrollTo"
						/>
					</div>
				</template>
			</div>

			<div v-else-if="currentFile.patch" class="pr-diff-viewer" :class="{ 'pr-diff-viewer-with-minimap' : isAddedOrRemoved }">
				<template v-if="isAddedOrRemoved">
					<div class="pr-diff-panel-full u-flex-grow-1 u-min-w-0" :class="{ 'pr-diff-panel-full-del' : currentFile.status === 'removed' }">
						<pr-diff-table
							:lines="patchSinglePanelLines"
							:side="singlePanelSide"
							:has-any-comment-at="hasAnyCommentAt"
							:comment-dot-class="commentDotClass"
							@gutter-click="onGutterClick"
						/>
					</div>
					<diff-minimap
						class="diff-minimap-sticky"
						:left-lines="minimapLeftLines"
						:right-lines="minimapRightLines"
						:viewport-height="0"
						:scroll-top="0"
						:total-content-height="minimapTotalHeight"
					/>
				</template>
				<template v-else>
					<div class="pr-diff-split">
						<div class="pr-diff-panel pr-diff-panel-left u-flex-grow-1 u-min-w-0">
							<pr-diff-table :lines="parsedPatch.left" side="LEFT" :has-any-comment-at="hasAnyCommentAt" :comment-dot-class="commentDotClass" @gutter-click="onGutterClick" />
						</div>
						<div class="pr-diff-divider u-flex-shrink-0"></div>
						<div class="pr-diff-panel pr-diff-panel-right u-flex-grow-1 u-min-w-0">
							<pr-diff-table :lines="parsedPatch.right" side="RIGHT" :has-any-comment-at="hasAnyCommentAt" :comment-dot-class="commentDotClass" @gutter-click="onGutterClick" />
						</div>
						<diff-minimap :left-lines="minimapLeftLines" :right-lines="minimapRightLines" :viewport-height="0" :scroll-top="0" :total-content-height="minimapTotalHeight" />
					</div>
				</template>
			</div>

			<div v-else class="pr-diff-binary">Binary file not shown</div>
		</template>

		<p v-else class="pr-files-empty">{{ emptyMessage }}</p>

		<comment-popover
			v-if="reviewEnabled && activeComment"
			:thread="activeThread"
			:pending-comment="activePending"
			:path="activeComment.path"
			:line="activeComment.line"
			:side="activeComment.side"
			:anchor-rect="activeComment.rect"
			:line-content="activeComment.lineContent"
			:owner="owner"
			:repo="repo"
			:pr-number="prNumber"
			:commit-id="commitId"
			@close="closeComment"
			@add-pending="onPopoverAddPending"
			@remove-pending="onPopoverRemovePending"
			@edit-pending="onPopoverEditPending"
			@comments-updated="onPopoverCommentsUpdated"
		/>
	</div>
</template>

<script lang="ts">
import DiffMinimap                            from '@/components/pr/DiffMinimap.vue';
import PrDiffTable                            from '@/components/pr/PrDiffTable.vue';
import PrFilesNavBar                          from '@/components/pr/PrFilesNavBar.vue';
import PrMediaViewer                          from '@/components/pr/PrMediaViewer.vue';
import type { PendingComment, PRFile, ReviewComment } from '@/lib/api/githubClient';
import GitHubClient                           from '@/lib/api/githubClient';
import { parseCommentType }                   from '@/lib/api/githubClient';
import { buildConnectorPaths, buildScrollSegmentsFromState, maxVirtualScrollTop, resolveScroll } from '@/lib/api/usePrDiffVirtualScroll';
import { buildSplitLinesForFile, parsePatch } from '@/lib/diff/diffLineBuilder';
import { computeCommonBlocks }                from '@/lib/diff/patchDiff';
import type { CommentThread, DiffLine, ScrollSegment } from '@/lib/diff/prDiffTypes';
import { renderGithubMarkdown }              from '@/lib/githubMarkdown';
import { base64ToDataUrl, isRenderableMediaPaths, mediaMimeType } from '@/lib/mediaFiles';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

export interface ReviewThreadFocusRequest { path: string; line: number; side: 'LEFT' | 'RIGHT'; nonce: number }
export interface PrFileContent {
	base: string | null;
	head: string | null;
	encoding?: 'text' | 'base64';
}
export type PrFileContentLoader = (file: PRFile) => Promise<PrFileContent>;

@Component({ components : { DiffMinimap, PrDiffTable, PrFilesNavBar, PrMediaViewer }, emits : [ 'update:fileIndex', 'update:viewed', 'all-viewed', 'add-pending', 'remove-pending', 'edit-pending', 'comments-updated', 'thread-focus-handled' ] })
export default class PrFilesTab extends Vue {

	@Prop({ required : true }) readonly files!: PRFile[];
	@Prop({ required : true }) readonly filesLoading!: boolean;
	@Prop({ required : true }) readonly owner!: string;
	@Prop({ required : true }) readonly repo!: string;
	@Prop({ required : true }) readonly baseRef!: string;
	@Prop({ required : true }) readonly headRef!: string;
	@Prop({ default : 0 }) readonly initialFileIndex!: number;
	@Prop({ required : true }) readonly prTitle!: string;
	@Prop({ required : true }) readonly prNumber!: number;
	@Prop({ required : true }) readonly prAuthorLogin!: string;
	@Prop({ default : 4 }) readonly tabSize!: number;
	@Prop({ default : 12 }) readonly diffFontSize!: number;
	@Prop({ default : () => ({}) }) readonly viewedFiles!: Record<string, string>;
	@Prop({ default : '' }) readonly prNodeId!: string;
	@Prop({ default : () => [] }) readonly reviewComments!: ReviewComment[];
	@Prop({ default : () => [] }) readonly pendingComments!: PendingComment[];
	@Prop({ default : '' }) readonly commitId!: string;
	@Prop({ default : true }) readonly reviewEnabled!: boolean;
	@Prop({ default : true }) readonly viewedEnabled!: boolean;
	@Prop({ default : 'No files changed' }) readonly emptyMessage!: string;
	@Prop({ default : null }) readonly fileContentLoader!: PrFileContentLoader | null;
	/** When present, selects the file and scrolls to the line — used from Overview navigation. */
	@Prop({ default : null }) readonly threadFocusRequest!: ReviewThreadFocusRequest | null;

	currentIndex = 0;
	baseContent: string | null = null;
	headContent: string | null = null;
	contentEncoding: 'text' | 'base64' = 'text';
	contentLoading = false;
	leftScrollTop = 0;
	rightScrollTop = 0;
	viewportHeight = 0;
	lineHeight = 16.8;
	virtualScrollTop = 0;

	activeComment: { path: string; line: number; side: 'LEFT' | 'RIGHT'; rect: DOMRect; lineContent: string } | null = null;

	private _contentCache = new Map<string, PrFileContent>();
	private _loadId = 0;
	private _resizeHandler = () => {
		this.measureViewportHeight();
		this.applyVirtualScroll();
	};

	get currentFile(): PRFile {
		return this.files[this.currentIndex] || this.files[0];
	}

	skeletonRowClass(idx: number): string {
		if (idx % 9 === 0) {
			return 'is-hunk';
		}
		if (idx % 5 === 0) {
			return 'is-added';
		}
		if (idx % 7 === 0) {
			return 'is-removed';
		}
		return '';
	}

	skeletonCodeClass(idx: number): string {
		if (idx % 6 === 0) {
			return 'short';
		}
		if (idx % 4 === 0) {
			return 'mid';
		}
		return '';
	}

	skeletonMinimapClass(idx: number): string {
		if (idx % 5 === 0) {
			return 'is-added';
		}
		if (idx % 7 === 0) {
			return 'is-removed';
		}
		return '';
	}

	/** Next file index after `idx0` (wrapping) that is not VIEWED, or -1 if none. */
	private findNextUnviewedFileIndex(idx0: number): number {
		const len = this.files.length;
		if (len < 2) {
			return -1;
		}
		for (let offset = 1; offset < len; offset++) {
			const idx = (idx0 + offset) % len;
			if (this.viewedFiles[this.files[idx].filename] !== 'VIEWED') {
				return idx;
			}
		}
		return -1;
	}

	async toggleViewed() {
		if (!this.viewedEnabled) {
			return;
		}
		const file = this.currentFile;
		if (!file) {
			return;
		}
		if (this.reviewEnabled && !this.prNodeId) {
			return;
		}
		const filename    = file.filename;
		const wasViewed   = this.viewedFiles[filename] === 'VIEWED';
		const newState    = wasViewed ? 'UNVIEWED' : 'VIEWED';
		const indexBefore = this.currentIndex;
		this.$emit('update:viewed', { filename, state : newState });
		if (!this.reviewEnabled) {
			if (!wasViewed) {
				this.$nextTick(() => {
					const next = this.findNextUnviewedFileIndex(indexBefore);
					if (next !== -1) {
						this.currentIndex = next;
					}
					else {
						this.$emit('all-viewed');
					}
				});
			}
			return;
		}
		try {
			if (wasViewed) {
				await GitHubClient.unmarkFileAsViewed(this.prNodeId, filename);
			}
			else {
				await GitHubClient.markFileAsViewed(this.prNodeId, filename);
			}
		}
		catch {
			this.$emit('update:viewed', { filename, state : wasViewed ? 'VIEWED' : 'UNVIEWED' });
			return;
		}
		if (!wasViewed) {
			this.$nextTick(() => {
				const next = this.findNextUnviewedFileIndex(indexBefore);
				if (next !== -1) {
					this.currentIndex = next;
				}
				else {
					this.$emit('all-viewed');
				}
			});
		}
	}

	get isAddedOrRemoved(): boolean {
		return this.currentFile?.status === 'added' || this.currentFile?.status === 'removed';
	}

	get isAddedMarkdownFile(): boolean {
		return this.currentFile?.status === 'added'
			&& /\.md$/i.test(this.currentFile.filename)
			&& this.headContent !== null;
	}

	get renderedMarkdown(): string {
		return renderGithubMarkdown(this.headContent ?? '');
	}

	get isMediaFile(): boolean {
		const file = this.currentFile;
		if (!file) {
			return false;
		}
		return isRenderableMediaPaths(file.filename, file.previous_filename);
	}

	get hasMediaContent(): boolean {
		if (!this.isMediaFile || this.contentEncoding !== 'base64') {
			return false;
		}
		const file = this.currentFile;
		if (!file) {
			return false;
		}
		if (file.status === 'added') {
			return this.headContent !== null;
		}
		if (file.status === 'removed') {
			return this.baseContent !== null;
		}
		return this.baseContent !== null || this.headContent !== null;
	}

	get baseMediaMime(): string | null {
		const path = this.currentFile?.previous_filename || this.currentFile?.filename;
		return path ? mediaMimeType(path) : null;
	}

	get headMediaMime(): string | null {
		const path = this.currentFile?.filename;
		return path ? mediaMimeType(path) : null;
	}

	get baseMediaUrl(): string | null {
		if (!this.baseContent || !this.baseMediaMime) {
			return null;
		}
		return base64ToDataUrl(this.baseContent, this.baseMediaMime);
	}

	get headMediaUrl(): string | null {
		if (!this.headContent || !this.headMediaMime) {
			return null;
		}
		return base64ToDataUrl(this.headContent, this.headMediaMime);
	}

	get singleMediaUrl(): string | null {
		if (this.currentFile?.status === 'removed') {
			return this.baseMediaUrl;
		}
		return this.headMediaUrl;
	}

	get singleMediaMime(): string | null {
		if (this.currentFile?.status === 'removed') {
			return this.baseMediaMime;
		}
		return this.headMediaMime;
	}

	get hasFullContent(): boolean {
		if (this.isMediaFile) {
			return false;
		}
		const file = this.currentFile;
		if (!file) {
			return false;
		}
		if (file.status === 'added') {
			return this.headContent !== null;
		}
		if (file.status === 'removed') {
			return this.baseContent !== null;
		}
		return this.baseContent !== null && this.headContent !== null;
	}

	get splitLines(): { left: DiffLine[]; right: DiffLine[] } {
		const file = this.currentFile;
		if (!file) {
			return { left : [], right : [] };
		}
		return buildSplitLinesForFile(file, this.baseContent, this.headContent);
	}

	get leftLines(): DiffLine[] {
		return this.splitLines.left;
	}

	get rightLines(): DiffLine[] {
		return this.splitLines.right;
	}

	get singlePanelLines(): DiffLine[] {
		if (this.currentFile?.status === 'removed') {
			return this.leftLines;
		}
		if (this.currentFile?.status === 'added') {
			return this.rightLines.map(l => ({ ...l, type : 'context' as const }));
		}
		return this.rightLines;
	}

	get parsedPatch(): { left: DiffLine[]; right: DiffLine[] } {
		return parsePatch(this.currentFile?.patch, this.currentFile ?? null);
	}

	get patchSinglePanelLines(): DiffLine[] {
		if (this.currentFile?.status === 'removed') {
			return this.parsedPatch.left;
		}
		if (this.currentFile?.status === 'added') {
			return this.parsedPatch.right.map(l => ({ ...l, type : 'context' as const }));
		}
		return this.parsedPatch.right;
	}

	get minimapLeftLines(): DiffLine[] {
		const file = this.currentFile;
		if (!file) {
			return [];
		}
		if (this.hasFullContent) {
			if (file.status === 'added') {
				return [];
			}
			return this.leftLines;
		}
		if (file.patch) {
			if (file.status === 'added') {
				return [];
			}
			return this.parsedPatch.left;
		}
		return [];
	}

	get minimapRightLines(): DiffLine[] {
		const file = this.currentFile;
		if (!file) {
			return [];
		}
		if (this.hasFullContent) {
			if (file.status === 'added') {
				return this.rightLines;
			}
			if (file.status === 'removed') {
				return [];
			}
			return this.rightLines;
		}
		if (file.patch) {
			if (file.status === 'added') {
				return this.patchSinglePanelLines;
			}
			if (file.status === 'removed') {
				return [];
			}
			return this.parsedPatch.right;
		}
		return [];
	}

	get minimapTotalHeight(): number {
		return Math.max(this.minimapLeftLines.length, this.minimapRightLines.length) * this.lineHeight;
	}

	get minimapScrollTop(): number {
		if (this.isAddedOrRemoved) {
			return 0;
		}
		return this.rightScrollTop;
	}

	onMinimapScrollTo(fraction: number) {
		const segments        = this.scrollSegments();
		const maxScroll       = maxVirtualScrollTop(segments, this.viewportHeight, this.lineHeight);
		this.virtualScrollTop = maxScroll * fraction;
		const { left, right } = resolveScroll(segments, this.virtualScrollTop);
		this.leftScrollTop    = left;
		this.rightScrollTop   = right;
	}

	get commonBlocks() {
		const file = this.currentFile;
		if (!file || !this.hasFullContent || this.isAddedOrRemoved) {
			return [];
		}
		const baseLineCount = this.baseContent?.split('\n').length ?? 0;
		const headLineCount = this.headContent?.split('\n').length ?? 0;
		return computeCommonBlocks(file.patch, baseLineCount, headLineCount);
	}

	scrollSegments(): ScrollSegment[] {
		return buildScrollSegmentsFromState(this.commonBlocks, this.baseContent, this.headContent, this.lineHeight);
	}

	get connectorPaths(): string[] {
		return buildConnectorPaths(this.commonBlocks, this.leftScrollTop, this.rightScrollTop, this.viewportHeight, this.lineHeight, 48);
	}

	private _filesInitialized = false;

	@Watch('files', { immediate : true })
	onFilesChanged() {
		this._contentCache.clear();
		this.baseContent      = null;
		this.headContent      = null;
		this.contentEncoding  = 'text';
		this.virtualScrollTop = 0;
		if (!this._filesInitialized && this.files.length) {
			this._filesInitialized = true;
			const idx              = this.initialFileIndex;
			this.currentIndex      = idx >= 0 && idx < this.files.length ? idx : 0;
		}
		else {
			this.currentIndex = 0;
		}
		if (this.files.length) {
			this.loadFileContent();
		}
	}

	@Watch('diffFontSize')
	onDiffFontSizeChanged() {
		this.$nextTick(() => {
			this.measureLineHeight();
			this.measureViewportHeight();
			this.applyVirtualScroll();
		});
	}

	@Watch('currentIndex')
	onIndexChanged() {
		this.virtualScrollTop = 0;
		this.leftScrollTop    = 0;
		this.rightScrollTop   = 0;
		this.activeComment    = null;
		this.$emit('update:fileIndex', this.currentIndex);
		this.loadFileContent();
	}

	@Watch('contentLoading')
	onContentLoadingChanged(val: boolean) {
		if (!val && this.hasFullContent && !this.isAddedOrRemoved) {
			this.$nextTick(() => {
				this.measureLineHeight();
				this.measureViewportHeight();
				this.resetPanelScroll();
			});
		}
	}

	@Watch('threadFocusRequest', { immediate : true })
	async onThreadFocusRequest(req: ReviewThreadFocusRequest | null) {
		if (!req) {
			return;
		}
		const token = ++this._focusRequestToken;
		try {
			await this.applyThreadFocusRequest(req);
		}
		finally {
			if (token === this._focusRequestToken && this.threadFocusRequest?.nonce === req.nonce) {
				this.$emit('thread-focus-handled');
			}
		}
	}

	indexForFilename(path: string): number {
		const i = this.files.findIndex(f => f.filename === path);
		if (i >= 0) {
			return i;
		}
		return this.files.findIndex(f => f.previous_filename === path);
	}

	private async waitContentIdle(timeoutMs = 25000): Promise<boolean> {
		const deadline = Date.now() + timeoutMs;
		while (this.contentLoading) {
			if (Date.now() > deadline) {
				return false;
			}
			await new Promise(resolve => setTimeout(resolve, 32));
		}
		await this.$nextTick();
		return true;
	}

	private async settleDiffLayout(): Promise<void> {
		await this.$nextTick();
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		this.measureLineHeight();
		this.measureViewportHeight();
		let waits = 0;
		while (waits++ < 72) {
			const needVp = !!(this.hasFullContent && !this.isAddedOrRemoved && this.viewportHeight <= 10);
			const needLh = this.lineHeight < 8;
			if (!needVp && !needLh) {
				break;
			}
			await new Promise(resolve => requestAnimationFrame(resolve));
			this.measureViewportHeight();
			this.measureLineHeight();
		}
		this.applyVirtualScroll();
	}

	private linesForSide(side: 'LEFT' | 'RIGHT'): DiffLine[] {
		const file = this.currentFile;
		if (!file) {
			return [];
		}
		if (!this.hasFullContent) {
			if (!file.patch && !this.headContent && file.status !== 'removed') {
				return [];
			}
			if (file.status === 'removed') {
				return side === 'LEFT' ? this.parsedPatch.left : [];
			}
			if (file.status === 'added') {
				return side === 'RIGHT' ? this.parsedPatch.right : [];
			}
			return side === 'LEFT' ? this.parsedPatch.left : this.parsedPatch.right;
		}
		if (this.currentFile.status === 'removed') {
			return side === 'LEFT' ? this.leftLines : [];
		}
		if (this.currentFile.status === 'added') {
			return side === 'RIGHT' ? this.rightLines : [];
		}
		return side === 'LEFT' ? this.leftLines : this.rightLines;
	}

	private lineSnippetAt(side: 'LEFT' | 'RIGHT', lineNum: number): string {
		const lines = this.linesForSide(side);
		const ln    = lines.find(l => l.num === lineNum);
		return (ln?.content ?? '').trimEnd();
	}

	private async scrollVirtToSplitLine(side: 'LEFT' | 'RIGHT', lineNum: number): Promise<boolean> {
		const segments = this.scrollSegments();
		const maxV     = maxVirtualScrollTop(segments, this.viewportHeight, this.lineHeight);
		const panelEl  = side === 'LEFT'
			? (this.$refs.leftPanel as HTMLElement | undefined)
			: (this.$refs.rightPanel as HTMLElement | undefined);
		if (!panelEl || maxV <= 0) {
			return false;
		}

		let lo = 0;
		let hi = maxV;

		for (let i = 0; i < 36; i++) {
			const mid             = (lo + hi) / 2;
			this.virtualScrollTop = mid;
			this.applyVirtualScroll();
			await this.$nextTick();

			await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

			const row = panelEl.querySelector(`tr[data-diff-line="${lineNum}"]`);
			if (!row || !(row instanceof HTMLElement)) {
				return false;
			}

			const rowRect     = row.getBoundingClientRect();
			const panelRect   = panelEl.getBoundingClientRect();
			const rowCenter   = rowRect.top + rowRect.height / 2;
			const panelCenter = panelRect.top + panelRect.height / 2;
			const delta       = rowCenter - panelCenter;

			if (Math.abs(delta) <= 14 || hi - lo < this.lineHeight * 0.15) {
				break;
			}
			if (delta < -0.5) {
				lo = mid + 1e-6;
			}
			else {
				hi = mid - 1e-6;
			}
		}
		this.applyVirtualScroll();
		await this.$nextTick();
		await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
		return true;
	}

	private revealLineInViewer(side: 'LEFT' | 'RIGHT', lineNum: number): boolean {
		const root = this.$el as HTMLElement;
		const sel  = `tr[data-diff-line="${lineNum}"][data-diff-side="${side}"]`;

		const useVirt = !!(this.hasFullContent && !this.isAddedOrRemoved && this.viewportHeight > 10);
		const panelEl = side === 'LEFT' ? root.querySelector('.pr-diff-panel-left') : root.querySelector('.pr-diff-panel-right');
		let rowEl     = useVirt ? panelEl?.querySelector(`tr[data-diff-line="${lineNum}"]`) as HTMLElement | null ?? null : root.querySelector(sel) as HTMLElement | null;

		if (!rowEl) {
			rowEl = root.querySelector(sel) as HTMLElement | null;
		}
		if (!rowEl) {
			rowEl = root.querySelector(`tr[data-diff-line="${lineNum}"]`) as HTMLElement | null;
		}
		if (!rowEl) {
			return false;
		}
		rowEl.scrollIntoView({ block : 'center', inline : 'nearest', behavior : 'auto' });
		return true;
	}

	private attachPopoverAtReviewLine(side: 'LEFT' | 'RIGHT', lineNum: number): void {
		const root       = this.$el as HTMLElement;
		const gutterCell = root.querySelector(
			`${side === 'LEFT' ? '.pr-diff-panel-left' : '.pr-diff-panel-right'} tr[data-diff-line="${lineNum}"] td.pr-diff-gutter`
		) as HTMLElement | null
				?? root.querySelector(`tr[data-diff-line="${lineNum}"][data-diff-side="${side}"] td.pr-diff-gutter`) as HTMLElement | null;

		const path = this.currentFile.filename;
		const lc   = this.lineSnippetAt(side, lineNum);

		const rect         = gutterCell?.getBoundingClientRect() ?? new DOMRect(120, window.innerHeight * 0.2, 0, 22);
		this.activeComment = {
			path,
			line        : lineNum,
			side,
			rect,
			lineContent : lc,
		};
	}

	private async applyThreadFocusRequest(req: ReviewThreadFocusRequest): Promise<void> {
		const idx = this.indexForFilename(req.path);
		if (idx < 0) {
			return;
		}
		if (this.currentIndex !== idx) {
			this.currentIndex = idx;
		}
		const idle = await this.waitContentIdle();
		if (!idle) {
			return;
		}
		await this.settleDiffLayout();

		const sideUse = req.side ?? 'RIGHT';
		let revealed  = false;

		if (this.hasFullContent && !this.isAddedOrRemoved) {
			if (this.viewportHeight <= 10) {
				await new Promise(resolve => requestAnimationFrame(resolve));
				this.measureViewportHeight();
			}
			if (this.viewportHeight > 10 && maxVirtualScrollTop(this.scrollSegments(), this.viewportHeight, this.lineHeight) > 0) {
				revealed = await this.scrollVirtToSplitLine(sideUse, req.line);
			}
		}
		if (!revealed) {
			revealed = this.revealLineInViewer(sideUse, req.line);
		}
		if (!revealed) {
			return;
		}
		await this.settleDiffLayout();
		this.attachPopoverAtReviewLine(sideUse, req.line);
	}

	mounted() {
		window.addEventListener('resize', this._resizeHandler);
		document.addEventListener('mousedown', this._popoverClickOutside, true);
		if (this.files.length) {
			this.loadFileContent();
		}
	}

	beforeUnmount() {
		window.removeEventListener('resize', this._resizeHandler);
		document.removeEventListener('mousedown', this._popoverClickOutside, true);
	}

	async loadFileContent() {
		const file = this.currentFile;
		if (!file) {
			return;
		}

		const cacheKey = file.filename;
		const cached   = this._contentCache.get(cacheKey);
		if (cached) {
			this.baseContent     = cached.base;
			this.headContent     = cached.head;
			this.contentEncoding = cached.encoding ?? 'text';
			this.$nextTick(() => {
				this.measureLineHeight();
				this.measureViewportHeight();
				this.resetPanelScroll();
			});
			return;
		}

		const loadId         = ++this._loadId;
		this.contentLoading  = true;
		this.baseContent     = null;
		this.headContent     = null;
		this.contentEncoding = 'text';

		try {
			let base: string | null     = null;
			let head: string | null     = null;
			let encoding: 'text' | 'base64' = 'text';

			if (this.fileContentLoader) {
				const content = await this.fileContentLoader(file);
				base          = content.base;
				head          = content.head;
				encoding      = content.encoding ?? 'text';
			}
			else if (this.isMediaFile) {
				encoding = 'base64';
				if (file.status === 'added') {
					head = await GitHubClient.fetchFileContentBase64(this.owner, this.repo, file.filename, this.headRef);
				}
				else if (file.status === 'removed') {
					const basePath = file.previous_filename || file.filename;
					base           = await GitHubClient.fetchFileContentBase64(this.owner, this.repo, basePath, this.baseRef);
				}
				else {
					const basePath = file.previous_filename || file.filename;
					[ base, head ] = await Promise.all([
						GitHubClient.fetchFileContentBase64(this.owner, this.repo, basePath, this.baseRef),
						GitHubClient.fetchFileContentBase64(this.owner, this.repo, file.filename, this.headRef),
					]);
				}
			}
			else if (file.status === 'added') {
				head = await GitHubClient.fetchFileContent(this.owner, this.repo, file.filename, this.headRef);
			}
			else if (file.status === 'removed') {
				const basePath = file.previous_filename || file.filename;
				base           = await GitHubClient.fetchFileContent(this.owner, this.repo, basePath, this.baseRef);
			}
			else {
				const basePath = file.previous_filename || file.filename;
				[ base, head ] = await Promise.all([
					GitHubClient.fetchFileContent(this.owner, this.repo, basePath, this.baseRef),
					GitHubClient.fetchFileContent(this.owner, this.repo, file.filename, this.headRef),
				]);
			}

			if (this._loadId !== loadId) {
				return;
			}
			this.baseContent     = base;
			this.headContent     = head;
			this.contentEncoding = encoding;
			this._contentCache.set(cacheKey, { base, head, encoding });
		}
		catch {
			if (this._loadId !== loadId) {
				return;
			}
		}
		finally {
			if (this._loadId === loadId) {
				this.contentLoading = false;
			}
		}
	}

	measureLineHeight() {
		const root = this.$el as HTMLElement;
		const row  = (this.$refs.leftPanel as HTMLElement)?.querySelector('.pr-diff-row') ?? root?.querySelector('.pr-diff-row');
		if (row) {
			this.lineHeight = row.getBoundingClientRect().height;
		}
	}

	measureViewportHeight() {
		const col           = this.$refs.connectorCol as HTMLElement | undefined;
		const left          = this.$refs.leftPanel as HTMLElement | undefined;
		this.viewportHeight = col?.clientHeight ?? left?.clientHeight ?? 0;
	}

	resetPanelScroll() {
		this.virtualScrollTop = 0;
		this.leftScrollTop    = 0;
		this.rightScrollTop   = 0;
	}

	private _debugLogged = false;
	private _focusRequestToken = 0;

	applyVirtualScroll() {
		const segments        = this.scrollSegments();
		const { left, right } = resolveScroll(segments, this.virtualScrollTop);
		this.leftScrollTop    = left;
		this.rightScrollTop   = right;
	}

	onWheel(e: WheelEvent) {
		const segments = this.scrollSegments();

		if (!this._debugLogged) {
			this._debugLogged = true;
			const diffSegs    = segments.filter(s => s.leftLength !== s.rightLength);
			console.log('[PrFilesTab] scrollSegments:', segments.length, 'total, diff segments:', diffSegs.length, diffSegs);
			console.log('[PrFilesTab] commonBlocks:', this.commonBlocks.length);
		}

		if (e.deltaY !== 0) {
			const maxScroll       = maxVirtualScrollTop(segments, this.viewportHeight, this.lineHeight);
			this.virtualScrollTop = Math.max(0, Math.min(maxScroll, this.virtualScrollTop + e.deltaY));

			const { left, right } = resolveScroll(segments, this.virtualScrollTop);
			this.leftScrollTop    = left;
			this.rightScrollTop   = right;
		}

		if (e.deltaX !== 0) {
			const leftEl  = this.$refs.leftPanel as HTMLElement | undefined;
			const rightEl = this.$refs.rightPanel as HTMLElement | undefined;
			const target  = e.target as HTMLElement;
			if (leftEl?.contains(target)) {
				leftEl.scrollLeft += e.deltaX;
			}
			else if (rightEl?.contains(target)) {
				rightEl.scrollLeft += e.deltaX;
			}
			else {
				if (leftEl) {
					leftEl.scrollLeft += e.deltaX;
				}
				if (rightEl) {
					rightEl.scrollLeft += e.deltaX;
				}
			}
		}
	}

	get singlePanelSide(): 'LEFT' | 'RIGHT' {
		return this.currentFile?.status === 'removed' ? 'LEFT' : 'RIGHT';
	}

	get currentFileThreads(): { left: Map<number, CommentThread>; right: Map<number, CommentThread> } {
		const left     = new Map<number, CommentThread>();
		const right    = new Map<number, CommentThread>();
		const filename = this.currentFile?.filename;
		if (!filename) {
			return { left, right };
		}

		const rootMap  = new Map<number, ReviewComment>();
		const replyMap = new Map<number, ReviewComment[]>();
		for (const c of this.reviewComments) {
			if (c.path !== filename) {
				continue;
			}
			if (c.in_reply_to_id) {
				const arr = replyMap.get(c.in_reply_to_id);
				if (arr) {
					arr.push(c);
				}
				else {
					replyMap.set(c.in_reply_to_id, [ c ]);
				}
			}
			else {
				rootMap.set(c.id, c);
			}
		}
		for (const [ rootId, root ] of rootMap) {
			const line = root.line;
			if (line == null) {
				continue;
			}
			const replies               = replyMap.get(rootId) || [];
			const all                   = [ root, ...replies ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
			const thread: CommentThread = { path : filename, line, side : root.side, comments : all };
			const map                   = root.side === 'LEFT' ? left : right;
			map.set(line, thread);
		}
		return { left, right };
	}

	get currentFilePending(): { left: Map<number, PendingComment>; right: Map<number, PendingComment> } {
		const left     = new Map<number, PendingComment>();
		const right    = new Map<number, PendingComment>();
		const filename = this.currentFile?.filename;
		if (!filename) {
			return { left, right };
		}
		for (const c of this.pendingComments) {
			if (c.path !== filename) {
				continue;
			}
			const map = c.side === 'LEFT' ? left : right;
			map.set(c.line, c);
		}
		return { left, right };
	}

	hasThreadAt(lineNum: number | null, side: 'LEFT' | 'RIGHT'): boolean {
		if (lineNum == null) {
			return false;
		}
		const map = side === 'LEFT' ? this.currentFileThreads.left : this.currentFileThreads.right;
		return map.has(lineNum);
	}

	hasPendingAt(lineNum: number | null, side: 'LEFT' | 'RIGHT'): boolean {
		if (lineNum == null) {
			return false;
		}
		const map = side === 'LEFT' ? this.currentFilePending.left : this.currentFilePending.right;
		return map.has(lineNum);
	}

	hasAnyCommentAt(lineNum: number | null, side: 'LEFT' | 'RIGHT'): boolean {
		if (!this.reviewEnabled) {
			return false;
		}
		return this.hasThreadAt(lineNum, side) || this.hasPendingAt(lineNum, side);
	}

	/** Pending or GitHub thread not yet resolved — pulsate gutter dot */
	gutterDotNeedsPulse(lineNum: number | null, side: 'LEFT' | 'RIGHT'): boolean {
		if (lineNum == null) {
			return false;
		}
		if (this.hasPendingAt(lineNum, side)) {
			return true;
		}
		const threadMap = side === 'LEFT' ? this.currentFileThreads.left : this.currentFileThreads.right;
		const thread    = threadMap.get(lineNum);
		if (!thread) {
			return false;
		}
		return thread.comments.some(c => c.isResolved === false);
	}

	commentDotClass(lineNum: number | null, side: 'LEFT' | 'RIGHT'): string {
		if (lineNum == null) {
			return '';
		}
		const hasThread       = this.hasThreadAt(lineNum, side);
		const hasPending      = this.hasPendingAt(lineNum, side);
		const parts: string[] = [];
		if (hasThread && hasPending) {
			parts.push('dot-both');
		}
		else if (hasPending) {
			parts.push('dot-pending');
		}
		else if (hasThread) {
			const threadMap = side === 'LEFT' ? this.currentFileThreads.left : this.currentFileThreads.right;
			const thread    = threadMap.get(lineNum);
			if (thread) {
				const type = parseCommentType(thread.comments[0].body);
				if (type === 'change-required') {
					parts.push('dot-change-required');
				}
				else if (type === 'question') {
					parts.push('dot-question');
				}
				else {
					parts.push('dot-suggestion');
				}
			}
		}
		if (this.gutterDotNeedsPulse(lineNum, side)) {
			parts.push('gutter-dot-unresolved');
		}
		return parts.join(' ');
	}

	onGutterClick(line: DiffLine, side: 'LEFT' | 'RIGHT', event: MouseEvent) {
		if (!this.reviewEnabled) {
			return;
		}
		if (line.num == null) {
			return;
		}
		const td = (event.target as HTMLElement).closest('.pr-diff-gutter') as HTMLElement;
		if (!td) {
			return;
		}
		const rect         = td.getBoundingClientRect();
		this.activeComment = {
			path        : this.currentFile.filename,
			line        : line.num,
			side,
			rect,
			lineContent : line.content,
		};
	}

	closeComment() {
		this.activeComment = null;
	}

	get activeThread(): CommentThread | null {
		if (!this.activeComment) {
			return null;
		}
		const map = this.activeComment.side === 'LEFT' ? this.currentFileThreads.left : this.currentFileThreads.right;
		return map.get(this.activeComment.line) ?? null;
	}

	get activePending(): PendingComment | null {
		if (!this.activeComment) {
			return null;
		}
		const map = this.activeComment.side === 'LEFT' ? this.currentFilePending.left : this.currentFilePending.right;
		return map.get(this.activeComment.line) ?? null;
	}

	onPopoverAddPending(comment: PendingComment) {
		this.$emit('add-pending', comment);
	}

	onPopoverRemovePending(id: string) {
		this.$emit('remove-pending', id);
		this.closeComment();
	}

	onPopoverEditPending(comment: PendingComment) {
		this.$emit('edit-pending', comment);
	}

	onPopoverCommentsUpdated() {
		this.$emit('comments-updated');
	}

	private _popoverClickOutside = (e: MouseEvent) => {
		if (!this.activeComment) {
			return;
		}
		const raw              = e.target;
		let el: Element | null = null;
		if (raw instanceof Element) {
			el = raw;
		}
		else if (raw instanceof Node) {
			el = raw.parentElement;
		}
		if (!el || el.closest('.comment-popover') || el.closest('.pr-diff-gutter')) {
			return;
		}
		this.closeComment();
	};

}
</script>

<style>
@import "@/styles/pr-diff.css";

.pr-files-tab {
	width: 100%;
	min-width: 0;
	align-self: stretch;
}

.pr-files-empty {
	color: var(--text-tertiary);
	font-size: 13px;
	padding: 32px;
	text-align: center;
}

.pr-files-skeleton {
	width: 100%;
	min-width: 0;
	align-self: stretch;
	pointer-events: none;
}

.pr-files-skeleton-nav {
	width: 100%;
	box-sizing: border-box;
	height: 40px;
	padding: 0 var(--u-2);
	margin-bottom: 8px;
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
}

.pr-files-skeleton-nav-btn {
	width: 30px;
	height: 30px;
	border-radius: var(--radius-sm);
}

.pr-files-skeleton-viewed {
	width: 30px;
	height: 30px;
	border-radius: var(--radius-sm);
}

.pr-files-skeleton-dropdown {
	height: 30px;
	border-radius: var(--radius-sm);
}

.pr-files-skeleton-counter {
	width: 44px;
	height: 12px;
}

.pr-files-skeleton-stats {
	width: 70px;
	height: 12px;
}

.pr-files-skeleton-viewer {
	width: 100%;
	min-width: 0;
	min-height: 0;
	margin-top: 0;
	background: var(--bg-primary);
	box-sizing: border-box;
}

.pr-files-skeleton-split {
	display: flex;
	flex: 1;
	width: 100%;
	min-height: 0;
}

.pr-files-skeleton .pr-diff-panel {
	display: flex;
	flex: 1 1 0;
	flex-direction: column;
	width: 0;
	min-height: 0;
}

.pr-files-skeleton-row {
	display: grid;
	flex: 1 1 0;
	grid-template-columns: 50px minmax(0, 1fr);
	align-items: center;
	width: 100%;
	min-height: 20px;
	border-bottom: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
	background: var(--bg-primary);
}

.pr-files-skeleton-row.is-added {
	background: var(--diff-add-bg);
}

.pr-files-skeleton-row.is-removed {
	background: var(--diff-del-bg);
}

.pr-files-skeleton-row.is-hunk {
	background: var(--diff-hunk-bg);
}

.pr-files-skeleton-gutter {
	justify-self: end;
	width: 24px;
	height: 10px;
	margin-right: 10px;
}

.pr-files-skeleton-code {
	width: calc(100% - 24px);
	height: 10px;
	margin-left: 12px;
}

.pr-files-skeleton-code.mid {
	width: calc(82% - 24px);
}

.pr-files-skeleton-code.short {
	width: calc(64% - 24px);
}

.pr-files-skeleton-connector {
	align-self: stretch;
	min-height: 0;
}

.pr-files-skeleton-connector-band {
	position: absolute;
	left: 8px;
	right: 8px;
	height: 32px;
	border-radius: var(--radius-sm);
	opacity: 0.75;
}

.pr-files-skeleton-minimap {
	display: flex;
	flex-direction: column;
	gap: 3px;
	align-self: stretch;
	width: 20px;
	padding: 8px 5px;
	border-left: 1px solid var(--border);
	background: var(--bg-secondary);
}

.pr-files-skeleton-minimap-line {
	flex: 1 1 0;
	width: 100%;
	min-height: 8px;
	border-radius: 2px;
	background: var(--diff-minimap-neutral);
}

.pr-files-skeleton-minimap-line.is-added {
	background: var(--diff-minimap-add);
}

.pr-files-skeleton-minimap-line.is-removed {
	background: var(--diff-minimap-del);
}

@media (max-width: 760px) {
	.pr-files-skeleton-counter,
	.pr-files-skeleton-stats,
	.pr-files-skeleton-minimap {
		display: none;
	}
}
</style>
