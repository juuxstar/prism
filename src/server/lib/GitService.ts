import { execFile }                    from 'child_process';
import { readdir, readFile, stat }     from 'fs/promises';
import { basename, relative, resolve } from 'path';
import { promisify }                   from 'util';

import { bufferToBase64, bufferToText }                            from './bufferUtils.js';
import { BadGatewayError, BadRequestError, CheckoutConflictError } from './httpErrors.js';

const execFileAsync = promisify(execFile);

/**
 * Coordinates local Git checkouts used by PRism's server-side review workflow.
 */
export class GitService {

	private workspaceDir: string;
	private authorization?: unknown;
	private checkoutHostDir?: string;

	constructor(workspaceDir: string, authorization?: unknown, checkoutHostDir?: string) {
		this.workspaceDir     = workspaceDir;
		this.authorization    = authorization;
		this.checkoutHostDir  = checkoutHostDir?.trim() || undefined;
	}

	/** Strip internal checkout metadata before returning workspace status to the client. */
	serializeGitWorkspaceStatus(status: GitWorkspaceStatus): GitWorkspaceStatus {
		return {
			...status,
			checkouts : status.checkouts.map(checkout => ({
				path        : checkout.path,
				hostPath    : this.checkoutHostDir ? mapToHostCheckoutPath(checkout.path, status.workspaceDir, this.checkoutHostDir) : undefined,
				label       : checkout.label,
				branch      : checkout.branch,
				headSha     : checkout.headSha,
				dirty       : checkout.dirty,
				remoteRepos : checkout.remoteRepos,
				isMain      : checkout.isMain,
			})),
		};
	}

