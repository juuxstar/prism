<template>
	<div class="pr-detail-overview u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden">
		<div class="pr-detail-body-grid u-grid u-flex-1 u-min-h-0 u-overflow-y-auto u-items-stretch">
			<section class="pr-detail-col-section pr-detail-col-main pr-detail-overview-stack u-flex u-flex-col u-min-w-0">
				<div class="pr-detail-actions-stats card pr-detail-overview-gutter u-flex u-flex-col u-gap-3 u-m-0">
					<h2 class="u-flex-shrink-0">Actions &amp; stats</h2>
					<div v-if="hasConflicts" class="pr-detail-conflict-alert u-flex u-items-center u-gap-2 u-fs-13 u-fw-600">
						<span class="pr-detail-conflict-dot u-flex-shrink-0"></span>
						<span>This pull request has merge conflicts</span>
					</div>
					<div class="pr-detail-action-groups u-flex u-flex-col u-gap-2">
						<div v-if="showPrActions" class="pr-detail-action-row u-flex u-flex-wrap u-items-center u-gap-2">
							<span class="pr-detail-action-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide u-flex-shrink-0">PR Actions</span>
							<button
								v-if="showApproveAction"
								type="button"
								class="pr-overview-action-btn pr-overview-action-approve u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
								:disabled="approvingPr"
								title="Approve, clear the α/β/γ review and changes requested labels, and add ready to merge"
								@click="$emit('approve-pr')"
							>
								<span v-if="approvingPr" class="async-loader"></span>
								<template v-else>&#10003; Approve</template>
							</button>
							<span
								v-if="showMergeAction"
								class="pr-detail-control-wrap has-tooltip u-inline-flex u-items-center u-relative"
								data-tooltip="Squash all commits into one and merge into the base branch (same as GitHub's squash merge)."
							>
								<button
									type="button"
									class="pr-overview-action-btn pr-overview-action-merge u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
									:disabled="mergingPr"
									@click="$emit('merge-pr')"
								>
									<span v-if="mergingPr" class="async-loader"></span>
									<template v-else>Merge</template>
								</button>
							</span>
							<span
								v-if="showDraftToggle"
								class="pr-detail-control-wrap has-tooltip u-inline-flex u-items-center u-relative"
								:data-tooltip="draftToggleTooltip"
							>
								<button
									type="button"
									class="pr-overview-action-btn pr-overview-action-draft u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
									:disabled="togglingDraft"
									@click="$emit('toggle-draft')"
								>
									<span v-if="togglingDraft" class="async-loader"></span>
									<template v-else>{{ pr.draft ? 'Change to PR' : 'Change to Draft' }}</template>
								</button>
							</span>
							<button
								v-if="showCloseAction"
								type="button"
								class="pr-overview-action-btn pr-overview-action-close u-ml-auto u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
								:disabled="closingPr"
								@click="$emit('close-pr')"
							>
								<span v-if="closingPr" class="async-loader"></span>
								<template v-else>Close</template>
							</button>
						</div>
						<div v-if="showGitActions" class="pr-detail-action-row u-flex u-flex-wrap u-items-center u-gap-2">
							<span class="pr-detail-action-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide u-flex-shrink-0">Git Actions</span>
							<span v-if="showCheckoutAction" class="pr-overview-checkout-control u-inline-flex u-items-center u-gap-2 u-flex-wrap">
								<select
									v-if="showWorktreeSelector"
									v-model="selectedWorktreePath"
									class="pr-overview-worktree-select u-fs-12"
									:disabled="checkingOutPr"
									title="Choose worktree directory"
								>
									<option value="">Choose worktree...</option>
									<option v-for="checkout in worktreeOptions" :key="checkout.path" :value="checkout.path" :disabled="checkout.dirty">
										{{ checkout.label }}{{ checkout.dirty ? ' (dirty)' : '' }}{{ checkout.branch && checkout.branch !== 'HEAD' ? ' - ' + checkout.branch : '' }}
									</option>
								</select>
								<button
									type="button"
									class="pr-overview-action-btn pr-overview-action-checkout u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
									:disabled="checkoutDisabled"
									@click="emitCheckout"
								>
									<span v-if="checkingOutPr" class="async-loader"></span>
									<template v-else>Checkout</template>
								</button>
							</span>
							<button
								v-if="showLocalGitActions"
								type="button"
								class="pr-overview-action-btn pr-overview-action-commit u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
								:disabled="commitLocalDisabled"
								:title="commitLocalTitle"
								@click="$emit('commit-local-changes')"
							>
								<span v-if="committingLocalChanges" class="async-loader"></span>
								<template v-else>Git Commit</template>
							</button>
							<button
								v-if="showLocalGitActions"
								type="button"
								class="pr-overview-action-btn pr-overview-action-push u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
								:disabled="pushLocalDisabled"
								:title="pushLocalTitle"
								@click="$emit('push-local-changes')"
							>
								<span v-if="pushingLocalChanges" class="async-loader"></span>
								<template v-else>Git Push</template>
							</button>
							<button
								v-if="showMergeDefaultBranchAction"
								type="button"
								class="pr-overview-action-btn pr-overview-action-merge-default u-inline-flex u-items-center u-gap-1 u-py-1-5 u-px-3 u-fs-13 u-fw-600 u-cursor-pointer u-whitespace-nowrap"
								:disabled="mergeDefaultBranchDisabled"
								:title="mergeDefaultBranchTitle"
								@click="$emit('merge-default-branch')"
							>
								<span v-if="mergingDefaultBranch" class="async-loader"></span>
								<template v-else>Merge origin/{{ defaultBranch }}</template>
							</button>
							<span v-if="defaultBranchBehindText" class="pr-overview-behind-label u-ml-auto u-fs-12 u-whitespace-nowrap">{{ defaultBranchBehindText }}</span>
						</div>
						<div class="pr-detail-action-row u-flex u-flex-wrap u-items-center u-gap-2">
							<span class="pr-detail-action-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide u-flex-shrink-0">Labels</span>
							<span v-for="label in pr.labels" :key="label.id" class="pr-detail-label u-inline-flex u-items-center u-gap-1 u-fs-12 u-fw-500 u-whitespace-nowrap" :style="labelStyle(label)">
								{{ label.name }}
								<button class="pr-detail-label-remove u-fs-14 u-leading-1 u-cursor-pointer" :title="'Remove ' + label.name" @click="$emit('remove-label', label.name)">&times;</button>
							</span>
							<span v-if="!pr.labels.length" class="pr-detail-empty u-flex-shrink-0 u-fs-13 u-text-tertiary">No labels</span>
							<div class="pr-detail-add-label u-relative">
								<button
									type="button"
									class="pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
									@click="toggleLabelDropdown"
								>
									+ Add label
								</button>
								<div v-if="labelDropdownOpen" class="pr-detail-label-dropdown u-absolute u-top-full u-left-0 u-mt-1 u-flex u-flex-col u-z-100">
									<input v-model="labelSearch" class="pr-detail-label-search u-py-2 u-px-3 u-fs-13" placeholder="Filter labels..." @keydown.escape="labelDropdownOpen = false" />
									<ul class="pr-detail-label-options u-list-none u-overflow-y-auto u-m-0 u-p-0">
										<li
											v-for="label in filteredRepoLabels"
											:key="label.id"
											class="pr-detail-label-option u-flex u-items-center u-gap-2 u-py-2 u-px-3 u-fs-13 u-text-primary u-cursor-pointer"
											@click="handleAddLabel(label.name)"
										>
											<span class="pr-detail-label-swatch u-flex-shrink-0" :style="{ background : '#' + label.color }"></span>
											{{ label.name }}
										</li>
										<li v-if="!filteredRepoLabels.length" class="pr-detail-label-option pr-detail-label-option-empty u-py-2 u-px-3 u-fs-13 u-text-tertiary">No matching labels</li>
									</ul>
								</div>
							</div>
						</div>
					</div>
					<p v-if="checkoutError" class="pr-overview-checkout-error u-m-0 u-fs-13">{{ checkoutError }}</p>
					<p v-if="localGitError" class="pr-overview-checkout-error u-m-0 u-fs-13">{{ localGitError }}</p>
					<div class="pr-detail-stat-grid u-flex u-flex-wrap u-items-start u-gap-3 u-text-center">
						<div class="pr-detail-stat pr-detail-stat-author u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">Author</span>
							<div class="pr-detail-stat-author-row u-flex u-items-center u-gap-1-5 u-fs-12 u-fw-600 u-text-primary">
								<img v-if="pr.user?.avatar_url" :src="pr.user.avatar_url" class="pr-detail-avatar u-flex-shrink-0" alt="" />
								<span class="u-min-w-0">{{ authorDisplayName }}</span>
							</div>
						</div>
						<div class="pr-detail-stat pr-detail-stat-branch u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">Branch</span>
							<div
								class="pr-detail-stat-value pr-detail-stat-branch-wrap u-flex u-flex-wrap u-items-center u-gap-1 u-fs-12 u-fw-600 u-font-mono u-leading-1-4"
								:title="branchCompareTitle"
							>
								<span class="pr-detail-branch-piece u-min-w-0 u-text-primary">{{ headBranchText }}</span>
								<span class="pr-detail-branch-arrow u-flex-shrink-0 u-text-tertiary u-fw-500" aria-hidden="true">→</span>
								<span class="pr-detail-branch-piece u-min-w-0 u-text-primary">{{ baseBranchText }}</span>
							</div>
						</div>
						<div v-if="checkoutStatusText" class="pr-detail-stat pr-detail-stat-checkout u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">Checkout</span>
							<div class="pr-detail-checkout-row u-flex u-items-center u-gap-1-5 u-min-w-0">
								<span class="pr-detail-stat-value pr-detail-checkout-state u-fs-12 u-fw-600 u-font-mono u-leading-1-4 u-text-primary" :title="checkoutStatusTitle">{{ checkoutStatusText }}</span>
								<a
									v-if="cursorCheckoutHref"
									:href="cursorCheckoutHref"
									class="pr-detail-open-cursor-link u-flex-shrink-0 u-fs-11 u-fw-600"
									:title="'Open ' + cursorCheckoutPath + ' in Cursor'"
								>
									Open in Cursor
								</a>
							</div>
						</div>
						<div class="pr-detail-stat pr-detail-stat-url u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">GitHub PR URL</span>
							<div class="pr-detail-stat-url-row u-flex u-items-center u-gap-1-5 u-min-w-0">
								<a
									:href="prUrl"
									target="_blank"
									rel="noopener"
									class="pr-detail-stat-url-link u-min-w-0 u-fs-12 u-fw-600 u-font-mono"
									:title="prUrl"
								>
									{{ prUrl }}
								</a>
								<button
									type="button"
									class="pr-detail-stat-copy-btn u-inline-flex u-items-center u-justify-center u-flex-shrink-0 u-cursor-pointer"
									:class="{ copied : prUrlCopyState === 'copied' }"
									:title="prUrlCopyState === 'copied' ? 'Copied' : 'Copy URL'"
									:aria-label="prUrlCopyState === 'copied' ? 'Copied PR URL' : 'Copy PR URL'"
									@click="copyPrUrl"
									v-html="prUrlCopyIcon"
								></button>
							</div>
						</div>
						<div class="pr-detail-stat u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-value u-fs-20 u-fw-600 u-text-primary">{{ pr.changed_files }}</span>
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">Files</span>
						</div>
						<div class="pr-detail-stat pr-detail-stat-add u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-value u-fs-20 u-fw-600">+{{ pr.additions }}</span>
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">Additions</span>
						</div>
						<div class="pr-detail-stat pr-detail-stat-del u-flex u-flex-col u-gap-0-5">
							<span class="pr-detail-stat-value u-fs-20 u-fw-600">&minus;{{ pr.deletions }}</span>
							<span class="pr-detail-stat-label u-fs-11 u-text-tertiary u-uppercase u-tracking-wide">Deletions</span>
						</div>
					</div>
				</div>

				<div class="pr-detail-description card pr-detail-overview-gutter u-flex u-flex-col u-m-0">
					<h2 class="u-flex-shrink-0">Description</h2>
					<div v-if="pr.body" class="pr-detail-body-text markdown-body" v-html="pr.body_html || pr.body"></div>
					<p v-else class="pr-detail-empty u-flex-shrink-0 u-fs-13 u-text-tertiary">No description provided</p>
				</div>
			</section>

			<section class="pr-detail-col-section pr-detail-col-comments pr-detail-overview-stack u-flex u-flex-col u-min-w-0">
				<div class="pr-detail-comments card pr-detail-overview-gutter u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden u-m-0">
					<h2 class="u-flex-shrink-0">Comments ({{ commentsUnresolvedTotalLabel }})</h2>
					<div v-if="commentsLoading" class="pr-detail-comments-loading u-flex u-items-center u-gap-2 u-fs-13 u-text-secondary u-flex-shrink-0">
						<span class="async-loader"></span> Loading comments...
					</div>
					<ul v-else-if="sortedOverviewComments.length" class="pr-detail-comments-list u-flex u-flex-col u-gap-3 u-flex-1 u-min-h-0 u-overflow-y-auto u-m-0 u-p-0">
						<li
							v-for="item in sortedOverviewComments"
							:key="item.key"
							class="pr-detail-comment-block"
							:class="commentBlockClass(item)"
						>
							<template v-if="item.kind === 'issue'">
								<div class="pr-detail-comment-meta u-flex u-flex-wrap u-items-center u-gap-2 u-mb-2">
									<img :src="item.comment.user.avatar_url" class="pr-detail-comment-avatar u-flex-shrink-0" alt="" />
									<span class="pr-detail-comment-author">{{ item.comment.user.login }}</span>
									<span class="pr-detail-comment-time">{{ timeAgo(item.comment.created_at) }}</span>
									<span class="pr-detail-comment-badge">Conversation</span>
								</div>
								<div class="markdown-body pr-detail-comment-body" v-html="markdownConversation(item.comment.body)"></div>
								<div class="pr-detail-issue-reply u-mt-2 u-flex u-flex-col u-gap-2">
									<button
										v-if="issueReplyDraftId !== item.comment.id"
										type="button"
										class="pr-detail-issue-reply-btn pr-overview-reply-hit pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
										@click="openIssueReplyDraft(item.comment.id)"
									>
										Reply
									</button>
									<div v-else class="pr-detail-issue-reply-compose u-flex u-flex-col u-gap-2">
										<textarea
											v-model="issueReplyBody"
											class="pr-detail-issue-reply-field u-w-full"
											rows="3"
											placeholder="Reply to this conversation…"
											:disabled="issueReplySubmitting"
											@keydown.meta.enter.prevent="submitIssueReply"
											@keydown.ctrl.enter.prevent="submitIssueReply"
										/>
										<div class="u-flex u-gap-2 u-flex-wrap u-justify-end">
											<button
												type="button"
												class="pr-detail-compact-btn u-fs-11 u-fw-600"
												:disabled="issueReplySubmitting"
												@click="cancelIssueReply"
											>
												Cancel
											</button>
											<button
												type="button"
												class="pr-detail-compact-btn u-fs-11 u-fw-600 pr-detail-issue-send"
												:disabled="issueReplySubmitting || !issueReplyBody.trim()"
												@click="submitIssueReply"
											>
												<span v-if="issueReplySubmitting" class="async-loader"></span>
												<template v-else>Comment</template>
											</button>
										</div>
									</div>
								</div>
							</template>
							<template v-else>
								<template v-if="item.thread.resolved && !isResolvedThreadExpanded(item.thread.id)">
									<div class="pr-detail-resolved-compact u-flex u-items-start u-justify-between u-gap-2-5">
										<button
											type="button"
											class="pr-detail-resolved-title-btn u-flex u-items-start u-gap-1-5 u-p-0 u-m-0 u-flex-grow-1 u-min-w-0 u-text-left u-fs-12 u-cursor-pointer"
											title="Show full thread"
											@click="expandResolvedThread(item.thread.id)"
										>
											<span class="pr-detail-resolved-chevron u-flex-shrink-0 u-fs-11 u-mt-0-5" aria-hidden="true">▸</span>
											<span class="pr-detail-resolved-title-text">{{ resolvedThreadBriefTitle(item.thread) }}</span>
										</button>
										<div class="pr-detail-resolved-compact-actions u-inline-flex u-items-start u-gap-2 u-flex-shrink-0">
											<button
												v-if="item.thread.line != null"
												type="button"
												class="pr-overview-reply-hit pr-detail-thread-file-link-mini pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
												title="Switch to PR Files, jump to comment"
												@click.stop="emitOpenReviewInFiles(item.thread)"
											>
												File
											</button>
										</div>
									</div>
								</template>
								<template v-else>
									<div class="pr-detail-review-head">
										<div v-if="item.thread.resolved" class="pr-detail-comment-card-top u-flex u-items-center u-justify-end u-gap-2 u-mb-1-5">
											<span class="pr-detail-comment-card-actions-tr u-inline-flex u-items-center u-gap-2 u-flex-shrink-0">
												<button
													v-if="item.thread.resolved"
													type="button"
													class="pr-detail-compact-btn pr-detail-collapse-thread-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
													title="Show condensed view"
													@click="collapseResolvedThread(item.thread.id)"
											>
													Less
												</button>
											</span>
										</div>
										<div class="pr-detail-comment-thread-header u-flex u-flex-wrap u-items-center u-gap-2">
											<button
												v-if="item.thread.line != null"
												type="button"
												class="pr-detail-thread-path-link pr-detail-compact-btn u-inline-flex u-items-baseline u-min-w-0 u-text-left u-p-0 u-m-0 u-border-none u-bg-transparent u-cursor-pointer"
												title="Open this file at the comment in the PR Files tab"
												@click="emitOpenReviewInFiles(item.thread)"
											>
												<span class="pr-detail-thread-path-text">{{ item.thread.path }}</span>
												<span class="pr-detail-comment-sep u-flex-shrink-0">&middot;</span>
												<span class="pr-detail-thread-line-snippet u-flex-shrink-0">Line {{ item.thread.line }} ({{ item.thread.side }})</span>
											</button>
											<span v-else class="pr-detail-comment-path">{{ item.thread.path }}</span>
											<span class="pr-detail-comment-thread-status" :class="item.thread.resolved ? 'resolved' : 'open'">{{ item.thread.resolved ? "Resolved" : "Open" }}</span>
										</div>
									</div>
									<div v-for="c in item.thread.comments" :key="c.id" class="pr-detail-comment-review-reply">
										<div class="pr-detail-comment-meta u-flex u-flex-wrap u-items-center u-gap-2 u-mb-2">
											<img :src="c.user.avatar_url" class="pr-detail-comment-avatar u-flex-shrink-0" alt="" />
											<span class="pr-detail-comment-author">{{ c.user.login }}</span>
											<span class="pr-detail-comment-time">{{ timeAgo(c.created_at) }}</span>
											<span class="pr-detail-comment-badge">Review</span>
										</div>
										<div class="markdown-body pr-detail-comment-body" v-html="markdownReview(c.body)"></div>
									</div>
									<div class="pr-detail-review-thread-reply-footer u-flex u-items-center u-justify-end u-gap-2 u-mt-2">
										<button
											type="button"
											class="pr-overview-reply-hit pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
											@click.stop="openReviewReplyPopover(item.thread, $event)"
										>
											Reply
										</button>
										<button
											v-if="item.thread.threadNodeId"
											type="button"
											class="pr-detail-compact-btn u-inline-flex u-items-center u-justify-center u-gap-1-5 u-py-0-5 u-px-2-5 u-fs-11 u-fw-600 u-cursor-pointer"
											:disabled="resolveTogglingThreadId === item.thread.id"
											:title="item.thread.resolved ? 'Mark this review thread as open again' : 'Mark this review thread as resolved'"
											@click="toggleThreadResolved(item.thread)"
										>
											<span v-if="resolveTogglingThreadId === item.thread.id" class="async-loader"></span>
											<template v-else>{{ item.thread.resolved ? "Unresolve" : "Resolve" }}</template>
										</button>
									</div>
								</template>
							</template>
						</li>
					</ul>
					<p v-else class="pr-detail-empty u-flex-shrink-0 u-fs-13 u-text-tertiary">No comments on this pull request yet</p>
				</div>
			</section>

			<section class="pr-detail-col-section pr-detail-col-checks">
				<div class="pr-detail-checks card pr-detail-overview-gutter u-flex u-flex-col">
					<h2 class="u-flex-shrink-0">Checks ({{ checksSummaryText }})</h2>
					<div v-if="checksLoading" class="pr-detail-checks-loading u-flex u-items-center u-gap-2 u-fs-13 u-text-secondary u-flex-shrink-0">
						<span class="async-loader"></span> Loading checks...
					</div>
					<ul v-else-if="checks.length" class="pr-detail-checks-list u-list-none u-flex u-flex-col u-gap-1-5">
						<li v-for="check in checks" :key="check.name" class="pr-detail-check-item u-flex u-flex-col u-gap-0 u-py-2 u-px-2-5 u-fs-13">
							<div class="pr-detail-check-row u-flex u-items-center u-gap-2-5 u-w-full">
								<span
									class="pr-detail-check-icon u-flex-shrink-0"
									:class="checkIconClass(check)"
									>{{ checkIcon(check) }}</span>
								<span class="pr-detail-check-name u-min-w-0 u-flex-grow-1 u-truncate">
									<a v-if="check.url" :href="check.url" target="_blank" rel="noopener">{{ check.name }}</a>
									<span v-else>{{ check.name }}</span>
								</span>
								<span class="pr-detail-check-conclusion u-flex-shrink-0">
									{{ checkLabel(check) }}<template v-if="checkDuration(check)"> · {{ checkDuration(check) }}</template>
								</span>
							</div>
							<ul v-if="failureAnnotations(check).length" class="pr-detail-annotations u-list-none u-flex u-flex-col u-gap-1 u-w-full">
								<li v-for="(ann, idx) in failureAnnotations(check)" :key="idx" class="pr-detail-annotation u-flex u-flex-col u-gap-0-5 u-py-1-5 u-px-2-5 u-fs-12">
									<span class="pr-detail-annotation-location">{{ ann.path }}<template v-if="ann.startLine">:{{ ann.startLine }}</template></span>
									<span v-if="ann.title" class="pr-detail-annotation-title">{{ ann.title }}</span>
									<span class="pr-detail-annotation-message">{{ ann.message }}</span>
								</li>
							</ul>
							<div v-if="testFailureState(check)" class="pr-detail-test-failures u-flex u-flex-col u-gap-1-5 u-w-full">
								<span v-if="testFailureState(check)?.loading" class="u-fs-12 u-text-secondary u-inline-flex u-items-center u-gap-1-5"><span class="async-loader"></span> Loading individual test failures...</span>
								<ul v-else-if="testFailureState(check)?.failures.length" class="pr-detail-annotations u-list-none u-flex u-flex-col u-gap-1 u-w-full">
									<li v-for="(failure, idx) in testFailureState(check)?.failures" :key="idx" class="pr-detail-annotation pr-detail-test-failure u-flex u-flex-col u-gap-0-5 u-py-1-5 u-px-2-5 u-fs-12">
										<span v-if="failure.file" class="pr-detail-annotation-location">{{ failure.file }}<template v-if="failure.line">:{{ failure.line }}</template></span>
										<span class="pr-detail-annotation-title">{{ failure.fullTitle }}</span>
										<span class="pr-detail-annotation-message">{{ failure.message }}</span>
										<pre v-if="failure.stack" class="pr-detail-test-failure-stack u-m-0">{{ failure.stack }}</pre>
									</li>
								</ul>
							</div>
						</li>
					</ul>
					<p v-else class="pr-detail-empty u-flex-shrink-0 u-fs-13 u-text-tertiary">No checks found</p>
				</div>
			</section>
		</div>

		<Teleport to="body">
			<comment-popover
				v-if="reviewPopoverThread && reviewPopoverAnchor && reviewPopoverLine != null"
				:thread="reviewPopoverThreadPayload"
				:pending-comment="null"
				:path="reviewPopoverThread.path"
				:line="reviewPopoverLine"
				:side="reviewPopoverSide"
				:anchor-rect="reviewPopoverAnchor"
				:line-content="reviewPopoverSuggestionLineSnippet"
				:owner="owner"
				:repo="repo"
				:pr-number="prNumber"
				:commit-id="commitId"
				@close="closeReviewReplyPopover"
				@comments-updated="onReviewPopoverCommentsUpdated"
			/>
		</Teleport>
	</div>
