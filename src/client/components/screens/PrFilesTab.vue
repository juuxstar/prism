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
			<pr-files-nav-bar
				v-model:current-index="currentIndex"
				v-model:render-markdown="renderMarkdown"
				:files="files"
				:viewed-files="viewedFiles"
				:show-viewed-controls="viewedEnabled"
				:show-render-toggle="canRenderMarkdown"
				@toggle-viewed="toggleViewed"
				@pair-files="$emit('pair-files', $event)"
				@unpair-files="$emit('unpair-files', $event)"
			/>

			<p v-if="pairError" class="pr-files-pair-error u-flex u-items-center u-gap-2 u-fs-13 u-m-0">
				<span class="u-flex-1 u-min-w-0">{{ pairError }}</span>
				<button type="button" class="pr-files-pair-error-close u-flex-shrink-0 u-cursor-pointer" aria-label="Dismiss" @click="$emit('dismiss-pair-error')">&times;</button>
			</p>

			<div v-if="contentLoading" class="pr-diff-content-loading"><span class="async-loader"></span> Loading file contents...</div>

			<div v-else-if="hasMediaContent" class="pr-diff-viewer" :class="{ 'pr-diff-viewer-split' : !isAddedOrRemoved }">
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

			<div v-else-if="showRenderedMarkdown" class="pr-diff-viewer" :class="{ 'pr-diff-viewer-split' : !isAddedOrRemoved }">
				<pr-markdown-diff ref="markdownDiff" :left-source="markdownLeftSource" :right-source="markdownRightSource" />
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

		<pr-file-search-bar
			v-if="searchOpen"
			ref="searchBar"
			v-model:query="searchQuery"
			v-model:match-case="searchMatchCase"
			v-model:whole-word="searchWholeWord"
			v-model:regex="searchRegex"
			class="pr-files-search-overlay u-absolute"
			:match-count="searchMatchCount"
			:match-position="searchMatchPosition"
			:invalid-pattern="searchInvalidPattern"
			:truncated="searchTruncated"
			:pending="searchPending"
			@next="stepSearchMatch(1)"
			@previous="stepSearchMatch(-1)"
			@close="closeSearch"
		/>

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
import PrFileSearchBar                        from '@/components/pr/PrFileSearchBar.vue';
import PrFilesNavBar                          from '@/components/pr/PrFilesNavBar.vue';
import PrMarkdownDiff                         from '@/components/pr/PrMarkdownDiff.vue';
import PrMediaViewer                          from '@/components/pr/PrMediaViewer.vue';
import type { PendingComment, PRFile, PullRequestLocation, ReviewComment }                       from '@/lib/api/githubClient';
import GitHubClient                           from '@/lib/api/githubClient';
import { parseCommentType }                   from '@/lib/api/githubClient';
import { buildConnectorPaths, buildScrollSegmentsFromState, maxVirtualScrollTop, resolveScroll } from '@/lib/api/usePrDiffVirtualScroll';
import { buildSplitLinesForFile, parsePatch } from '@/lib/diff/diffLineBuilder';
import type { FileSearchMatch }               from '@/lib/diff/fileSearch';
import {
	clearSearchMatches, paintSearchMatches, scrollMatchIntoViewHorizontally, searchFileView, supportsSearchPainting
} from '@/lib/diff/fileSearch';
import { computeCommonBlocks }                         from '@/lib/diff/patchDiff';
import type { CommentThread, DiffLine, ScrollSegment } from '@/lib/diff/prDiffTypes';
import { renderGithubMarkdown }                        from '@/lib/githubMarkdown';
import { base64ToDataUrl, isRenderableMediaPaths, mediaMimeType } from '@/lib/mediaFiles';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

/** How long typing has to pause before the search runs, so the view does not chase every keystroke. */
const SEARCH_DEBOUNCE_MS = 250;

export interface ReviewThreadFocusRequest { path: string; line: number; side: 'LEFT' | 'RIGHT'; nonce: number }
export interface PrFileContent {
	base: string | null;
	head: string | null;
	encoding?: 'text' | 'base64';
}
export type PrFileContentLoader = (file: PRFile) => Promise<PrFileContent>;

