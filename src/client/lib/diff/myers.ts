/**
 * Shortest-edit-script over two sequences, via Myers' O(ND) algorithm.
 *
 * Shared by the intra-line word diff (which compares tokens) and the rendered-markdown block diff
 * (which compares whole rendered blocks), so both agree on how a change run is shaped.
 */
export function diffSequences(oldKeys: string[], newKeys: string[]): SequenceEdit[] {
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

	outer: for (let d = 0; d <= max; d++) {
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
				break outer;
			}
		}
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