</template>

<script lang="ts">
import type { GitCheckout, GitWorkspaceStatus, LocalPrStatus, PullRequestCheckoutState } from '@/lib/api/gitCheckoutClient';
import { checkoutStateForPr, checkoutTargetForPr, defaultBranchForPr }                   from '@/lib/api/gitCheckoutClient';
import type {
	CheckAnnotation, CheckRunDetail, IssueComment, PullRequestLocation, RepoLabel, ReviewComment, TestFailure
} from '@/lib/api/githubClient';
import GitHubClient, { isPullRequestConflicted, stripCommentTypePrefix } from '@/lib/api/githubClient';
import type { CommentThread }   from '@/lib/diff/prDiffTypes';
import { renderGithubMarkdown } from '@/lib/githubMarkdown';
import { iconSvg }              from '@/lib/icons';
import { formatDuration, timeAgo, toCursorFileHref }                     from '@/lib/utils';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

interface OverviewThread {
	id: number;
	path: string;
	line: number | null;
	side: string;
	comments: ReviewComment[];
	created_at: string;
	resolved: boolean;
	threadNodeId?: string;
}

type OverviewRow = { kind: 'issue'; key: string; sortTime: number; comment: IssueComment } | { kind: 'review-thread'; key: string; sortTime: number; thread: OverviewThread };

