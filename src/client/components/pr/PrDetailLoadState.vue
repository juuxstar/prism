<template>
	<div v-if="loading" class="pr-detail-skeleton u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden" aria-busy="true" aria-label="Loading pull request">
		<header class="pr-detail-header pr-detail-skeleton-header u-flex u-items-center u-justify-between u-py-2-5 u-px-4 u-flex-shrink-0 u-sticky u-top-0 u-z-100 u-gap-4">
			<div class="pr-detail-header-left u-flex u-items-center u-gap-2-5 u-min-w-0 u-flex-1">
				<span class="skeleton-block pr-detail-skeleton-back"></span>
				<span class="skeleton-block pr-detail-skeleton-badge"></span>
				<span class="skeleton-line pr-detail-skeleton-title"></span>
			</div>
			<div class="pr-detail-header-center u-flex u-items-center u-justify-center u-flex-1">
				<span class="skeleton-block pr-detail-skeleton-tab"></span>
			</div>
			<div class="pr-detail-header-right u-flex u-items-center u-gap-3 u-flex-1 u-justify-end">
				<span class="skeleton-line pr-detail-skeleton-link"></span>
				<span class="skeleton-block pr-detail-skeleton-avatar"></span>
			</div>
		</header>

		<div class="pr-detail-overview u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden">
			<div class="pr-detail-body-grid u-grid u-flex-1 u-min-h-0 u-overflow-y-auto u-items-stretch">
				<section class="pr-detail-col-section pr-detail-col-main pr-detail-overview-stack u-flex u-flex-col u-min-w-0">
					<div class="card pr-detail-overview-gutter u-m-0 pr-detail-skeleton-pane pr-detail-skeleton-description">
						<h2>Description</h2>
						<div class="skeleton-line pr-detail-skeleton-copy wide"></div>
						<div class="skeleton-line pr-detail-skeleton-copy"></div>
						<div class="skeleton-line pr-detail-skeleton-copy mid"></div>
						<div class="skeleton-line pr-detail-skeleton-copy short"></div>
					</div>

					<div class="card pr-detail-overview-gutter u-flex u-flex-col u-gap-3 u-m-0 pr-detail-skeleton-pane pr-detail-skeleton-actions">
						<h2>Actions &amp; stats</h2>
						<div class="pr-detail-skeleton-buttons u-flex u-flex-wrap u-gap-2">
							<span class="skeleton-block pr-detail-skeleton-button"></span>
							<span class="skeleton-block pr-detail-skeleton-button short"></span>
							<span class="skeleton-block pr-detail-skeleton-button"></span>
						</div>
						<div class="pr-detail-skeleton-stats u-flex u-flex-wrap u-gap-3">
							<span v-for="idx in 5" :key="idx" class="skeleton-block pr-detail-skeleton-stat"></span>
						</div>
					</div>

					<div class="card pr-detail-overview-gutter u-m-0 pr-detail-skeleton-pane pr-detail-skeleton-labels">
						<h2>Labels</h2>
						<div class="u-flex u-flex-wrap u-gap-1-5">
							<span class="skeleton-block pr-detail-skeleton-label"></span>
							<span class="skeleton-block pr-detail-skeleton-label short"></span>
							<span class="skeleton-block pr-detail-skeleton-label"></span>
						</div>
					</div>
				</section>

				<section class="pr-detail-col-section pr-detail-col-comments pr-detail-overview-stack u-flex u-flex-col u-min-w-0">
					<div class="card pr-detail-overview-gutter u-flex u-flex-col u-flex-1 u-min-h-0 u-overflow-hidden u-m-0 pr-detail-skeleton-pane pr-detail-skeleton-comments">
						<h2>Comments</h2>
						<div v-for="idx in 4" :key="idx" class="pr-detail-skeleton-comment">
							<div class="u-flex u-items-center u-gap-2 u-mb-2">
								<span class="skeleton-block pr-detail-skeleton-avatar small"></span>
								<span class="skeleton-line pr-detail-skeleton-comment-meta"></span>
							</div>
							<div class="skeleton-line pr-detail-skeleton-copy"></div>
							<div class="skeleton-line pr-detail-skeleton-copy short"></div>
						</div>
					</div>
				</section>

				<section class="pr-detail-col-section pr-detail-col-checks">
					<div class="card pr-detail-overview-gutter pr-detail-skeleton-pane pr-detail-skeleton-checks">
						<h2>Checks</h2>
						<div v-for="idx in 6" :key="idx" class="pr-detail-skeleton-check u-flex u-items-center u-gap-2-5">
							<span class="skeleton-block pr-detail-skeleton-check-icon"></span>
							<span class="skeleton-line pr-detail-skeleton-check-name"></span>
							<span class="skeleton-line pr-detail-skeleton-check-status"></span>
						</div>
					</div>
				</section>
			</div>
		</div>
	</div>

	<div v-else-if="error" class="pr-detail-error u-flex u-flex-col u-items-center u-justify-center u-gap-4 u-py-20 u-text-secondary">
		<p class="u-m-0">{{ error }}</p>
		<button class="btn btn-secondary" type="button" @click="emit('retry')">Retry</button>
	</div>
