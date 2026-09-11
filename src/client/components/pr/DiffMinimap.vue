<template>
	<div class="diff-minimap u-relative u-overflow-hidden u-flex-shrink-0 u-cursor-pointer" ref="container" @mousedown="onMouseDown" @mousemove="onMouseMove" @mouseleave="hoverY = -1">
		<canvas ref="canvas"></canvas>
		<div class="diff-minimap-viewport" :style="viewportStyle"></div>
		<div v-if="hoverY >= 0 && !dragging" class="diff-minimap-hover" :style="{ top : hoverY + 'px', height : viewportIndicatorHeight + 'px' }"></div>
	</div>
</template>

<script lang="ts">
import { subscribeColorScheme } from '@/lib/theme/colorScheme';

import { Component, Prop, Vue, Watch } from 'vue-facing-decorator';

interface MinimapLine {
	type: 'context' | 'add' | 'del' | 'hunk';
}

function minimapLineColors(): Record<string, string> {
	const s = getComputedStyle(document.documentElement);
	const g = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
	return {
		add     : g('--diff-minimap-add', 'rgba(63, 185, 80, 0.7)'),
		del     : g('--diff-minimap-del', 'rgba(248, 81, 73, 0.7)'),
		hunk    : g('--diff-minimap-hunk', 'rgba(56, 139, 253, 0.45)'),
		context : '',
	};
}

@Component({ emits : [ 'scroll-to' ] })
export default class DiffMinimap extends Vue {

	/** Fallback single-column source when both `leftLines` and `rightLines` are empty. */
	@Prop({ default : () => [] }) readonly lines!: MinimapLine[];
	@Prop({ default : () => [] }) readonly leftLines!: MinimapLine[];
	@Prop({ default : () => [] }) readonly rightLines!: MinimapLine[];
	@Prop({ default : 0 }) readonly viewportHeight!: number;
	@Prop({ default : 0 }) readonly scrollTop!: number;
	@Prop({ default : 0 }) readonly totalContentHeight!: number;

	hoverY          = -1;
	dragging        = false;
	containerHeight = 0;

	private _resizeObserver: ResizeObserver | null = null;
	private _unsubScheme: (() => void) | null      = null;

	// Bound in `mounted`, where `this` is the live component. A class-field arrow is built on the throwaway
	// instance the decorator constructs to harvest field initializers, so reading state through its `this`
	// returns whatever the field was initialized to; only method calls reach the live component from there.
	private _onDragMove: ((e: MouseEvent) => void) | null = null;
	private _onDragEnd: (() => void) | null               = null;

	get viewportFraction(): number {
		return this.totalContentHeight <= 0 ? 1 : Math.min(1, this.viewportHeight / this.totalContentHeight);
	}

	get viewportIndicatorHeight(): number {
		return Math.max(8, this.containerHeight * this.viewportFraction);
	}

	get scrollFraction(): number {
		const scrollable = this.totalContentHeight - this.viewportHeight;
		return scrollable <= 0 ? 0 : Math.min(1, this.scrollTop / scrollable);
	}

	get viewportStyle(): Record<string, string> {
		const maxTop = this.containerHeight - this.viewportIndicatorHeight;
		const top    = maxTop * this.scrollFraction;
		return { top : `${top}px`, height : `${this.viewportIndicatorHeight}px` };
	}

	mounted() {
		this._onDragMove     = (e: MouseEvent) => this.onDragMove(e);
		this._onDragEnd      = () => this.onDragEnd();
		this._resizeObserver = new ResizeObserver(() => {
			this.updateContainerHeight();
			this.draw();
		});
		const el = this.$refs.container as HTMLElement;
		if (el) {
			this._resizeObserver.observe(el);
		}
		this.updateContainerHeight();
		this.draw();
		this._unsubScheme = subscribeColorScheme(() => this.draw());
	}

	updateContainerHeight() {
		const el             = this.$refs.container as HTMLElement | undefined;
		this.containerHeight = el?.clientHeight ?? 0;
	}

	beforeUnmount() {
		this._resizeObserver?.disconnect();
		this._unsubScheme?.();
		this._unsubScheme = null;
		this.detachDragListeners();
	}

	@Watch('lines')
	onLinesChanged() {
		this.draw();
	}

	@Watch('leftLines')
	onLeftLinesChanged() {
		this.draw();
	}

	@Watch('rightLines')
	onRightLinesChanged() {
		this.draw();
	}