	/** Validate and normalize the pull request branch identity supplied by the client. */
	static requireCheckoutTarget(raw: CheckoutTarget): Required<CheckoutTarget> {
		const target = {
			headRepo : typeof raw?.headRepo === 'string' ? raw.headRepo.trim() : '',
			headRef  : typeof raw?.headRef === 'string' ? raw.headRef.trim() : '',
			headSha  : typeof raw?.headSha === 'string' ? raw.headSha.trim() : '',
		};
		if (!target.headRepo || !target.headRef || !target.headSha) {
			throw new BadRequestError('Missing pull request branch details');
		}
		if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(target.headRepo)) {
			throw new BadRequestError('Unsupported GitHub repository name');
		}
		return target;
	}

	/** Discover whether the configured workspace is a checkout or a parent of worktrees. */
	async detectGitWorkspace(): Promise<GitWorkspaceStatus> {
		const workspacePath = resolve(this.workspaceDir);
		const info          = await stat(workspacePath).catch(() => null);
		if (!info?.isDirectory()) {
			return {
				workspaceDir : workspacePath,
				mode         : 'none',
				checkouts    : [],
				error        : 'Workspace directory does not exist or is not visible to the PRism server',
			};
		}

		try {
			await execFileAsync('git', [ '--version' ], { timeout : 10_000, maxBuffer : 1024 * 1024 });
		}
		catch (error: any) {
			return {
				workspaceDir : workspacePath,
				mode         : 'none',
				checkouts    : [],
				error        : error?.code === 'ENOENT' ? 'Git is not installed in the PRism server container' : error?.message || 'Git is not available',
			};
		}

		const direct = await inspectCheckout(workspacePath, true, workspacePath);
		if (direct) {
			return { workspaceDir : workspacePath, mode : 'single', checkouts : [ direct ] };
		}

		const children                 = await readdir(workspacePath, { withFileTypes : true });
		const checkouts: GitCheckout[] = [];
		const seen                     = new Set<string>();
		for (const child of children) {
			if (!child.isDirectory()) {
				continue;
			}
			const checkout = await inspectCheckout(resolve(workspacePath, child.name), false, workspacePath);
			if (!checkout || seen.has(checkout.path)) {
				continue;
			}
			seen.add(checkout.path);
			checkouts.push(checkout);
		}
		checkouts.sort((a, b) => a.label.localeCompare(b.label));
		return {
			workspaceDir : workspacePath,
			mode         : checkouts.length ? 'worktree-parent' : 'none',
			checkouts,
			error        : checkouts.length ? undefined : 'No Git checkouts found in this directory',
		};
	}

	/** Fetch and check out a pull request branch into the selected local checkout. */
	async checkoutPullRequestBranch(rawTarget: CheckoutTarget, worktreePath: unknown): Promise<{ status: GitWorkspaceStatus; checkoutPath: string }> {
		const target = GitService.requireCheckoutTarget(rawTarget);
		const status = await this.detectGitWorkspace();
		if (!status.checkouts.length) {
			throw new BadRequestError(status.error || 'No Git checkout found for this workspace');
		}

		const existing = status.checkouts.find(checkout => matchesCheckout(checkout, target));
		if (existing) {
			return { status : this.serializeGitWorkspaceStatus(status), checkoutPath : existing.path };
		}

		const requestedPath = typeof worktreePath === 'string' ? resolve(worktreePath) : '';
		const checkout      = status.mode === 'single'
			? status.checkouts[0]
			: status.checkouts.find(item => item.path === requestedPath);

		if (!checkout) {
			throw new BadRequestError('Choose one of the detected worktree directories');
		}
		if (checkout.dirty) {
			throw new CheckoutConflictError(`${checkout.label} has uncommitted changes`);
		}

		const checkoutEnv = gitEnv(checkout);
		const fetchEnv    = gitEnvWithGithubAuth(checkout, this.authorization);
		await runGit(checkout.path, [ 'check-ref-format', '--branch', target.headRef ], checkoutEnv);
		await runGit(checkout.path, [ 'fetch', '--no-tags', `https://github.com/${target.headRepo}.git`, `refs/heads/${target.headRef}` ], fetchEnv);
		if ((await tryRunGit(checkout.path, [ 'show-ref', '--verify', '--quiet', `refs/heads/${target.headRef}` ], gitEnv(checkout))) !== null) {
			await runGit(checkout.path, [ 'checkout', target.headRef ], checkoutEnv);
			await runGit(checkout.path, [ 'merge', '--ff-only', 'FETCH_HEAD' ], checkoutEnv);
		}
		else {
			await runGit(checkout.path, [ 'checkout', '-b', target.headRef, 'FETCH_HEAD' ], checkoutEnv);
		}

		return {
			status       : this.serializeGitWorkspaceStatus(await this.detectGitWorkspace()),
			checkoutPath : checkout.path,
		};
	}

	/** Build a GitHub-style file list for current uncommitted local changes. */
	async fetchLocalPullRequestFiles(rawTarget: CheckoutTarget): Promise<LocalPrFile[]> {
		const { checkout, target } = await this.findCheckoutForTarget(rawTarget);
		const env                  = gitEnv(checkout);
		await runGit(checkout.path, [ 'cat-file', '-e', `${target.headSha}^{commit}` ], env);

		const tracked = await listChangedTrackedFiles(checkout, 'HEAD', env);
		const files   = await Promise.all(tracked.map(async file => {
			const statsRaw       = await runGit(checkout.path, [ 'diff', '--numstat', 'HEAD', '--', file.filename ], env, { trim : false });
			const firstStats     = statsRaw.split('\n').find(Boolean);
			const [ adds, dels ] = firstStats?.split('\t') ?? [];
			const additions      = parseInt(adds ?? '', 10);
			const deletions      = parseInt(dels ?? '', 10);
			const patchRaw       = await runGit(checkout.path, [ 'diff', '--find-renames', '--unified=3', 'HEAD', '--', file.filename ], env, { trim : false });
			const hunkStart      = patchRaw.indexOf('@@');
			const patch          = hunkStart < 0 ? undefined : patchRaw.slice(hunkStart).trimEnd();
			return {
				...file,
				sha       : '',
				additions : Number.isFinite(additions) ? additions : 0,
				deletions : Number.isFinite(deletions) ? deletions : 0,
				changes   : (Number.isFinite(additions) ? additions : 0) + (Number.isFinite(deletions) ? deletions : 0),
				...(patch ? { patch } : {}),
			};
		}));

		const seenPaths      = new Set(files.map(file => file.filename));
		const untrackedRaw   = await runGit(checkout.path, [ 'ls-files', '--others', '--exclude-standard', '-z' ], env, { trim : false });
		const untrackedPaths = untrackedRaw.split('\0').filter(Boolean);
		const untrackedFiles = await Promise.all(untrackedPaths.filter(path => !seenPaths.has(path)).map(async path => {
			const content = bufferToText(await readFile(resolveWorktreePath(checkout, path)).catch(() => null));
			let additions = 0;
			if (content) {
				additions = content.endsWith('\n') ? content.split('\n').length - 1 : content.split('\n').length;
			}
			return {
				sha       : '',
				filename  : path,
				status    : 'added',
				additions,
				deletions : 0,
				changes   : additions,
			};
		}));

		return [ ...files, ...untrackedFiles ].sort((a, b) => a.filename.localeCompare(b.filename));
	}

	/** Return base/head file contents from Git and the local worktree for diff viewing. */
	async fetchLocalPullRequestFileContent(
		rawTarget: CheckoutTarget,
		rawPath: unknown,
		rawPreviousPath: unknown,
		rawStatus: unknown
	): Promise<LocalPrFileContent> {
		const { checkout, target } = await this.findCheckoutForTarget(rawTarget);
		const env                  = gitEnv(checkout);
		await runGit(checkout.path, [ 'cat-file', '-e', `${target.headSha}^{commit}` ], env);
		await runGit(checkout.path, [ 'cat-file', '-e', 'HEAD^{commit}' ], env);

		const path         = requireRelativePath(rawPath);
		const previousPath = typeof rawPreviousPath === 'string' && rawPreviousPath ? requireRelativePath(rawPreviousPath) : path;
		const status       = typeof rawStatus === 'string' ? rawStatus : '';
		const mediaPaths   = [ path, previousPath ];
		const isMedia      = mediaPaths.some(mediaPath => {
			const base = mediaPath.split('/').pop() ?? mediaPath;
			const dot  = base.lastIndexOf('.');
			return dot >= 0 && RENDERABLE_MEDIA_EXTENSIONS.has(base.slice(dot + 1).toLowerCase());
		});

		if (isMedia) {
			const [ base, head ] = await Promise.all([
				status === 'added'
					? Promise.resolve(null)
					: runGit(checkout.path, [ 'show', `HEAD:${previousPath}` ], env, { encoding : 'buffer' }).then(bufferToBase64).catch(() => null),
				status === 'removed'
					? Promise.resolve(null)
					: readFile(resolveWorktreePath(checkout, path)).then(bufferToBase64).catch(() => null),
			]);
			return { base, head, encoding : 'base64' };
		}

		const [ base, head ] = await Promise.all([
			status === 'added'
				? Promise.resolve(null)
				: runGit(checkout.path, [ 'show', `HEAD:${previousPath}` ], env, { encoding : 'buffer' }).then(bufferToText).catch(() => null),
			status === 'removed'
				? Promise.resolve(null)
				: readFile(resolveWorktreePath(checkout, path)).then(bufferToText).catch(() => null),
		]);
		return { base, head, encoding : 'text' };
	}

	/** Report whether the local checkout has uncommitted or unpushed changes. */
	async fetchLocalPullRequestStatus(rawTarget: CheckoutTarget): Promise<LocalPrStatus> {
		const { checkout, target } = await this.findCheckoutForTarget(rawTarget);
		const env                  = gitEnv(checkout);
		await runGit(checkout.path, [ 'cat-file', '-e', `${target.headSha}^{commit}` ], env);
		const [ dirtyRaw, aheadRaw ] = await Promise.all([
			runGit(checkout.path, [ 'status', '--porcelain' ], env, { trim : false }),
			runGit(checkout.path, [ 'rev-list', '--count', `${target.headSha}..HEAD` ], env),
		]);
		const aheadCount = parseInt(aheadRaw, 10);
		return {
			hasLocalChanges    : dirtyRaw.trim().length > 0,
			hasUnpushedCommits : Number.isFinite(aheadCount) && aheadCount > 0,
			aheadCount         : Number.isFinite(aheadCount) ? aheadCount : 0,
			checkoutPath       : checkout.path,
		};
	}

	/** Commit all local pull request changes using the authenticated GitHub user identity. */
	async commitLocalPullRequestChanges(rawTarget: CheckoutTarget, rawMessage: unknown): Promise<LocalPrStatus> {
		const { checkout, target } = await this.findCheckoutForTarget(rawTarget);
		const env                  = await gitEnvWithGithubIdentity(checkout, this.authorization);
		const message              = typeof rawMessage === 'string' ? rawMessage.trim() : '';
		if (!message) {
			throw new BadRequestError('Commit message is required');
		}
		await runGit(checkout.path, [ 'add', '-A' ], env);
		const dirtyRaw = await runGit(checkout.path, [ 'status', '--porcelain' ], env, { trim : false });
		if (!dirtyRaw.trim()) {
			throw new BadRequestError('There are no local changes to commit');
		}
		await runGit(checkout.path, [ 'commit', '-m', message ], env);
		return this.fetchLocalPullRequestStatus(target);
	}

	/** Push local commits back to the pull request source branch. */
	async pushLocalPullRequestChanges(rawTarget: CheckoutTarget): Promise<LocalPrStatus> {
		const { checkout, target } = await this.findCheckoutForTarget(rawTarget);
		const env                  = gitEnvWithGithubAuth(checkout, this.authorization);
		const status               = await this.fetchLocalPullRequestStatus(target);
		if (!status.hasUnpushedCommits) {
			throw new BadRequestError('There are no committed changes to push');
		}
		await runGit(checkout.path, [ 'push', `https://github.com/${target.headRepo}.git`, `HEAD:refs/heads/${target.headRef}` ], env);
		return {
			...status,
			hasUnpushedCommits : false,
			aheadCount         : 0,
		};
	}

	private async findCheckoutForTarget(rawTarget: CheckoutTarget): Promise<{ checkout: GitCheckout; target: Required<CheckoutTarget> }> {
		const target = GitService.requireCheckoutTarget(rawTarget);
		const status = await this.detectGitWorkspace();
		if (!status.checkouts.length) {
			throw new BadRequestError(status.error || 'No Git checkout found for this workspace');
		}
		const checkout = status.checkouts.find(item => matchesCheckout(item, target));
		if (!checkout) {
			throw new BadRequestError('Check out this pull request before reviewing local files');
		}
		return { checkout, target };
	}

}