interface TestFailureState {
	loading: boolean;
	failures: TestFailure[];
}

@Component({
	emits : [ 'add-label', 'remove-label', 'comments-updated', 'approve-pr', 'merge-pr', 'close-pr', 'toggle-draft', 'open-review-in-files', 'checkout-pr', 'commit-local-changes', 'push-local-changes', 'merge-default-branch' ],
})
export default class PrOverviewTab extends Vue {

	@Prop({ required : true }) readonly pr!: any;
	@Prop({ required : true }) readonly owner!: string;
	@Prop({ required : true }) readonly repo!: string;
	@Prop({ required : true }) readonly prNumber!: number;
	/** Head commit SHA; required when replying / applying suggestions */
	@Prop({ required : true }) readonly commitId!: string;
	@Prop({ required : true }) readonly checks!: CheckRunDetail[];
	@Prop({ required : true }) readonly checksLoading!: boolean;
	@Prop({ required : true }) readonly repoLabels!: RepoLabel[];
	@Prop({ default : () => [] }) readonly reviewComments!: ReviewComment[];
	@Prop({ default : () => [] }) readonly issueComments!: IssueComment[];
	@Prop({ default : false }) readonly commentsLoading!: boolean;
	@Prop({ default : null }) readonly reviewDecision!: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
	@Prop({ default : false }) readonly showMergeAction!: boolean;
	@Prop({ default : false }) readonly approvingPr!: boolean;
	@Prop({ default : false }) readonly mergingPr!: boolean;
	@Prop({ default : false }) readonly closingPr!: boolean;
	@Prop({ default : false }) readonly togglingDraft!: boolean;
	@Prop({ default : null }) readonly checkoutStatus!: GitWorkspaceStatus | null;
	@Prop({ default : null }) readonly localPrStatus!: LocalPrStatus | null;
	@Prop({ default : false }) readonly checkingOutPr!: boolean;
	@Prop({ default : false }) readonly committingLocalChanges!: boolean;
	@Prop({ default : false }) readonly pushingLocalChanges!: boolean;
	@Prop({ default : false }) readonly mergingDefaultBranch!: boolean;
	@Prop({ default : '' }) readonly checkoutError!: string;
	@Prop({ default : '' }) readonly localGitError!: string;