@Component({
	components : { DiffMinimap, PrDiffTable, PrFileSearchBar, PrFilesNavBar, PrMarkdownDiff, PrMediaViewer },
	emits      : [ 'update:fileIndex', 'update:viewed', 'all-viewed', 'add-pending', 'remove-pending', 'edit-pending', 'comments-updated', 'thread-focus-handled', 'pair-files', 'unpair-files', 'dismiss-pair-error' ],
})
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
	/** Why the reader's last forced file pairing could not be built, if it could not. */
	@Prop({ default : '' }) readonly pairError!: string;
	@Prop({ default : () => [] }) readonly reviewComments!: ReviewComment[];
	@Prop({ default : () => [] }) readonly pendingComments!: PendingComment[];
	@Prop({ default : '' }) readonly commitId!: string;
	@Prop({ default : true }) readonly reviewEnabled!: boolean;
	@Prop({ default : true }) readonly viewedEnabled!: boolean;
	@Prop({ default : 'No files changed' }) readonly emptyMessage!: string;
	@Prop({ default : null }) readonly fileContentLoader!: PrFileContentLoader | null;
	/** When present, selects the file and scrolls to the line — used from Overview navigation. */
	@Prop({ default : null }) readonly threadFocusRequest!: ReviewThreadFocusRequest | null;

	currentIndex                       = 0;
	baseContent: string | null         = null;
	headContent: string | null         = null;
	contentEncoding: 'text' | 'base64' = 'text';
	contentLoading                     = false;
	leftScrollTop                      = 0;
	rightScrollTop                     = 0;
	viewportHeight                     = 0;
	lineHeight                         = 16.8;
	virtualScrollTop                   = 0;
	/** Sticky across files, so a reviewer reading a set of docs stays in whichever view they chose. */
	renderMarkdown                     = false;

	searchOpen           = false;
	/** Kept when the bar closes, so re-opening offers the last query the way a browser's find does. */
	searchQuery          = '';
	searchMatchCase      = false;
	searchWholeWord      = false;
	searchRegex          = false;
	searchMatchCount     = 0;
	searchMatchIndex     = 0;
	searchInvalidPattern = false;
	searchTruncated      = false;
	/** Typing has outrun the last search — the counts on screen describe an older query. */
	searchPending        = false;

	activeComment: { path: string; line: number; side: 'LEFT' | 'RIGHT'; rect: DOMRect; lineContent: string } | null = null;

	/**
	 * Diffs already assembled for this tab, keyed by the commits they were read at. The key is what makes the
	 * cache safe to keep across a refresh: a new head commit is a new key, so a list that came back unchanged
	 * hits every entry and the reader's file is on screen without a request or a flash of empty panes.
	 *
	 * Not used for the local-files tab. Its content comes from the worktree, which changes under the app with
	 * no commit to key on, so there is nothing here that could be trusted to still be true.
	 */
	private _contentCache = new Map<string, PrFileContent>();
	private _loadId       = 0;
	private _resizeHandler = () => {
		this.measureViewportHeight();
		this.applyVirtualScroll();
	};

	private _searchMatches: FileSearchMatch[]    = [];
	private _searchMarkedRow: HTMLElement | null = null;
	private _searchScrollToken                   = 0;
	private _searchScrolling                     = false;
	private _searchRefreshQueued                 = false;
	private _searchQueryTimer: ReturnType<typeof setTimeout> | null = null;

	// Bound in `mounted`, where `this` is the live component. A class-field arrow is built on the throwaway
	// instance the decorator constructs to harvest field initializers, so reading state through its `this`
	// returns whatever the field was initialized to; only method calls reach the live component from there.
	private _searchKeyHandler: ((e: KeyboardEvent) => void) | null = null;
	private _popoverClickOutside: ((e: MouseEvent) => void) | null = null;

	/** Which pull request a viewed-mark belongs to, so the mutation can write straight into its record. */
	get prLocation(): PullRequestLocation {
		return { owner : this.owner, repo : this.repo, number : this.prNumber };
	}

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
		return idx % 7 === 0 ? 'is-removed' : '';
	}

	skeletonCodeClass(idx: number): string {
		if (idx % 6 === 0) {
			return 'short';
		}
		return idx % 4 === 0 ? 'mid' : '';
	}

	skeletonMinimapClass(idx: number): string {
		if (idx % 5 === 0) {
			return 'is-added';
		}
		return idx % 7 === 0 ? 'is-removed' : '';
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
		// A rename PRism merged is still two files to GitHub, so both halves take the new state together.
		const paths = file.synthesizedRename && file.previous_filename ? [ filename, file.previous_filename ] : [ filename ];
		try {
			for (const path of paths) {
				if (wasViewed) {
					await GitHubClient.unmarkFileAsViewed(this.prNodeId, path, this.prLocation);
				}
				else {
					await GitHubClient.markFileAsViewed(this.prNodeId, path, this.prLocation);
				}
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

	get isMarkdownFile(): boolean {
		return /\.(md|markdown)$/i.test(this.currentFile?.filename ?? '');
	}

	/** The rendered view needs whole files, not just the patch, so the toggle waits for the contents. */
	get canRenderMarkdown(): boolean {
		return this.isMarkdownFile && this.hasFullContent;
	}

	get showRenderedMarkdown(): boolean {
		return this.canRenderMarkdown && this.renderMarkdown;
	}

	get markdownLeftSource(): string | null {
		return this.currentFile?.status === 'added' ? null : this.baseContent;
	}

	get markdownRightSource(): string | null {
		return this.currentFile?.status === 'removed' ? null : this.headContent;
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
		return !file ? false : isRenderableMediaPaths(file.filename, file.previous_filename);
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
		return file.status === 'removed' ? this.baseContent !== null : this.baseContent !== null || this.headContent !== null;
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
		return !this.baseContent || !this.baseMediaMime ? null : base64ToDataUrl(this.baseContent, this.baseMediaMime);
	}

	get headMediaUrl(): string | null {
		return !this.headContent || !this.headMediaMime ? null : base64ToDataUrl(this.headContent, this.headMediaMime);
	}

	get singleMediaUrl(): string | null {
		return this.currentFile?.status === 'removed' ? this.baseMediaUrl : this.headMediaUrl;
	}

	get singleMediaMime(): string | null {
		return this.currentFile?.status === 'removed' ? this.baseMediaMime : this.headMediaMime;
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
		return file.status === 'removed' ? this.baseContent !== null : this.baseContent !== null && this.headContent !== null;
	}

	get splitLines(): { left: DiffLine[]; right: DiffLine[] } {
		const file = this.currentFile;
		return !file ? { left : [], right : [] } : buildSplitLinesForFile(file, this.baseContent, this.headContent);
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
			return file.status === 'added' ? [] : this.leftLines;
		}
		if (file.patch) {
			return file.status === 'added' ? [] : this.parsedPatch.left;
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
			return file.status === 'removed' ? [] : this.rightLines;
		}
		if (file.patch) {
			if (file.status === 'added') {
				return this.patchSinglePanelLines;
			}
			return file.status === 'removed' ? [] : this.parsedPatch.right;
		}
		return [];
	}

	get minimapTotalHeight(): number {
		return Math.max(this.minimapLeftLines.length, this.minimapRightLines.length) * this.lineHeight;
	}

	get minimapScrollTop(): number {
		return this.isAddedOrRemoved ? 0 : this.rightScrollTop;
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
	onFilesChanged(_files: PRFile[], previousFiles?: PRFile[]) {
		// Note which file was open first, to put the reader back on it below. The assembled diffs are keyed by
		// the commits they were read at, so a refresh that returned the same head keeps every one of them;
		// only the worktree's own content, which has no commit to key on, is dropped here.
		const previousPath = previousFiles?.[this.currentIndex]?.filename;
		if (this.fileContentLoader) {
			this._contentCache.clear();
		}
		this.virtualScrollTop = 0;
		if (!this._filesInitialized && this.files.length) {
			this._filesInitialized = true;
			const idx              = this.initialFileIndex;
			this.currentIndex      = idx >= 0 && idx < this.files.length ? idx : 0;
		}
		else {
			const restoredIndex = previousPath ? this.indexForFilename(previousPath) : -1;
			// A file that was just paired with another is gone from the list under its own name, so fall
			// back to the entry that absorbed it rather than throwing the reader back to the first file.
			const mergedIndex = restoredIndex >= 0 || !previousPath ? -1 : this.files.findIndex(file => file.previous_filename === previousPath);
			this.currentIndex = Math.max(restoredIndex, mergedIndex, 0);
		}
		if (this.files.length) {
			this.loadFileContent();
		}
		else {
			// Nothing left to show — this is the one case that still has to blank the panes, since no load
			// will follow to replace what they are rendering.
			this.baseContent     = null;
			this.headContent     = null;
			this.contentEncoding = 'text';
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
		if (!val) {
			this.scheduleFirstChangeReveal(this.currentFile, this._loadId);
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
		return i >= 0 ? i : this.files.findIndex(f => f.previous_filename === path);
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
				hi = mid - 1e-6;
			}
			else {
				lo = mid + 1e-6;
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

		const path = this.commentPathForSide(side);
		const lc   = this.lineSnippetAt(side, lineNum);

		const rect         = gutterCell?.getBoundingClientRect() ?? new DOMRect(120, window.innerHeight * 0.2, 0, 22);
		this.activeComment = { path, line : lineNum, side, rect, lineContent : lc };
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
		this._searchKeyHandler    = (e: KeyboardEvent) => this.onSearchKeydown(e);
		this._popoverClickOutside = (e: MouseEvent) => this.onPopoverClickOutside(e);
		window.addEventListener('keydown', this._searchKeyHandler);
		document.addEventListener('mousedown', this._popoverClickOutside, true);
		if (this.files.length) {
			this.loadFileContent();
		}
	}

	beforeUnmount() {
		window.removeEventListener('resize', this._resizeHandler);
		if (this._searchKeyHandler) {
			window.removeEventListener('keydown', this._searchKeyHandler);
			this._searchKeyHandler = null;
		}
		if (this._popoverClickOutside) {
			document.removeEventListener('mousedown', this._popoverClickOutside, true);
			this._popoverClickOutside = null;
		}
		this.cancelPendingQuerySearch();
		// The highlight registry is document-wide, so leaving the tab has to take the paint with it.
		clearSearchMatches();
	}

	async loadFileContent() {
		const file = this.currentFile;
		if (!file) {
			return;
		}

		const loadId   = ++this._loadId;
		const cacheKey = `${this.baseRef}:${this.headRef}:${file.filename}`;
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
			this.scheduleFirstChangeReveal(file, loadId);
			return;
		}

		this.contentLoading  = true;
		this.baseContent     = null;
		this.headContent     = null;
		this.contentEncoding = 'text';

		try {
			let base: string | null         = null;
			let head: string | null         = null;
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

	private scheduleFirstChangeReveal(file: PRFile, loadId: number): void {
		const token = ++this._firstChangeRevealToken;
		void this.revealFirstChangeAfterLoad(file, loadId, token);
	}

	private async revealFirstChangeAfterLoad(file: PRFile, loadId: number, token: number): Promise<void> {
		await this.settleDiffLayout();
		if (token !== this._firstChangeRevealToken || loadId !== this._loadId || file.filename !== this.currentFile?.filename || this.threadFocusRequest) {
			return;
		}
		// A running search has already put the view on a match; jumping to the first change would undo it.
		if (this.searchOwnsScroll) {
			return;
		}

		const firstChange = this.firstChangedLine();
		if (!firstChange) {
			return;
		}

		if (this.hasFullContent && !this.isAddedOrRemoved && this.viewportHeight > 10
			&& maxVirtualScrollTop(this.scrollSegments(), this.viewportHeight, this.lineHeight) > 0) {
			await this.scrollVirtToSplitLine(firstChange.side, firstChange.line);
			return;
		}

		this.revealLineInViewer(firstChange.side, firstChange.line);
	}

	private firstChangedLine(): { side: 'LEFT' | 'RIGHT'; line: number } | null {
		if (this.isAddedOrRemoved) {
			const side = this.singlePanelSide;
			const line = this.linesForSide(side).find(item => item.num !== null)?.num;
			return line === undefined || line === null ? null : { side, line };
		}

		const patch      = this.parsedPatch;
		const leftIndex  = patch.left.findIndex(item => item.type === 'del');
		const rightIndex = patch.right.findIndex(item => item.type === 'add');
		if (leftIndex === -1 && rightIndex === -1) {
			return null;
		}

		const side = rightIndex === -1 || (leftIndex !== -1 && leftIndex < rightIndex) ? 'LEFT' : 'RIGHT';
		const line = (side === 'LEFT' ? patch.left[leftIndex] : patch.right[rightIndex]).num;
		return line === null ? null : { side, line };
	}

	private _debugLogged            = false;
	private _focusRequestToken      = 0;
	private _firstChangeRevealToken = 0;

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

	/**
	 * The GitHub path a comment on this side belongs to. For everything GitHub itself paired up these are
	 * the same path; for a rename PRism merged, the base pane's lines only exist under the deleted path,
	 * so that is where a comment on them has to be read from and posted to.
	 */
	commentPathForSide(side: 'LEFT' | 'RIGHT'): string {
		const file = this.currentFile;
		if (!file) {
			return '';
		}
		return side === 'LEFT' && file.synthesizedRename && file.previous_filename ? file.previous_filename : file.filename;
	}

	get currentFileThreads(): { left: Map<number, CommentThread>; right: Map<number, CommentThread> } {
		const left     = new Map<number, CommentThread>();
		const right    = new Map<number, CommentThread>();
		const filename = this.currentFile?.filename;
		if (!filename) {
			return { left, right };
		}

		const leftPath = this.commentPathForSide('LEFT');
		const rootMap  = new Map<number, ReviewComment>();
		const replyMap = new Map<number, ReviewComment[]>();
		for (const c of this.reviewComments) {
			if (c.path !== (c.side === 'LEFT' ? leftPath : filename)) {
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
			const thread: CommentThread = { path : root.side === 'LEFT' ? leftPath : filename, line, side : root.side, comments : all };
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
		const leftPath = this.commentPathForSide('LEFT');
		for (const c of this.pendingComments) {
			if (c.path !== (c.side === 'LEFT' ? leftPath : filename)) {
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
		return !this.reviewEnabled ? false : this.hasThreadAt(lineNum, side) || this.hasPendingAt(lineNum, side);
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
		return !thread ? false : thread.comments.some(c => c.isResolved === false);
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
		this.activeComment = { path : this.commentPathForSide(side), line : line.num, side, rect, lineContent : line.content };
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

	/** 1-based position of the highlighted match, or 0 when there is nothing highlighted. */
	get searchMatchPosition(): number {
		return this.searchMatchCount ? this.searchMatchIndex + 1 : 0;
	}

	/** True while the viewer is the transform-driven split, where nothing can be reached with `scrollIntoView`. */
	get usesVirtualSplitScroll(): boolean {
		if (!this.hasFullContent || this.isAddedOrRemoved || this.showRenderedMarkdown || this.viewportHeight <= 10) {
			return false;
		}
		return maxVirtualScrollTop(this.scrollSegments(), this.viewportHeight, this.lineHeight) > 0;
	}

	/** While a search is running it, and not the freshly loaded file, decides where the view sits. */
	get searchOwnsScroll(): boolean {
		return this.searchOpen && !!this.searchQuery;
	}

	/** The toggles are deliberate single clicks rather than a stream of keystrokes, so they apply at once. */
	get searchOptionsSignature(): string {
		return JSON.stringify([ this.searchMatchCase, this.searchWholeWord, this.searchRegex ]);
	}

	/** Anything that re-renders the viewer detaches the collected ranges, so they have to be gathered again. */
	get searchContentSignature(): string {
		return [ this.currentIndex, this.contentLoading, this.showRenderedMarkdown, this.hasFullContent, this.files.length ].join('|');
	}

	@Watch('searchQuery')
	onSearchQueryChanged() {
		// An emptied field has nothing to scroll to, and leaving the old query painted would be a lie.
		if (!this.searchQuery) {
			this.cancelPendingQuerySearch();
			this.refreshSearch({ resetIndex : true, scroll : false });
			return;
		}
		this.cancelPendingQuerySearch();
		this.searchPending     = true;
		this._searchQueryTimer = setTimeout(() => {
			this._searchQueryTimer = null;
			this.refreshSearch({ resetIndex : true, scroll : true });
		}, SEARCH_DEBOUNCE_MS);
	}

	@Watch('searchOptionsSignature')
	onSearchOptionsChanged() {
		this.cancelPendingQuerySearch();
		this.refreshSearch({ resetIndex : true, scroll : true });
	}

	@Watch('searchContentSignature')
	onSearchContentSignatureChanged() {
		if (this.searchOpen) {
			this.scheduleSearchRefresh();
		}
	}

	private onSearchKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'f' || e.key === 'F')) {
			e.preventDefault();
			this.openSearch();
			return;
		}
		if (!this.searchOpen) {
			return;
		}
		if ((e.metaKey || e.ctrlKey) && (e.key === 'g' || e.key === 'G')) {
			e.preventDefault();
			this.stepSearchMatch(e.shiftKey ? -1 : 1);
			return;
		}
		// The comment popover closes on Escape too, and it is the thing the reader just opened.
		if (e.key === 'Escape' && !this.activeComment) {
			e.preventDefault();
			this.closeSearch();
		}
	}

	openSearch() {
		if (this.searchOpen) {
			this.focusSearchInput();
			return;
		}
		this.searchOpen = true;
		void this.$nextTick(() => {
			this.focusSearchInput();
			this.refreshSearch({ resetIndex : true, scroll : true });
		});
	}

	closeSearch() {
		this.searchOpen           = false;
		this._searchMatches       = [];
		this.searchMatchCount     = 0;
		this.searchMatchIndex     = 0;
		this.searchInvalidPattern = false;
		this.searchTruncated      = false;
		this.searchPending        = false;
		this.cancelPendingQuerySearch();
		clearSearchMatches();
		this.clearSearchRowMark();
	}

	private cancelPendingQuerySearch() {
		if (this._searchQueryTimer !== null) {
			clearTimeout(this._searchQueryTimer);
			this._searchQueryTimer = null;
		}
	}

	stepSearchMatch(delta: number) {
		// Typing and hitting Enter straight away should land on the first match, not skip over it.
		if (this._searchQueryTimer !== null) {
			this.cancelPendingQuerySearch();
			this.refreshSearch({ resetIndex : true, scroll : true });
			return;
		}
		if (!this.searchMatchCount) {
			return;
		}
		this.searchMatchIndex = (this.searchMatchIndex + delta + this.searchMatchCount) % this.searchMatchCount;
		paintSearchMatches(this._searchMatches, this.searchMatchIndex);
		void this.scrollToCurrentMatch();
	}

	private focusSearchInput() {
		(this.$refs.searchBar as { focusQuery?: () => void } | undefined)?.focusQuery?.();
	}

	/** Re-collects after the viewer has re-rendered and settled, which is when the new rows can be measured. */
	private scheduleSearchRefresh() {
		if (this._searchRefreshQueued) {
			return;
		}
		this._searchRefreshQueued = true;
		this.cancelPendingQuerySearch();
		void (async () => {
			await this.settleDiffLayout();
			this._searchRefreshQueued = false;
			if (this.searchOpen) {
				this.refreshSearch({ resetIndex : true, scroll : true });
			}
		})();
	}

	private refreshSearch(options: { resetIndex: boolean; scroll: boolean }) {
		this.searchPending = false;
		const root         = this.searchOpen ? (this.$el as HTMLElement | null)?.querySelector('.pr-diff-viewer') as HTMLElement | null : null;
		const settings     = { matchCase : this.searchMatchCase, regex : this.searchRegex, wholeWord : this.searchWholeWord };
		const result       = root && this.searchQuery
			? searchFileView(root, this.searchQuery, settings)
			: { invalidPattern : false, matches : [] as FileSearchMatch[], truncated : false };

		this._searchMatches       = result.matches;
		this.searchMatchCount     = result.matches.length;
		this.searchInvalidPattern = result.invalidPattern;
		this.searchTruncated      = result.truncated;
		this.searchMatchIndex     = options.resetIndex ? 0 : Math.min(this.searchMatchIndex, Math.max(0, result.matches.length - 1));

		paintSearchMatches(this._searchMatches, this.searchMatchIndex);
		this.clearSearchRowMark();

		if (options.scroll && this.searchMatchCount) {
			void this.scrollToCurrentMatch();
		}
	}

	/**
	 * Walks the view to the current match, one at a time. Reaching a line in the split diff takes a search
	 * over several frames, so holding Enter down would otherwise have several of those driving the same
	 * scroll position at once; a later request instead waits and is picked up when the running one lands.
	 */
	private async scrollToCurrentMatch(): Promise<void> {
		this._searchScrollToken++;
		if (this._searchScrolling) {
			return;
		}

		this._searchScrolling = true;
		try {
			let served = -1;
			while (served !== this._searchScrollToken) {
				served      = this._searchScrollToken;
				const match = this._searchMatches[this.searchMatchIndex];
				if (!match) {
					return;
				}
				await this.revealSearchMatch(match);
			}
		}
		finally {
			this._searchScrolling = false;
		}
	}

	private async revealSearchMatch(match: FileSearchMatch): Promise<void> {
		if (this.usesVirtualSplitScroll) {
			// Filler rows carry no line number, but they also carry no text, so a match always has one.
			if (match.side && match.lineNum != null) {
				await this.scrollVirtToSplitLine(match.side, match.lineNum);
			}
		}
		else {
			const markdown = this.$refs.markdownDiff as { revealElement?: (el: HTMLElement, rect?: DOMRect) => boolean } | undefined;
			if (!markdown?.revealElement?.(match.element, match.range.getBoundingClientRect())) {
				match.element.scrollIntoView({ behavior : 'auto', block : 'center', inline : 'nearest' });
			}
			await this.$nextTick();
		}

		scrollMatchIntoViewHorizontally(match);
		this.markCurrentSearchRow(match);
	}

	/** Without the Highlight API nothing is painted, so the row itself has to show where the match landed. */
	private markCurrentSearchRow(match: FileSearchMatch) {
		this.clearSearchRowMark();
		if (supportsSearchPainting()) {
			return;
		}
		match.element.classList.add('pr-search-current-row');
		this._searchMarkedRow = match.element;
	}

	private clearSearchRowMark() {
		this._searchMarkedRow?.classList.remove('pr-search-current-row');
		this._searchMarkedRow = null;
	}

	private onPopoverClickOutside(e: MouseEvent) {
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
	}

}
</script>

<style>
@import "@/styles/pr-diff.css";

.pr-files-tab {
	position: relative;
	width: 100%;
	min-width: 0;
	align-self: stretch;
}

/* Floats over the top-right of the viewer rather than pushing it down, so the hits stay where they were. */
.pr-files-search-overlay {
	top: 56px;
	right: 32px;
	z-index: 20;
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

.pr-files-pair-error {
	padding: 8px 12px;
	margin: 6px 0 0;
	color: var(--accent-red);
	background: var(--danger-bg-subtle);
	border: 1px solid var(--danger-border);
	border-radius: var(--radius-sm);
}

.pr-files-pair-error-close {
	padding: 0 4px;
	border: none;
	background: transparent;
	color: inherit;
	font-size: 16px;
	line-height: 1;
}
</style>