	draw() {
		const canvas    = this.$refs.canvas as HTMLCanvasElement | undefined;
		const container = this.$refs.container as HTMLElement | undefined;
		if (!canvas || !container) {
			return;
		}

		const w = container.clientWidth;
		const h = container.clientHeight;
		if (w === 0 || h === 0) {
			return;
		}

		const dpr           = window.devicePixelRatio || 1;
		canvas.width        = w * dpr;
		canvas.height       = h * dpr;
		canvas.style.width  = `${w}px`;
		canvas.style.height = `${h}px`;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return;
		}
		ctx.scale(dpr, dpr);
		ctx.clearRect(0, 0, w, h);

		const LINE_COLORS = minimapLineColors();
		const left        = this.leftLines;
		const right       = this.rightLines;
		const fallback    = this.lines;
		const useDual     = left.length > 0 || right.length > 0;

		if (!useDual) {
			if (!fallback.length) {
				return;
			}
			const sliceHeight = h / fallback.length;
			for (let i = 0; i < fallback.length; i++) {
				const color = LINE_COLORS[fallback[i].type];
				if (!color) {
					continue;
				}
				ctx.fillStyle = color;
				const y       = i * sliceHeight;
				const lineH   = Math.max(1, Math.ceil(sliceHeight));
				ctx.fillRect(0, y, w, lineH);
			}
			return;
		}

		const rowCount = Math.max(left.length, right.length);
		if (rowCount === 0) {
			return;
		}

		const sliceHeight = h / rowCount;
		const half        = Math.floor(w / 2);
		const rightW      = w - half;

		for (let i = 0; i < rowCount; i++) {
			const y     = i * sliceHeight;
			const lineH = Math.max(1, Math.ceil(sliceHeight));
			if (i < left.length) {
				const color = LINE_COLORS[left[i].type];
				if (color) {
					ctx.fillStyle = color;
					ctx.fillRect(0, y, half, lineH);
				}
			}
			if (i < right.length) {
				const color = LINE_COLORS[right[i].type];
				if (color) {
					ctx.fillStyle = color;
					ctx.fillRect(half, y, rightW, lineH);
				}
			}
		}

		const neutral   = getComputedStyle(document.documentElement).getPropertyValue('--diff-minimap-neutral').trim() || 'rgba(139, 148, 158, 0.35)';
		ctx.strokeStyle = neutral;
		ctx.lineWidth   = 1;
		ctx.beginPath();
		ctx.moveTo(half + 0.5, 0);
		ctx.lineTo(half + 0.5, h);
		ctx.stroke();
	}

	onMouseMove(e: MouseEvent) {
		if (this.dragging) {
			return;
		}
		const rect  = (this.$refs.container as HTMLElement).getBoundingClientRect();
		this.hoverY = Math.max(0, Math.min(rect.height - this.viewportIndicatorHeight, e.clientY - rect.top - this.viewportIndicatorHeight / 2));
	}

	onMouseDown(e: MouseEvent) {
		e.preventDefault();
		this.dragging = true;
		this.hoverY   = -1;
		this.emitScrollFromEvent(e);
		if (this._onDragMove && this._onDragEnd) {
			document.addEventListener('mousemove', this._onDragMove);
			document.addEventListener('mouseup', this._onDragEnd);
		}
	}

	private onDragMove(e: MouseEvent) {
		if (!this.dragging) {
			return;
		}
		this.emitScrollFromEvent(e);
	}

	private onDragEnd() {
		this.dragging = false;
		this.detachDragListeners();
	}

	private detachDragListeners() {
		if (this._onDragMove) {
			document.removeEventListener('mousemove', this._onDragMove);
		}
		if (this._onDragEnd) {
			document.removeEventListener('mouseup', this._onDragEnd);
		}
	}

	emitScrollFromEvent(e: MouseEvent) {
		const container = this.$refs.container as HTMLElement;
		if (!container) {
			return;
		}
		const rect     = container.getBoundingClientRect();
		const y        = e.clientY - rect.top - this.viewportIndicatorHeight / 2;
		const maxY     = rect.height - this.viewportIndicatorHeight;
		const fraction = Math.max(0, Math.min(1, y / maxY));
		this.$emit('scroll-to', fraction);
	}

}
</script>

<style>
.diff-minimap {
	width: 26px;
	background: var(--bg-primary);
	border-left: 1px solid var(--border);
}

.diff-minimap canvas {
	display: block;
	position: absolute;
	top: 0;
	left: 0;
	width: 100%;
	height: 100%;
}

.diff-minimap-viewport {
	position: absolute;
	left: 0;
	right: 0;
	background: var(--diff-minimap-track);
	border-top: 1px solid var(--diff-minimap-track-border);
	border-bottom: 1px solid var(--diff-minimap-track-border);
	pointer-events: none;
	z-index: 1;
}

.diff-minimap-hover {
	position: absolute;
	left: 0;
	right: 0;
	background: var(--diff-minimap-faint);
	pointer-events: none;
	z-index: 1;
}
</style>