export { CheckoutConflictError };

async function listChangedTrackedFiles(checkout: GitCheckout, sha: string, env?: NodeJS.ProcessEnv): Promise<{ filename: string; status: string; previous_filename?: string }[]> {
	const raw    = await runGit(checkout.path, [ 'diff', '--name-status', '--find-renames', '-z', sha, '--' ], env, { trim : false });
	const tokens = raw.split('\0').filter(Boolean);
	const files: { filename: string; status: string; previous_filename?: string }[] = [];
	for (let i = 0; i < tokens.length;) {
		const code = tokens[i++];
		if (!code) {
			continue;
		}
		if (code.startsWith('R')) {
			const previous = tokens[i++];
			const current  = tokens[i++];
			if (previous && current) {
				files.push({ filename : current, previous_filename : previous, status : 'renamed' });
			}
			continue;
		}
		if (code.startsWith('C')) {
			const previous = tokens[i++];
			const current  = tokens[i++];
			if (previous && current) {
				files.push({ filename : current, previous_filename : previous, status : 'copied' });
			}
			continue;
		}
		const path = tokens[i++];
		if (!path) {
			continue;
		}
		let status = 'modified';
		switch (code[0]) {
			case 'A':
				status = 'added';
				break;
			case 'D':
				status = 'removed';
				break;
		}
		files.push({ filename : path, status });
	}
	return files;
}