</template>

<script setup lang="ts">
defineProps<{ loading: boolean; error: string }>();

const emit = defineEmits<{ retry: [] }>();
</script>

<style>
.pr-detail-skeleton {
	background: var(--bg-primary);
}

.pr-detail-skeleton-pane {
	min-height: 140px;
}

.pr-detail-skeleton-description {
	min-height: 210px;
}

.pr-detail-skeleton-actions {
	min-height: 190px;
}

.pr-detail-skeleton-comments,
.pr-detail-skeleton-checks {
	min-height: 520px;
}

.pr-detail-skeleton-back {
	width: 28px;
	height: 28px;
	border-radius: var(--radius-sm);
}

.pr-detail-skeleton-badge {
	width: 58px;
	height: 22px;
	border-radius: 999px;
}

.pr-detail-skeleton-title {
	width: min(440px, 60%);
	height: 16px;
}

.pr-detail-skeleton-tab {
	width: 190px;
	height: 30px;
	border-radius: var(--radius-sm);
}

.pr-detail-skeleton-link {
	width: 74px;
	height: 14px;
}

.pr-detail-skeleton-avatar {
	width: 28px;
	height: 28px;
	border-radius: 50%;
}

.pr-detail-skeleton-avatar.small {
	width: 22px;
	height: 22px;
}

.pr-detail-skeleton-copy {
	width: 76%;
	height: 12px;
	margin-bottom: 10px;
}

.pr-detail-skeleton-copy.wide {
	width: 94%;
}

.pr-detail-skeleton-copy.mid {
	width: 62%;
}

.pr-detail-skeleton-copy.short {
	width: 38%;
}

.pr-detail-skeleton-button {
	width: 86px;
	height: 28px;
	border-radius: var(--radius-sm);
}

.pr-detail-skeleton-button.short {
	width: 64px;
}

.pr-detail-skeleton-stat {
	flex: 1 1 70px;
	min-width: 58px;
	height: 48px;
	border-radius: var(--radius-sm);
}

.pr-detail-skeleton-label {
	width: 92px;
	height: 22px;
	border-radius: 999px;
}

.pr-detail-skeleton-label.short {
	width: 64px;
}

.pr-detail-skeleton-comment {
	padding: 12px 0;
	border-bottom: 1px solid var(--border);
}

.pr-detail-skeleton-comment:last-child {
	border-bottom: none;
}

.pr-detail-skeleton-comment-meta {
	width: 45%;
	height: 11px;
}

.pr-detail-skeleton-check {
	padding: 10px 0;
	border-bottom: 1px solid var(--border);
}

.pr-detail-skeleton-check:last-child {
	border-bottom: none;
}

.pr-detail-skeleton-check-icon {
	width: 16px;
	height: 16px;
	border-radius: 50%;
}

.pr-detail-skeleton-check-name {
	flex: 1;
	height: 12px;
}

.pr-detail-skeleton-check-status {
	width: 54px;
	height: 11px;
}

@media (max-width: 900px) {
	.pr-detail-skeleton-header {
		align-items: stretch;
		flex-direction: column;
	}

	.pr-detail-skeleton-header .pr-detail-header-center,
	.pr-detail-skeleton-header .pr-detail-header-right {
		justify-content: flex-start;
	}
}
</style>