	readonly timeAgo = timeAgo;

	labelDropdownOpen = false;
	labelSearch       = '';
	/** Root review comment id while a resolve/unresolve request is in flight */
	resolveTogglingThreadId: number | null              = null;
	testFailureStates: Record<string, TestFailureState> = {};

	/** Bumped every second while checks are in progress so elapsed times stay current. */
	checkDurationTick = 0;
	private _checkDurationTimer: ReturnType<typeof setInterval> | null = null;

	/** Review thread ids whose resolved threads are shown expanded (default collapsed). */
	resolvedThreadsExpanded: Record<number, true> = {};

	reviewPopoverThread: OverviewThread | null = null;
	reviewPopoverAnchor: DOMRect | null        = null;
	reviewPopoverLine: number | null           = null;
	reviewPopoverSide: 'LEFT' | 'RIGHT'        = 'RIGHT';

	issueReplyDraftId: number | null        = null;
	issueReplyBody                          = '';
	issueReplySubmitting                    = false;
	prUrlCopyState: 'idle' | 'copied'       = 'idle';
	selectedWorktreePath                    = '';
	private prUrlCopyResetId: number | null = null;

	get reviewPopoverThreadPayload(): CommentThread | null {
		const t = this.reviewPopoverThread;
		return !t || t.line == null ? null : { path : t.path, line : t.line, side : this.toReviewSide(t.side), comments : t.comments };
	}

	get reviewPopoverSuggestionLineSnippet(): string {
		const first = this.reviewPopoverThread?.comments[0]?.body ?? '';
		return stripCommentTypePrefix(first).split('\n')[0]?.trimEnd() ?? '';
	}

	/** Unresolved count / total rows (issue comments + review threads). Issue comments count as unresolved. */
	get commentsUnresolvedTotalLabel(): string {
		if (this.commentsLoading) {
			return '... / ...';
		}
		const issues            = this.issueComments.length;
		const threads           = this.reviewCommentThreads;
		const unresolvedThreads = threads.filter(t => !t.resolved).length;
		const unresolved        = issues + unresolvedThreads;
		const total             = issues + threads.length;
		return `${unresolved} / ${total}`;
	}

	get headBranchText(): string {
		const h = this.pr?.head;
		return h ? String(h.label || h.ref || '—') : '—';
	}

	get baseBranchText(): string {
		const b = this.pr?.base;
		return b ? String(b.ref || '—') : '—';
	}

	get branchCompareTitle(): string {
		return `${this.headBranchText} into ${this.baseBranchText}`;
	}

	get prUrl(): string {
		return String(this.pr?.html_url || `https://github.com/${this.owner}/${this.repo}/pull/${this.prNumber}`);
	}

	get prUrlCopyIcon(): string {
		return iconSvg(this.prUrlCopyState === 'copied' ? 'checkmark' : 'copy', 14);
	}

	get authorDisplayName(): string {
		return !this.pr?.user?.login ? '—' : GitHubClient.getFirstName(this.pr.user.login);
	}

	get showApproveAction(): boolean {
		return Boolean(this.pr && this.pr.state === 'open' && !this.pr.merged && this.reviewDecision !== 'APPROVED');
	}

	get showCloseAction(): boolean {
		return Boolean(this.pr && this.pr.state === 'open' && !this.pr.merged);
	}

	get showDraftToggle(): boolean {
		return Boolean(this.pr && this.pr.state === 'open' && !this.pr.merged);
	}

	get showPrActions(): boolean {
		return this.showApproveAction || this.showMergeAction || this.showCloseAction || this.showDraftToggle;
	}

	get showGitActions(): boolean {
		return this.showCheckoutAction || this.showLocalGitActions;
	}

	get checkoutState(): PullRequestCheckoutState | null {
		return checkoutStateForPr(this.pr, this.checkoutStatus);
	}

	get checkoutWorkspaceReady(): boolean {
		return this.checkoutStatus?.mode === 'single' || this.checkoutStatus?.mode === 'worktree-parent';
	}

	get showCheckoutAction(): boolean {
		return Boolean(this.pr && this.pr.state === 'open' && !this.pr.merged && this.checkoutWorkspaceReady && checkoutTargetForPr(this.pr) && !this.checkoutState);
	}

	get showLocalGitActions(): boolean {
		return Boolean(this.pr && this.pr.state === 'open' && !this.pr.merged && this.checkoutState);
	}

	get commitLocalDisabled(): boolean {
		return this.committingLocalChanges || this.pushingLocalChanges || !this.localPrStatus?.hasLocalChanges;
	}

	get pushLocalDisabled(): boolean {
		const aheadCount = this.localPrStatus?.aheadCount ?? 0;
		return this.pushingLocalChanges || this.committingLocalChanges || aheadCount < 1;
	}

	get commitLocalTitle(): string {
		if (this.localPrStatus?.hasLocalChanges) {
			return 'Commit all current local changes in the checked-out pull request';
		}
		return 'No local changes to commit';
	}

	get pushLocalTitle(): string {
		const aheadCount = this.localPrStatus?.aheadCount ?? 0;
		if (aheadCount > 0) {
			return `Push ${aheadCount} committed change${aheadCount === 1 ? '' : 's'} to the pull request branch`;
		}
		return 'No committed changes to push';
	}