function requireRelativePath(rawPath: unknown): string {
	if (typeof rawPath !== 'string' || !rawPath) {
		throw new BadRequestError('Missing file path');
	}
	if (rawPath.includes('\0') || rawPath.startsWith('/') || rawPath.split('/').includes('..')) {
		throw new BadRequestError('Unsupported file path');
	}
	return rawPath;
}

function resolveWorktreePath(checkout: GitCheckout, path: string): string {
	const absolute = resolve(checkout.path, path);
	const rel      = relative(checkout.path, absolute);
	if (rel.startsWith('..') || rel === '..' || resolve(checkout.path, rel) !== absolute) {
		throw new BadRequestError('Unsupported file path');
	}
	return absolute;
}

const RENDERABLE_MEDIA_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif', 'pdf',
]);

function gitEnv(checkout: Pick<GitCheckout, 'gitDir' | 'workTree'>): NodeJS.ProcessEnv | undefined {
	if (!checkout.gitDir || !checkout.workTree) {
		return undefined;
	}
	return { ...process.env, GIT_DIR : checkout.gitDir, GIT_WORK_TREE : checkout.workTree };
}

function gitEnvWithGithubAuth(checkout: Pick<GitCheckout, 'gitDir' | 'workTree'>, authorization: unknown): NodeJS.ProcessEnv | undefined {
	const env   = gitEnv(checkout) || process.env;
	const token = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() : '';
	if (!token) {
		return env === process.env ? undefined : env;
	}
	const basicAuth = Buffer.from(`x-access-token:${token}`, 'utf8').toString('base64');
	return {
		...env,
		GIT_CONFIG_COUNT   : '1',
		GIT_CONFIG_KEY_0   : 'http.https://github.com/.extraheader',
		GIT_CONFIG_VALUE_0 : `Authorization: Basic ${basicAuth}`,
	};
}

