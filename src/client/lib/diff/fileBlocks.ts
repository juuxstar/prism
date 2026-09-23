/**
 * Groups a PR's changed files into a handful of blocks by folder, for dividers in the file list.
 *
 * Starts with every file in one block and repeatedly splits the largest block into its subfolders,
 * as long as the total stays within `maxBlocks` and no block has been split more than `maxDepth`
 * times. Folders every file in a block shares are skipped, so the first split happens where the
 * paths actually diverge. Files directly in a block's folder, and files alone in their subfolder,
 * stay behind in a leftover block under the parent's name rather than each taking a block of their own.
 *
 * Returns one label per input path, in input order: the block's folder with a trailing slash, or
 * `ROOT_BLOCK_LABEL` for files at the top of the repository.
 */
export function groupFilesIntoBlocks(paths: string[], maxBlocks = 6, maxDepth = 3): string[] {
	let blocks: Block[] = [ collapse({ prefix : [], paths, depth : 0, final : false }) ];
	while (true) {
		const blockCount = blocks.length;
		const candidates = blocks
			.filter(block => !block.final && block.depth < maxDepth && block.paths.length > 1)
			.sort((a, b) => b.paths.length - a.paths.length);
		const split = candidates
			.map(block => ({ block, children : splitOneLevel(block) }))
			.find(({ children }) => children.length > 1 && blockCount - 1 + children.length <= maxBlocks);
		if (!split) {
			break;
		}
		const target = split.block;
		blocks       = blocks.flatMap(block => block === target ? split.children : [ block ]);
	}

	const labelByPath = new Map<string, string>();
	for (const block of blocks) {
		const label = block.prefix.length ? `${block.prefix.join('/')}/` : ROOT_BLOCK_LABEL;
		for (const path of block.paths) {
			labelByPath.set(path, label);
		}
	}
	return paths.map(path => labelByPath.get(path) ?? ROOT_BLOCK_LABEL);
}

export const ROOT_BLOCK_LABEL = '(root)';

/** Splits a block by the folder one level below its prefix; see `groupFilesIntoBlocks` for the leftover rule. */
function splitOneLevel(block: Block): Block[] {
	const level              = block.prefix.length;
	const bySegment          = new Map<string, string[]>();
	const leftover: string[] = [];
	for (const path of block.paths) {
		const segments = path.split('/');
		if (segments.length - 1 <= level) {
			leftover.push(path);
			continue;
		}
		const group = bySegment.get(segments[level]) ?? [];
		group.push(path);
		bySegment.set(segments[level], group);
	}

	const children: Block[] = [];
	for (const [ segment, groupPaths ] of bySegment) {
		if (groupPaths.length < 2) {
			leftover.push(...groupPaths);
			continue;
		}
		children.push(collapse({ prefix : [ ...block.prefix, segment ], paths : groupPaths, depth : block.depth + 1, final : false }));
	}
	if (leftover.length) {
		children.push({ prefix : block.prefix, paths : leftover, depth : block.depth + 1, final : true });
	}
	return children;
}

/** Extends a block's prefix through every folder all of its files share. */
function collapse(block: Block): Block {
	const split  = block.paths.map(path => path.split('/'));
	const prefix = [ ...block.prefix ];
	while (true) {
		const level   = prefix.length;
		const segment = split[0]?.[level];
		if (segment === undefined || !split.every(segments => segments.length - 1 > level && segments[level] === segment)) {
			return { ...block, prefix };
		}
		prefix.push(segment);
	}
}

interface Block {
	/** Folder segments shared by every file in the block. */
	prefix: string[];
	paths: string[];
	/** How many splits produced this block; collapsing shared folders doesn't count. */
	depth: number;
	/** A leftover block, whose files don't share a subfolder worth splitting on. */
	final: boolean;
}
