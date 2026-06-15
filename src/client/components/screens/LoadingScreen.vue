<template>
	<section class="screen">
		<div class="pr-columns dashboard-skeleton u-grid u-gap-4 u-py-4 u-px-6 u-m-auto u-w-full u-flex-1 u-min-h-0 u-content-stretch" aria-busy="true" aria-label="Loading pull requests">
			<div class="pr-column pr-column-split">
				<div class="pr-subcolumn dashboard-skeleton-other">
					<div class="dashboard-skeleton-pane">
						<skeleton-column-title title="Other PRs" />
						<skeleton-pr-list :count="2" />
					</div>
				</div>
				<div class="pr-subcolumn">
					<div class="dashboard-skeleton-pane">
						<skeleton-column-title title="Alpha Review" />
						<skeleton-pr-list :count="3" />
					</div>
				</div>
				<div class="pr-subcolumn">
					<div class="dashboard-skeleton-pane">
						<skeleton-column-title title="Beta Review" />
						<skeleton-pr-list :count="2" />
					</div>
				</div>
			</div>
			<div class="pr-column">
				<div class="dashboard-skeleton-pane dashboard-skeleton-pane-tall">
					<skeleton-column-title title="Your Review" />
					<skeleton-pr-list :count="4" />
				</div>
			</div>
			<div class="pr-column pr-column-split">
				<div class="pr-subcolumn">
					<div class="dashboard-skeleton-pane">
						<skeleton-column-title title="Waiting on Checks" />
						<skeleton-pr-list :count="2" />
					</div>
				</div>
				<div class="pr-subcolumn">
					<div class="dashboard-skeleton-pane">
						<skeleton-column-title title="Ready to Merge" />
						<skeleton-pr-list :count="3" />
					</div>
				</div>
			</div>
		</div>
	</section>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-facing-decorator';

const SkeletonColumnTitle = {
	props    : { title : { type : String, required : true } },
	template : `
		<div class="pr-column-header u-flex u-flex-row u-items-center u-gap-2 u-py-2-5 u-px-4">
			<h2 class="pr-column-title u-m-0 u-fs-12 u-fw-600 u-text-secondary u-uppercase u-tracking-wide">{{ title }}</h2>
			<span class="pr-count dashboard-skeleton-count skeleton-block"></span>
		</div>
	`,
};

const SkeletonPrList = {
	props    : { count : { type : Number, required : true } },
	template : `
		<div class="pr-list dashboard-skeleton-list u-w-full">
			<div v-for="idx in count" :key="idx" class="dashboard-skeleton-card">
				<div class="skeleton-line dashboard-skeleton-title"></div>
				<div class="dashboard-skeleton-labels u-flex u-gap-1-5">
					<span class="skeleton-block dashboard-skeleton-label"></span>
					<span class="skeleton-block dashboard-skeleton-label short"></span>
				</div>
				<div class="dashboard-skeleton-meta u-flex u-items-center u-gap-2">
					<span class="skeleton-block dashboard-skeleton-avatar"></span>
					<span class="skeleton-line dashboard-skeleton-meta-line"></span>
				</div>
			</div>
		</div>
	`,
};

/** Board-shaped skeleton shown while PR data is being fetched. */
@Component({
	components : {
		SkeletonColumnTitle,
		SkeletonPrList,
	},
})
export default class LoadingScreen extends Vue {}
</script>

<style>
.dashboard-skeleton {
	pointer-events: none;
}

.dashboard-skeleton-pane {
	min-height: 260px;
}

.dashboard-skeleton-pane-tall {
	min-height: 520px;
}

.dashboard-skeleton-other {
	min-height: 190px;
}

.dashboard-skeleton-list {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.dashboard-skeleton-card {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 12px;
	border: 1px solid var(--border);
	border-radius: var(--radius-md);
	background: var(--bg-secondary);
}

.dashboard-skeleton-count {
	width: 22px;
	height: 16px;
	border-radius: 10px;
}

.dashboard-skeleton-title {
	width: 86%;
	height: 14px;
}

.dashboard-skeleton-label {
	width: 78px;
	height: 18px;
	border-radius: 10px;
}

.dashboard-skeleton-label.short {
	width: 52px;
}

.dashboard-skeleton-avatar {
	width: 18px;
	height: 18px;
	border-radius: 50%;
}

.dashboard-skeleton-meta-line {
	width: 46%;
	height: 10px;
}
</style>