async function gitEnvWithGithubIdentity(checkout: Pick<GitCheckout, 'gitDir' | 'workTree'>, authorization: unknown): Promise<NodeJS.ProcessEnv | undefined> {
	const env   = gitEnvWithGithubAuth(checkout, authorization) || process.env;
	const token = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || '' : '';
	if (!token) {
		return env === process.env ? undefined : env;
	}
	const user = await fetchGithubUserForGitIdentity(token);
	return {
		...env,
		GIT_AUTHOR_NAME     : user.name,
		GIT_AUTHOR_EMAIL    : user.email,
		GIT_COMMITTER_NAME  : user.name,
		GIT_COMMITTER_EMAIL : user.email,
	};
}

async function fetchGithubUserForGitIdentity(token: string): Promise<{ name: string; email: string }> {
	const response = await fetch('https://api.github.com/user', {
		headers : {
			'Accept'        : 'application/vnd.github+json',
			'Authorization' : `Bearer ${token}`,
			'User-Agent'    : 'PRism',
		},
	});
	if (!response.ok) {
		throw new BadGatewayError(`Could not load GitHub user for git commit identity (${response.status})`);
	}
	const user  = await response.json() as { id?: number; login?: string; name?: string | null; email?: string | null };
	const login = typeof user.login === 'string' && user.login ? user.login : 'github-user';
	const name  = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : login;
	const email = typeof user.email === 'string' && user.email.trim()
		? user.email.trim()
		: `${user.id || login}+${login}@users.noreply.github.com`;
	return { name, email };
}

async function runGit(cwd: string, args: string[], env: NodeJS.ProcessEnv | undefined, options: GitRunBufferOptions): Promise<Buffer>;
async function runGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv, options?: GitRunTextOptions): Promise<string>;
async function runGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv, options: GitRunOptions = {}): Promise<string | Buffer> {
	const encoding  = options.encoding || 'utf8';
	const maxBuffer = options.maxBuffer || (encoding === 'buffer' ? 10 * 1024 * 1024 : 1024 * 1024);
	try {
		const { stdout } = await execFileAsync('git', [ '-c', 'safe.directory=*', '-C', cwd, ...args ], {
			timeout : 30_000,
			maxBuffer,
			env,
			encoding,
		});
		if (options.encoding === 'buffer') {
			return Buffer.isBuffer(stdout) ? stdout : Buffer.from(String(stdout ?? ''));
		}
		const output = String(stdout ?? '');
		return options.trim === false ? output : output.trim();
	}
	catch (error: any) {
		const stderr = gitOutputToString(error.stderr).trim();
		const stdout = gitOutputToString(error.stdout).trim();
		const msg    = stderr || stdout || error.message || 'Git command failed';
		throw new BadRequestError(msg, { cause : error });
	}
}

function gitOutputToString(output: unknown): string {
	if (Buffer.isBuffer(output)) {
		return output.toString('utf8');
	}
	return typeof output === 'string' ? output : '';
}