	get defaultBranch(): string {
		return defaultBranchForPr(this.pr);
	}

	/** Only offered on a local checkout: the merge happens in that worktree, not on GitHub. */
	get showMergeDefaultBranchAction(): boolean {
		return this.showLocalGitActions && Boolean(this.defaultBranch);
	}

	/** Commits on the default branch the checkout is missing, or null while that is still unknown. */
	get defaultBranchBehindCount(): number | null {
		return this.localPrStatus?.behindDefaultBranchCount ?? null;
	}

	/** Right-aligned on the Git Actions row; empty while the count is unknown, so nothing is implied. */
	get defaultBranchBehindText(): string {
		const behind = this.defaultBranchBehindCount;
		if (!this.showMergeDefaultBranchAction || behind == null) {
			return '';
		}
		if (behind === 0) {
			return `Up to date with origin/${this.defaultBranch}`;
		}
		return `${behind} commit${behind === 1 ? '' : 's'} behind origin/${this.defaultBranch}`;
	}

	get mergeDefaultBranchDisabled(): boolean {
		if (this.mergingDefaultBranch || this.committingLocalChanges || this.pushingLocalChanges) {
			return true;
		}
		return this.defaultBranchBehindCount === 0 || Boolean(this.localPrStatus?.hasLocalChanges);
	}

	get mergeDefaultBranchTitle(): string {
		if (this.defaultBranchBehindCount === 0) {
			return `Already up to date with origin/${this.defaultBranch}`;
		}
		if (this.localPrStatus?.hasLocalChanges) {
			return `Commit or discard local changes before merging origin/${this.defaultBranch}`;
		}
		return `Pull the checked-out pull request branch, then merge the latest origin/${this.defaultBranch} into it`;
	}

	get worktreeOptions(): GitCheckout[] {
		return this.checkoutStatus?.mode !== 'worktree-parent' ? [] : this.checkoutStatus.checkouts;
	}

	get showWorktreeSelector(): boolean {
		return this.checkoutStatus?.mode === 'worktree-parent';
	}

	get checkoutDisabled(): boolean {
		if (this.checkingOutPr) {
			return true;
		}
		return this.showWorktreeSelector ? !this.selectedWorktreePath : false;
	}

	get checkoutStatusText(): string {
		if (this.checkoutState) {
			return this.checkoutState.shaMatches ? `Checked out in ${this.checkoutState.label}` : `Checked out in ${this.checkoutState.label} (behind PR head)`;
		}
		if (this.checkoutStatus?.mode === 'worktree-parent') {
			return `${this.checkoutStatus.checkouts.length} worktrees available`;
		}
		return this.checkoutStatus?.mode === 'single' ? 'Checkout workspace ready' : '';
	}

	get checkoutStatusTitle(): string {
		return this.checkoutState ? this.checkoutState.path : this.checkoutStatus?.workspaceDir || '';
	}

	get cursorCheckoutPath(): string {
		return this.checkoutState?.hostPath || this.checkoutState?.path || '';
	}

	get cursorCheckoutHref(): string {
		const path = this.cursorCheckoutPath;
		return path ? toCursorFileHref(path) : '';
	}

	@Watch('checkoutStatus', { immediate : true, deep : true })
	onCheckoutStatusChanged(): void {
		if (!this.showWorktreeSelector) {
			this.selectedWorktreePath = '';
			return;
		}
		if (this.selectedWorktreePath && this.worktreeOptions.some(checkout => checkout.path === this.selectedWorktreePath && !checkout.dirty)) {
			return;
		}
		this.selectedWorktreePath = this.worktreeOptions.find(checkout => !checkout.dirty)?.path || '';
	}

	get hasConflicts(): boolean {
		return isPullRequestConflicted(this.pr);
	}

	get draftToggleTooltip(): string {
		if (!this.pr) {
			return '';
		}
		return this.pr.draft ? 'Publish this pull request (remove draft), same as on GitHub.' : 'Convert to draft: stays open but is not ready for review until you publish.';
	}

