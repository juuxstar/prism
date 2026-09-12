/**
 * Shortest-edit-script over two sequences, via Myers' O(ND) algorithm.
 *
 * Shared by the intra-line word diff (which compares tokens), the rendered-markdown block diff (which
 * compares whole rendered blocks) and the rename detector (which compares whole files), so they all
 * agree on how a change run is shaped.
 *
 * The algorithm keeps one snapshot per edit-distance step, so its memory grows with the *product* of the
 * edit distance and the input length. That is nothing for a line's worth of tokens but real for two whole
 * files, so a caller working at that size passes `maxEditDistance` and gets null rather than a heap spike
 * when the two turn out to be too far apart to be worth diffing.
 */
export function diffSequences(oldKeys: string[], newKeys: string[]): SequenceEdit[];
export function diffSequences(oldKeys: string[], newKeys: string[], maxEditDistance: number): SequenceEdit[] | null;
export function diffSequences(oldKeys: string[], newKeys: string[], maxEditDistance = Infinity): SequenceEdit[] | null {
	const n = oldKeys.length;
	const m = newKeys.length;

	if (n === 0 && m === 0) {
		return [];
	}
	if (n === 0) {
		return newKeys.map((_key, newIdx) => ({ type : 'add' as const, newIdx }));
	}
	if (m === 0) {
		return oldKeys.map((_key, oldIdx) => ({ type : 'del' as const, oldIdx }));
	}

	const max   = n + m;
	const vSize = 2 * max + 1;
	const v     = new Int32Array(vSize);
	v.fill(-1);
	const offset  = max;
	v[offset + 1] = 0;

	const trace: Int32Array[] = [];
	let reachedEnd            = false;

	outer: for (let d = 0; d <= max && d <= maxEditDistance; d++) {
		const snap = new Int32Array(vSize);
		snap.set(v);
		trace.push(snap);

		for (let k = -d; k <= d; k += 2) {
			let x: number;
			x     = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && oldKeys[x] === newKeys[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) {
				reachedEnd = true;
				break outer;
			}
		}
	}

	// Only reachable when a budget cut the search short: without one, Myers always lands by d === max.
	if (!reachedEnd) {
		return null;
	}

	const edits: SequenceEdit[] = [];
	let cx                      = n;
	let cy                      = m;

	for (let d = trace.length - 1; d > 0; d--) {
		const prev  = trace[d];
		const k     = cx - cy;
		const prevK = k === -d || (k !== d && prev[offset + k - 1] < prev[offset + k + 1]) ? k + 1 : k - 1;
		const prevX = prev[offset + prevK];
		const prevY = prevX - prevK;

		while (cx > prevX && cy > prevY) {
			cx--;
			cy--;
			edits.push({ type : 'keep', oldIdx : cx, newIdx : cy });
		}
		if (cx > prevX) {
			cx--;
			edits.push({ type : 'del', oldIdx : cx });
		}
		else if (cy > prevY) {
			cy--;
			edits.push({ type : 'add', newIdx : cy });
		}
	}
	while (cx > 0 && cy > 0) {
		cx--;
		cy--;
		edits.push({ type : 'keep', oldIdx : cx, newIdx : cy });
	}
	while (cx > 0) {
		cx--;
		edits.push({ type : 'del', oldIdx : cx });
	}
	while (cy > 0) {
		cy--;
		edits.push({ type : 'add', newIdx : cy });
	}

	edits.reverse();
	return edits;
}

export interface SequenceEdit {
	type: 'keep' | 'del' | 'add';
	oldIdx?: number;
	newIdx?: number;
}