async function tryRunGit(cwd: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string | null> {
	try {
		return await runGit(cwd, args, env);
	}
	catch {
		return null;
	}
}

function normalizeGithubRepo(url: string): string | null {
	const trimmed = url.trim().replace(/\.git$/, '').replace(/\/$/, '');
	const match   = trimmed.match(/github\.com[:/]([^/\s:]+)\/([^/\s]+)$/i);
	if (!match) {
		return null;
	}
	return `${match[1]}/${match[2]}`.toLowerCase();
}

async function resolveMountedWorktreeGitEnv(path: string, workspacePath: string): Promise<NodeJS.ProcessEnv | undefined> {
	const dotGitPath = resolve(path, '.git');
	const dotGitInfo = await stat(dotGitPath).catch(() => null);
	if (!dotGitInfo?.isFile()) {
		return undefined;
	}

	const dotGit = await readFile(dotGitPath, 'utf8').catch(() => '');
	const match  = dotGit.match(/^gitdir:\s*(.+)\s*$/m);
	if (!match) {
		return undefined;
	}

	const worktreeName = basename(match[1]);
	const children     = await readdir(workspacePath, { withFileTypes : true }).catch(() => []);
	for (const child of children) {
		if (!child.isDirectory()) {
			continue;
		}
		const candidate = resolve(workspacePath, child.name, '.git', 'worktrees', worktreeName);
		const info      = await stat(candidate).catch(() => null);
		if (info?.isDirectory()) {
			return { ...process.env, GIT_DIR : candidate, GIT_WORK_TREE : path };
		}
	}
	return undefined;
}

async function inspectCheckout(path: string, isMain: boolean, workspacePath: string): Promise<GitCheckout | null> {
	const translatedEnv = await resolveMountedWorktreeGitEnv(path, workspacePath);
	const topLevel      = await tryRunGit(path, [ 'rev-parse', '--show-toplevel' ], translatedEnv);
	if (!topLevel) {
		return null;
	}
	const checkoutPath                                 = resolve(topLevel);
	const env: NodeJS.ProcessEnv | undefined           = translatedEnv ? { ...translatedEnv, GIT_WORK_TREE : checkoutPath } : undefined;
	const [ branchRaw, headSha, dirtyRaw, remotesRaw ] = await Promise.all([
		tryRunGit(checkoutPath, [ 'branch', '--show-current' ], env),
		runGit(checkoutPath, [ 'rev-parse', 'HEAD' ], env),
		runGit(checkoutPath, [ 'status', '--porcelain' ], env),
		tryRunGit(checkoutPath, [ 'remote', '-v' ], env),
	]);
	const remoteRepos = [
		...new Set(
			(remotesRaw || '')
				.split('\n')
				.map(line => line.split(/\s+/)[1] || '')
				.map(normalizeGithubRepo)
				.filter((repo): repo is string => Boolean(repo))
		),
	];
	return {
		path     : checkoutPath,
		label    : isMain ? 'main directory' : basename(checkoutPath),
		branch   : branchRaw || 'HEAD',
		headSha,
		dirty    : dirtyRaw.length > 0,
		remoteRepos,
		isMain,
		gitDir   : env?.GIT_DIR,
		workTree : env?.GIT_WORK_TREE,
	};
}

function matchesCheckout(checkout: GitCheckout, target: Required<CheckoutTarget>): boolean {
	const repo = target.headRepo.toLowerCase();
	return checkout.headSha === target.headSha || (checkout.branch === target.headRef && (checkout.remoteRepos.includes(repo) || checkout.remoteRepos.length === 0));
}

function mapToHostCheckoutPath(containerPath: string, workspaceDir: string, hostDir: string): string {
	const resolvedWorkspace = resolve(workspaceDir);
	const resolvedPath      = resolve(containerPath);
	const relativePath      = relative(resolvedWorkspace, resolvedPath);
	if (relativePath.startsWith('..') || resolve(resolvedWorkspace, relativePath) !== resolvedPath) {
		return resolvedPath;
	}
	return resolve(hostDir, relativePath);
}

export interface GitCheckout {
	path: string;
	hostPath?: string;
	label: string;
	branch: string;
	headSha: string;
	dirty: boolean;
	remoteRepos: string[];
	isMain: boolean;
	gitDir?: string;
	workTree?: string;
}

export interface GitWorkspaceStatus {
	workspaceDir: string;
	mode: 'none' | 'single' | 'worktree-parent';
	checkouts: GitCheckout[];
	error?: string;
}

export interface CheckoutTarget {
	headRepo?: string;
	headRef?: string;
	headSha?: string;
}

export interface LocalPrFile {
	sha: string;
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	changes: number;
	patch?: string;
	previous_filename?: string;
}

export interface LocalPrFileContent {
	base: string | null;
	head: string | null;
	encoding?: 'text' | 'base64';
}

export interface LocalPrStatus {
	hasLocalChanges: boolean;
	hasUnpushedCommits: boolean;
	aheadCount: number;
	checkoutPath: string;
}

interface GitRunTextOptions {
	encoding?: 'utf8';
	trim?: boolean;
	maxBuffer?: number;
}

interface GitRunBufferOptions {
	encoding: 'buffer';
	maxBuffer?: number;
}

type GitRunOptions = GitRunTextOptions | GitRunBufferOptions;