	get reviewCommentThreads(): OverviewThread[] {
		const list     = this.reviewComments || [];
		const rootMap  = new Map<number, ReviewComment>();
		const replyMap = new Map<number, ReviewComment[]>();
		for (const c of list) {
			if (c.in_reply_to_id) {
				const rid = c.in_reply_to_id;
				const arr = replyMap.get(rid);
				if (arr) {
					arr.push(c);
				}
				else {
					replyMap.set(rid, [ c ]);
				}
			}
			else {
				rootMap.set(c.id, c);
			}
		}
		const threads: OverviewThread[] = [];
		for (const [ rootId, root ] of rootMap) {
			const replies  = replyMap.get(rootId) || [];
			const all      = [ root, ...replies ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
			const resolved = !all.some(c => c.isResolved === false);
			threads.push({
				id           : rootId,
				path         : root.path,
				line         : root.line,
				side         : root.side,
				comments     : all,
				created_at   : root.created_at,
				resolved,
				threadNodeId : root.threadNodeId,
			});
		}
		return threads;
	}

	get sortedOverviewComments(): OverviewRow[] {
		const rows: OverviewRow[] = [];
		for (const comment of this.issueComments || []) {
			rows.push({ kind : 'issue', key : `issue-${comment.id}`, sortTime : new Date(comment.created_at).getTime(), comment });
		}
		for (const thread of this.reviewCommentThreads) {
			rows.push({
				kind     : 'review-thread',
				key      : `thread-${thread.id}`,
				sortTime : new Date(thread.created_at).getTime(),
				thread,
			});
		}
		rows.sort((a, b) => b.sortTime - a.sortTime);
		return rows;
	}

	commentBlockClass(item: OverviewRow): string[] {
		if (item.kind === 'issue') {
			return [ 'pr-detail-comment-issue' ];
		}
		return item.thread.resolved
			? [ 'pr-detail-comment-review', 'pr-detail-comment-resolved' ]
			: [ 'pr-detail-comment-review' ];
	}

	isResolvedThreadExpanded(threadId: number): boolean {
		return !!this.resolvedThreadsExpanded[threadId];
	}

	expandResolvedThread(threadId: number) {
		this.resolvedThreadsExpanded = { ...this.resolvedThreadsExpanded, [threadId] : true };
	}

	collapseResolvedThread(threadId: number) {
		const next = { ...this.resolvedThreadsExpanded };
		delete next[threadId];
		this.resolvedThreadsExpanded = next;
	}

	/** One-line summary for collapsed resolved threads (path, line, truncated body). */
	resolvedThreadBriefTitle(thread: OverviewThread): string {
		const first    = thread.comments[0]?.body || '';
		const stripped = stripCommentTypePrefix(first)
			.replace(/```[\s\S]*?```/g, ' ')
			.replace(/`[^`]*`/g, ' ')
			.replace(/\[[^\]]*\]\([^)]*\)/g, '$1')
			.replace(/[#*_~]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		const preview = stripped.length > 64 ? `${stripped.slice(0, 61).trimEnd()}…` : stripped;
		const loc     = thread.line != null ? ` · line ${thread.line}` : '';
		const file    = thread.path.split('/').pop() || thread.path;
		const head    = `${file}${loc}`;
		return preview ? `${head} — ${preview}` : head;
	}

	markdownConversation(body: string): string {
		return renderGithubMarkdown(body);
	}

	markdownReview(body: string): string {
		return renderGithubMarkdown(stripCommentTypePrefix(body));
	}

	/** Which pull request this thread belongs to, so resolving writes straight into that record. */
	get prLocation(): PullRequestLocation {
		return { owner : this.owner, repo : this.repo, number : this.prNumber };
	}

	async toggleThreadResolved(thread: OverviewThread) {
		const nodeId = thread.threadNodeId;
		if (!nodeId || this.resolveTogglingThreadId != null) {
			return;
		}
		this.resolveTogglingThreadId = thread.id;
		try {
			await GitHubClient.setReviewThreadResolved(nodeId, !thread.resolved, this.prLocation);
			this.$emit('comments-updated');
		}
		catch (e: any) {
			console.error('Failed to toggle review thread resolved:', e);
		}
		finally {
			this.resolveTogglingThreadId = null;
		}
	}

	async copyPrUrl() {
		try {
			await navigator.clipboard.writeText(this.prUrl);
			this.prUrlCopyState = 'copied';
			if (this.prUrlCopyResetId != null) {
				window.clearTimeout(this.prUrlCopyResetId);
			}
			this.prUrlCopyResetId = window.setTimeout(() => {
				this.prUrlCopyState   = 'idle';
				this.prUrlCopyResetId = null;
			}, 2000);
		}
		catch {
			const link = this.$el?.querySelector?.('.pr-detail-stat-url-link') as HTMLElement | null;
			if (!link) {
				return;
			}
			const range = document.createRange();
			range.selectNodeContents(link);
			const sel = window.getSelection();
			sel?.removeAllRanges();
			sel?.addRange(range);
		}
	}

	get checksSummaryText(): string {
		if (this.checksLoading) {
			return '...';
		}
		if (!this.checks.length) {
			return '0';
		}
		const passed          = this.checks.filter(c => this.isCheckPassed(c)).length;
		const failed          = this.checks.filter(c => this.isCheckFailed(c)).length;
		const pending         = this.checks.length - passed - failed;
		const parts: string[] = [];
		if (passed) {
			parts.push(`${passed} passed`);
		}
		if (failed) {
			parts.push(`${failed} failed`);
		}
		if (pending) {
			parts.push(`${pending} pending`);
		}
		return parts.join(', ');
	}

	get currentLabelNames(): Set<string> {
		return new Set((this.pr?.labels || []).map((l: any) => l.name.toLowerCase()));
	}

	get filteredRepoLabels(): RepoLabel[] {
		const current = this.currentLabelNames;
		const search  = this.labelSearch.toLowerCase();
		return this.repoLabels.filter(l => !current.has(l.name.toLowerCase())).filter(l => l.name.toLowerCase().includes(search));
	}

	isCheckPassed(check: CheckRunDetail): boolean {
		return [ 'success', 'neutral', 'skipped' ].includes(check.conclusion ?? '');
	}

	isCheckFailed(check: CheckRunDetail): boolean {
		return [ 'failure', 'timed_out', 'cancelled', 'error' ].includes(check.conclusion ?? '');
	}

	checkIconClass(check: CheckRunDetail): string {
		if (this.isCheckPassed(check)) {
			return 'check-passed';
		}
		return this.isCheckFailed(check) ? 'check-failed' : 'check-pending';
	}

	checkIcon(check: CheckRunDetail): string {
		if (this.isCheckPassed(check)) {
			return '✓';
		}
		return this.isCheckFailed(check) ? '✗' : '●';
	}

	checkLabel(check: CheckRunDetail): string {
		if (check.conclusion) {
			return check.conclusion.replace(/_/g, ' ');
		}
		if (check.status === 'in_progress') {
			return 'in progress';
		}
		return check.status === 'queued' ? 'queued' : 'pending';
	}

	checkDuration(check: CheckRunDetail): string | null {
		void this.checkDurationTick;
		if (!check.startedAt) {
			return null;
		}
		const start = new Date(check.startedAt).getTime();
		if (check.status === 'in_progress') {
			return formatDuration(Date.now() - start);
		}
		if (check.status === 'completed' && check.completedAt) {
			const end = new Date(check.completedAt).getTime();
			return formatDuration(end - start);
		}
		return null;
	}

	get hasInProgressChecks(): boolean {
		return this.checks.some(c => c.status === 'in_progress' && c.startedAt);
	}

	@Watch('checks', { immediate : true, deep : true })
	onChecksChanged(): void {
		if (this.hasInProgressChecks) {
			this.startCheckDurationTimer();
		}
		else {
			this.stopCheckDurationTimer();
		}
		for (const check of this.checks) {
			if (this.isActionTestFailure(check) && !this.testFailureState(check)) {
				void this.loadTestFailures(check);
			}
		}
	}

	testFailureState(check: CheckRunDetail): TestFailureState | undefined {
		return this.testFailureStates[this.testFailureKey(check)];
	}

	isActionTestFailure(check: CheckRunDetail): boolean {
		return this.isCheckFailed(check) && Boolean(check.url?.includes('/actions/runs/'));
	}

	async loadTestFailures(check: CheckRunDetail): Promise<void> {
		const key              = this.testFailureKey(check);
		this.testFailureStates = { ...this.testFailureStates, [key] : { loading : true, failures : [] } };
		try {
			const failures         = await GitHubClient.fetchTestFailures(this.owner, this.repo, check);
			this.testFailureStates = { ...this.testFailureStates, [key] : { loading : false, failures } };
		}
		catch {
			this.testFailureStates = { ...this.testFailureStates, [key] : { loading : false, failures : [] } };
		}
	}

	testFailureKey(check: CheckRunDetail): string {
		return check.url || check.name;
	}

	startCheckDurationTimer(): void {
		if (this._checkDurationTimer) {
			return;
		}
		this._checkDurationTimer = setInterval(() => {
			this.checkDurationTick++;
		}, 1000);
	}

	stopCheckDurationTimer(): void {
		if (this._checkDurationTimer) {
			clearInterval(this._checkDurationTimer);
			this._checkDurationTimer = null;
		}
	}

	failureAnnotations(check: CheckRunDetail): CheckAnnotation[] {
		return !this.isCheckFailed(check) ? [] : check.annotations.filter(a => a.level === 'failure' || a.level === 'warning');
	}

	labelStyle(label: any): Record<string, string> {
		const c = `#${label.color}`;
		return { background : `${c}22`, color : c, borderColor : `${c}44` };
	}

	toggleLabelDropdown() {
		this.labelDropdownOpen = !this.labelDropdownOpen;
		this.labelSearch       = '';
	}

	toReviewSide(side: string): 'LEFT' | 'RIGHT' {
		return side === 'LEFT' ? 'LEFT' : 'RIGHT';
	}

	emitOpenReviewInFiles(thread: OverviewThread): void {
		if (thread.line == null) {
			return;
		}
		this.closeReviewReplyPopover();
		this.$emit('open-review-in-files', { path : thread.path, line : thread.line, side : this.toReviewSide(thread.side) });
	}

	openReviewReplyPopover(thread: OverviewThread, e: MouseEvent): void {
		if (thread.line == null || !thread.comments.length) {
			return;
		}
		const raw = e.currentTarget;
		let rect  = new DOMRect(24, Math.max(24, window.innerHeight * 0.15), 0, 28);
		if (raw instanceof HTMLElement) {
			rect = raw.getBoundingClientRect();
		}
		this.reviewPopoverThread = thread;
		this.reviewPopoverLine   = thread.line;
		this.reviewPopoverSide   = this.toReviewSide(thread.side);
		this.reviewPopoverAnchor = rect;
	}

	closeReviewReplyPopover(): void {
		this.reviewPopoverThread = null;
		this.reviewPopoverAnchor = null;
		this.reviewPopoverLine   = null;
		this.reviewPopoverSide   = 'RIGHT';
	}

	onReviewPopoverCommentsUpdated(): void {
		this.closeReviewReplyPopover();
		this.$emit('comments-updated');
	}

	openIssueReplyDraft(commentId: number): void {
		this.issueReplyDraftId = commentId;
		this.issueReplyBody    = '';
	}

	cancelIssueReply(): void {
		this.issueReplyDraftId = null;
		this.issueReplyBody    = '';
	}

	async submitIssueReply(): Promise<void> {
		if (!this.issueReplyBody.trim() || this.issueReplyDraftId == null || this.issueReplySubmitting) {
			return;
		}
		this.issueReplySubmitting = true;
		try {
			await GitHubClient.createIssueComment(this.owner, this.repo, this.prNumber, this.issueReplyBody.trim());
			this.issueReplyDraftId = null;
			this.issueReplyBody    = '';
			this.$emit('comments-updated');
		}
		catch (e: any) {
			console.error('Failed to create issue comment:', e);
		}
		finally {
			this.issueReplySubmitting = false;
		}
	}

	onOverviewPopoverOutside(ev: MouseEvent): void {
		if (!this.reviewPopoverThread) {
			return;
		}
		const raw              = ev.target;
		let el: Element | null = null;
		if (raw instanceof Element) {
			el = raw;
		}
		else if (raw instanceof Node) {
			el = raw.parentElement;
		}
		if (!el) {
			return;
		}
		if (el.closest('.comment-popover') || el.closest('.pr-overview-reply-hit') || el.closest('.pr-detail-thread-path-link')) {
			return;
		}
		this.closeReviewReplyPopover();
	}

	mounted() {
		document.addEventListener('mousedown', this.onOverviewPopoverOutside, true);
	}

	beforeUnmount() {
		document.removeEventListener('mousedown', this.onOverviewPopoverOutside, true);
		this.stopCheckDurationTimer();
		if (this.prUrlCopyResetId != null) {
			window.clearTimeout(this.prUrlCopyResetId);
		}
	}

	handleAddLabel(name: string) {
		this.$emit('add-label', name);
		this.labelDropdownOpen = false;
	}

	emitCheckout(): void {
		this.$emit('checkout-pr', this.showWorktreeSelector ? this.selectedWorktreePath : undefined);
	}

}
</script>

<style>
/* One spacing value: outer inset = padding; between sections = gap (each “half” meets in the middle). */
.pr-detail-overview {
	--pr-overview-section-spacing: var(--u-3);
}

.pr-detail-body-grid {
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: var(--pr-overview-section-spacing);
	padding: var(--pr-overview-section-spacing);
	box-sizing: border-box;
}

.pr-detail-overview-stack {
	gap: var(--pr-overview-section-spacing);
}

.pr-detail-action-groups {
	padding: 8px 0;
	border-block: 1px solid var(--border);
}

.pr-detail-action-row {
	min-height: 34px;
}

.pr-detail-action-row + .pr-detail-action-row {
	padding-top: 8px;
	border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
}

.pr-detail-action-label {
	width: 92px;
	text-align: left;
	line-height: 1.3;
}

.pr-detail-action-row .pr-overview-action-btn {
	border-radius: var(--radius-sm);
	font-family: inherit;
	transition: all var(--transition);
	border: 1px solid var(--border);
	background: var(--bg-primary);
	color: var(--text-secondary);
}

.pr-detail-action-row .pr-overview-action-btn:hover:not(:disabled) {
	filter: brightness(1.1);
}

.pr-detail-action-row .pr-overview-action-btn:disabled {
	background: var(--bg-primary) !important;
	color: var(--text-tertiary) !important;
	border-color: var(--border) !important;
	opacity: 0.72;
	cursor: default;
}

.pr-overview-action-approve:not(:disabled) {
	border: none !important;
	background: var(--accent-green) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-merge:not(:disabled) {
	border: none !important;
	background: var(--accent-purple) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-close:not(:disabled) {
	border: none !important;
	background: var(--accent-red) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-draft:not(:disabled) {
	border: none !important;
	background: var(--accent-orange) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-checkout:not(:disabled) {
	border: none !important;
	background: var(--accent-green) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-commit:not(:disabled) {
	border: none !important;
	background: var(--accent-blue) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-push:not(:disabled) {
	border: none !important;
	background: var(--accent-purple) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-action-merge-default:not(:disabled) {
	border: none !important;
	background: var(--accent-orange) !important;
	color: var(--btn-primary-fg) !important;
}

.pr-overview-behind-label {
	color: var(--text-tertiary);
}

.pr-overview-worktree-select {
	max-width: 260px;
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

	&:hover:not(:disabled) {
		border-color: var(--border-hover);
		color: var(--text-primary);
	}

	&:disabled {
		opacity: 0.65;
		cursor: default;
	}
}

.pr-overview-checkout-error {
	color: var(--accent-red);
}

.pr-detail-checkout-state {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pr-detail-conflict-alert {
	width: fit-content;
	padding: 6px 10px;
	border: 1px solid color-mix(in srgb, var(--accent-red) 45%, transparent);
	border-radius: var(--radius-sm);
	background: var(--danger-bg-subtle);
	color: var(--accent-red);
}

.pr-detail-conflict-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: currentColor;
}

.pr-detail-col-comments {
	min-height: 0;
}

/* Side by side, the columns share the viewport's height and scroll on their own instead of the page. */
@media (min-width: 901px) {
	.pr-detail-body-grid {
		grid-template-rows: minmax(0, 1fr);
	}

	.pr-detail-col-main {
		min-height: 0;
		overflow-y: auto;
	}

	/* Checks scroll inside their card, so the scrollbar doesn't push the card in from the edge. */
	.pr-detail-col-checks {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.pr-detail-checks {
		min-height: 0;
		max-height: 100%;
	}

	.pr-detail-checks-list {
		min-height: 0;
		overflow-y: auto;
	}

	/* The description takes whatever height Actions & stats leaves, and scrolls within it. */
	.pr-detail-description {
		flex: 1 0 200px;
		min-height: 200px;
	}

	.pr-detail-overview .pr-detail-description .pr-detail-body-text {
		flex: 1 1 0;
		min-height: 0;
		max-height: none;
	}
}

@media (max-width: 900px) {
	.pr-detail-body-grid {
		grid-template-columns: 1fr;
	}
}

.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-url,
.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-branch,
.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-checkout,
.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-author {
	display: grid;
	flex: 1 1 100%;
	grid-template-columns: 108px minmax(0, 1fr);
	align-items: center;
	column-gap: 12px;
	text-align: left;
}

.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-url > .pr-detail-stat-label,
.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-branch > .pr-detail-stat-label,
.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-checkout > .pr-detail-stat-label,
.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat-author > .pr-detail-stat-label {
	white-space: nowrap;
}

.pr-detail-overview .pr-detail-actions-stats .pr-detail-stat-grid > .pr-detail-stat:not(.pr-detail-stat-url):not(.pr-detail-stat-branch):not(.pr-detail-stat-checkout):not(.pr-detail-stat-author) {
	flex: 1 1 0;
	min-width: 0;
	text-align: center;
}

.pr-detail-page .card {
	background: var(--bg-secondary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	padding: 16px 20px;

	h2 {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-primary);
		margin-bottom: 12px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}
}

html[data-color-scheme="light"] .pr-detail-overview .card > h2 {
	margin: -16px -20px 12px;
	padding: 10px 20px;
	background: #eceef2;
	border-bottom: 1px solid var(--border);
	border-radius: var(--radius-md) var(--radius-md) 0 0;
}

.pr-detail-description .pr-detail-body-text {
	font-family: inherit;
	font-size: 14px;
	color: var(--text-secondary);
	line-height: 1.6;
	max-height: 500px;
	overflow-y: auto;
}

/* A thin pill like macOS's own; the global thumb is wider and too close to the card background to see. */
.pr-detail-description .pr-detail-body-text,
.pr-detail-checks-list {
	&::-webkit-scrollbar {
		width: 8px;
	}

	&::-webkit-scrollbar-thumb {
		border: 1px solid transparent;
		border-radius: 4px;
		background: var(--border) padding-box;

		&:hover {
			background: var(--border-hover) padding-box;
		}
	}
}

.markdown-body {
	word-wrap: break-word;

	p {
		margin: 0 0 12px;
	}

	h1,
	h2,
	h3,
	h4,
	h5,
	h6 {
		color: var(--text-primary);
		font-weight: 600;
		margin: 16px 0 8px;
		line-height: 1.3;
	}
	h1 {
		font-size: 1.5em;
		border-bottom: 1px solid var(--border);
		padding-bottom: 6px;
	}
	h2 {
		font-size: 1.3em;
		border-bottom: 1px solid var(--border);
		padding-bottom: 4px;
	}
	h3 {
		font-size: 1.15em;
	}
	h4 {
		font-size: 1em;
	}

	a {
		color: var(--accent-blue);
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}

	code {
		font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
		font-size: 0.9em;
		background: var(--bg-tertiary);
		padding: 2px 6px;
		border-radius: 4px;
	}

	pre {
		background: var(--bg-tertiary);
		border-radius: var(--radius-sm);
		padding: 12px 16px;
		overflow-x: auto;
		margin: 0 0 12px;

		code {
			background: none;
			padding: 0;
			font-size: 13px;
			line-height: 1.5;
		}
	}

	blockquote {
		margin: 0 0 12px;
		padding: 4px 16px;
		border-left: 3px solid var(--border);
		color: var(--text-tertiary);
	}

	ul,
	ol {
		padding-left: 24px;
		margin: 0 0 12px;
	}
	li {
		margin-bottom: 4px;
	}

	li input[type="checkbox"] {
		margin-right: 6px;
		vertical-align: middle;
	}

	table {
		border-collapse: collapse;
		margin: 0 0 12px;
		width: 100%;

		th,
		td {
			border: 1px solid var(--border);
			padding: 6px 12px;
			text-align: left;
			font-size: 13px;
		}
		th {
			background: var(--bg-tertiary);
			font-weight: 600;
			color: var(--text-primary);
		}
	}

	img {
		max-width: 100%;
		border-radius: var(--radius-sm);
	}

	hr {
		border: none;
		border-top: 1px solid var(--border);
		margin: 16px 0;
	}
}

.pr-detail-comments-list {
	list-style: none;
}

.pr-detail-comment-block {
	padding: 12px 14px;
	background: var(--bg-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	font-size: 13px;
}

.pr-detail-comment-resolved {
	border-color: var(--label-green-border);
	box-shadow: 0 0 0 1px var(--label-green-glow);
}

.pr-detail-resolved-title-btn {
	border: none;
	background: none;
	color: var(--text-secondary);
	line-height: 1.45;
	font-family: inherit;
	transition: color var(--transition);

	&:hover {
		color: var(--text-primary);
	}
}

.pr-detail-resolved-chevron {
	color: var(--accent-green);
}

.pr-detail-resolved-title-text {
	word-break: break-word;
}

.pr-detail-comment-issue {
	border-left: 3px solid var(--accent-blue);
}

.pr-detail-review-head {
	margin-bottom: 10px;
	padding-bottom: 8px;
	border-bottom: 1px solid var(--border);
}

.pr-detail-review-head .pr-detail-comment-thread-header {
	margin-bottom: 0;
	padding-bottom: 0;
	border-bottom: none;
}

.pr-detail-compact-btn {
	min-height: 22px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-tertiary);
	color: var(--text-secondary);
	font-family: inherit;
	line-height: 1.25;
	transition:
		border-color var(--transition),
		background var(--transition),
		color var(--transition);

	&:hover:not(:disabled) {
		border-color: var(--border-hover);
		background: var(--bg-secondary);
		color: var(--text-primary);
	}

	&:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.async-loader {
		width: 28px;
		height: 5px;
		border-radius: 3px;
	}
}

.pr-detail-comment-thread-header {
	padding-bottom: 8px;
	margin-bottom: 10px;
	border-bottom: 1px solid var(--border);
}

.pr-detail-comment-avatar {
	width: 22px;
	height: 22px;
	border-radius: 50%;
}

.pr-detail-comment-author {
	font-weight: 600;
	color: var(--text-primary);
}

.pr-detail-comment-time {
	color: var(--text-tertiary);
	font-size: 12px;
}

.pr-detail-comment-sep {
	color: var(--text-tertiary);
}

.pr-detail-comment-path {
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
	font-size: 12px;
	color: var(--text-secondary);
	word-break: break-all;
}

.pr-detail-comment-line {
	font-size: 12px;
	color: var(--text-tertiary);
}

.pr-detail-comment-badge {
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	letter-spacing: 0.4px;
	padding: 2px 6px;
	border-radius: 4px;
	background: var(--bg-tertiary);
	color: var(--text-tertiary);
}

.pr-detail-comment-issue .pr-detail-comment-badge {
	background: var(--chip-blue-bg);
	color: var(--accent-blue);
}

.pr-detail-issue-reply-btn {
	align-self: flex-start;
}

.pr-detail-comment-review .pr-detail-comment-meta .pr-detail-comment-badge {
	background: var(--chip-purple-bg);
	color: var(--accent-purple);
}

.pr-detail-comment-thread-status {
	font-size: 10px;
	font-weight: 700;
	text-transform: uppercase;
	padding: 2px 6px;
	border-radius: 4px;
}

.pr-detail-comment-thread-status.open {
	background: var(--chip-orange-bg);
	color: var(--accent-orange);
}

.pr-detail-comment-thread-status.resolved {
	background: var(--chip-green-bg);
	color: var(--accent-green);
}

.pr-detail-comment-body {
	font-size: 13px;
	color: var(--text-secondary);
	line-height: 1.55;
}

.pr-detail-comment-body :first-child {
	margin-top: 0;
}

.pr-detail-comment-review-reply + .pr-detail-comment-review-reply {
	margin-top: 12px;
	padding-top: 12px;
	border-top: 1px solid var(--border);
}

.pr-detail-check-item {
	background: var(--bg-primary);
	border-radius: var(--radius-sm);
}

.pr-detail-check-icon {
	width: 20px;
	text-align: center;
	font-weight: 700;

	&.check-passed {
		color: var(--accent-green);
	}
	&.check-failed {
		color: var(--accent-red);
	}

	&.check-pending {
		color: var(--accent-orange);
		animation: pulse 1.5s ease-in-out infinite;
	}
}

@keyframes pulse {
	0%,
	100% {
		opacity: 1;
	}
	50% {
		opacity: 0.4;
	}
}

.pr-detail-check-name {
	color: var(--text-primary);

	a {
		color: var(--accent-blue);
		text-decoration: none;

		&:hover {
			text-decoration: underline;
		}
	}
}

.pr-detail-check-conclusion {
	color: var(--text-tertiary);
	font-size: 12px;
	text-transform: capitalize;
}

.pr-detail-annotations {
	margin-top: 6px;
	padding-left: 30px;
}

.pr-detail-test-failures {
	margin-top: 6px;
	padding-left: 30px;
}

.pr-detail-annotation {
	background: var(--danger-row-bg);
	border-left: 2px solid var(--accent-red);
	border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.pr-detail-annotation-location {
	font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
	color: var(--accent-blue);
	font-size: 11px;
}

.pr-detail-annotation-title {
	color: var(--text-primary);
	font-weight: 600;
}

.pr-detail-annotation-message {
	color: var(--text-secondary);
	white-space: pre-wrap;
	word-break: break-word;
	line-height: 1.4;
}

.pr-detail-test-failure-stack {
	max-height: 220px;
	overflow: auto;
	color: var(--text-secondary);
	font-size: 11px;
	line-height: 1.4;
	white-space: pre-wrap;
}

.pr-detail-stat-grid > * {
	flex: 1;
}

.pr-detail-stat-add .pr-detail-stat-value {
	color: var(--accent-green);
}
.pr-detail-stat-del .pr-detail-stat-value {
	color: var(--accent-red);
}

.pr-detail-stat-branch-wrap {
	word-break: break-all;
}

.pr-detail-checkout-row {
	max-width: 100%;
}

.pr-detail-checkout-state {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pr-detail-open-cursor-link {
	color: var(--accent-blue);
	text-decoration: none;
	white-space: nowrap;

	&:hover {
		text-decoration: underline;
	}
}

.pr-detail-stat-url-row {
	max-width: 100%;
}

.pr-detail-stat-url-link {
	color: var(--accent-blue);
	text-decoration: none;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;

	&:hover {
		text-decoration: underline;
	}
}

.pr-detail-stat-copy-btn {
	width: 26px;
	height: 26px;
	border: 1px solid var(--border);
	border-radius: var(--radius-sm);
	background: var(--bg-primary);
	color: var(--text-secondary);
	transition:
		border-color var(--transition),
		background var(--transition),
		color var(--transition);

	&:hover {
		border-color: var(--border-hover);
		background: var(--bg-tertiary);
		color: var(--text-primary);
	}

	&.copied {
		border-color: color-mix(in srgb, var(--accent-green) 55%, var(--border));
		color: var(--accent-green);
	}
}

.pr-detail-label {
	padding: 3px 8px;
	border: 1px solid;
	border-radius: 20px;
}

.pr-detail-label-remove {
	background: none;
	border: none;
	color: inherit;
	padding: 0 0 0 2px;
	opacity: 0.6;
	transition: opacity var(--transition);

	&:hover {
		opacity: 1;
	}
}

.pr-detail-label-dropdown {
	min-width: 240px;
	background: var(--bg-primary);
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	box-shadow: var(--shadow-lg);
	max-height: 260px;
}

.pr-detail-label-search {
	background: transparent;
	border: none;
	border-bottom: 1px solid var(--border);
	color: var(--text-primary);
	outline: none;

	&::placeholder {
		color: var(--text-tertiary);
	}
}

.pr-detail-label-options {
	max-height: 200px;
}

.pr-detail-label-option {
	transition: background var(--transition);

	&:hover {
		background: var(--bg-tertiary);
	}
}

.pr-detail-label-option-empty {
	cursor: default;

	&:hover {
		background: transparent;
	}
}

.pr-detail-label-swatch {
	width: 14px;
	height: 14px;
	border-radius: 50%;
}

</style>
